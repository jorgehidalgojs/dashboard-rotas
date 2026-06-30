import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import 'leaflet.markercluster'
import {
  Crosshair,
  LocateFixed,
  Maximize2,
  Navigation,
  Route,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'

const MAP_CENTER = [-25.965, 32.575]
const ROUTING_BASE_URL = (import.meta.env.VITE_ROUTING_URL || 'https://router.project-osrm.org').replace(/\/$/, '')

const STATUS_META = {
  running: { color: '#10b981', label: 'Rota / movimento' },
  stop: { color: '#f59e0b', label: 'Parado' },
  outside: { color: '#ef4444', label: 'Fora de rota' },
  offline: { color: '#94a3b8', label: 'Offline' },
  done: { color: '#0a84ff', label: 'Feito' },
  partial: { color: '#8b5cf6', label: 'Parcial' },
  planned: { color: '#64748b', label: 'Planeado' },
}

function validCoord(lat, lng) {
  return Number(lat) !== 0 && Number(lng) !== 0 && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))
}

function waypointSignature(waypoints) {
  return waypoints
    .filter(([lat, lng]) => validCoord(lat, lng))
    .map(([lat, lng]) => `${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`)
    .join('|')
}

function routeSignature(route, anchorPoint = null) {
  const waypoints = routeWaypoints(route, anchorPoint)
  return `${route.id || route.name || 'route'}:${waypointSignature(waypoints)}`
}

function routeWaypoints(route, anchorPoint = null) {
  const stopPoints = (route.stops || [])
    .filter((stop) => validCoord(stop.lat, stop.lng))
    .sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0))
    .map((stop) => [Number(stop.lat), Number(stop.lng)])
  const hasAnchor = anchorPoint && validCoord(anchorPoint.lat, anchorPoint.lng)

  if (stopPoints.length <= 1 && hasAnchor) {
    const anchor = [Number(anchorPoint.lat), Number(anchorPoint.lng)]
    if (!stopPoints.length) return [anchor]
    const [stopLat, stopLng] = stopPoints[0]
    const samePoint =
      Number(anchor[0]).toFixed(5) === Number(stopLat).toFixed(5) &&
      Number(anchor[1]).toFixed(5) === Number(stopLng).toFixed(5)
    return samePoint ? stopPoints : [anchor, ...stopPoints]
  }

  return stopPoints
}

function fallbackRouteLine(route, anchorPoint = null) {
  const points = routeWaypoints(route, anchorPoint)
  return {
    ...route,
    signature: routeSignature(route, anchorPoint),
    waypoints: points,
    points,
    isRoadRouted: false,
  }
}

async function fetchRoadRoute(route, signal) {
  const waypoints = (route.waypoints || routeWaypoints(route)).filter(([lat, lng]) => validCoord(lat, lng))

  if (waypoints.length < 2) return []

  // OSRM accepts max 100 waypoints; if more, sample evenly keeping first and last
  const capped = waypoints.length > 100
    ? [waypoints[0], ...waypoints.slice(1, 99).filter((_, i) => i % Math.ceil(waypoints.length / 98) === 0), waypoints[waypoints.length - 1]]
    : waypoints

  const coordinates = capped.map(([lat, lng]) => `${Number(lng)},${Number(lat)}`).join(';')
  const response = await fetch(
    `${ROUTING_BASE_URL}/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`,
    { signal },
  )

  if (!response.ok) throw new Error(`Routing failed with status ${response.status}`)

  const payload = await response.json()
  if (payload.code !== 'Ok') return []
  const geometry = payload?.routes?.[0]?.geometry?.coordinates || []
  return geometry.map(([lng, lat]) => [lat, lng]).filter(([lat, lng]) => validCoord(lat, lng))
}

function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean)
  return (parts[0]?.[0] || 'M') + (parts[1]?.[0] || '')
}

const MAP_FILTERS = [
  { key: 'stops', label: 'Pontos' },
  { key: 'routes', label: 'Linhas' },
]

// ─── Icon caches ─────────────────────────────────────────────────────────────

const vehicleIconCache = new Map()

function vehicleIcon(item, selected = false) {
  const meta = STATUS_META[item.status] || STATUS_META.offline
  const course = Number.isFinite(Number(item.course)) ? Number(item.course) : 0
  // Round speed to nearest 5 to reduce cache churn on every GPS update
  const speedBucket = Math.round((item.speed || 0) / 5) * 5
  const iconKey = [
    item.status,
    selected ? 'selected' : 'normal',
    item.plate || item.vehicleName || '',
    speedBucket,
    Math.round(course),
  ].join('|')

  if (vehicleIconCache.has(iconKey)) return vehicleIconCache.get(iconKey)

  const icon = L.divIcon({
    className: '',
    html: `
      <div class="vehicle-marker ${selected ? 'vehicle-marker--selected' : ''}" style="--marker-color:${meta.color};">
        <div class="vehicle-marker__halo"></div>
        <div class="vehicle-marker__navigation">
          <div class="vehicle-marker__arrow" style="transform:rotate(${course}deg);"></div>
          <span class="vehicle-marker__status"></span>
        </div>
        <div class="vehicle-marker__plate">${item.plate || item.vehicleName || ''}</div>
        <div class="vehicle-marker__speed">${speedBucket} km/h</div>
      </div>
    `,
    iconSize: [82, 64],
    iconAnchor: [41, 32],
    popupAnchor: [0, -25],
  })

  if (vehicleIconCache.size > 400) vehicleIconCache.clear()
  vehicleIconCache.set(iconKey, icon)
  return icon
}

const stopIconCache = new Map()

function sequenceStopIcon(stop, routeColor = '#0a84ff') {
  const key = `${stop.sequence}:${routeColor}`
  if (stopIconCache.has(key)) return stopIconCache.get(key)

  const icon = L.divIcon({
    className: '',
    html: `
      <div class="sequence-stop" style="--sequence-color:${routeColor};">
        <span>${stop.sequence || ''}</span>
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18],
  })

  if (stopIconCache.size > 500) stopIconCache.clear()
  stopIconCache.set(key, icon)
  return icon
}

// ─── Popup HTML (string-based to avoid per-marker React roots) ────────────────

function buildPopupHtml(item) {
  const statusLabel = STATUS_META[item.status]?.label || item.status
  const abbr = initials(item.driverName).toUpperCase()
  const imgTag = item.driverPhotoUrl
    ? `<img src="${item.driverPhotoUrl}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:12px;" onerror="this.style.display='none'" />`
    : ''

  return `
    <div style="min-width:240px;font-family:inherit">
      <div style="display:flex;align-items:center;gap:10px;padding-bottom:10px;border-bottom:1px solid #f1f5f9">
        <div style="position:relative;width:42px;height:42px;border-radius:12px;background:#dbeafe;display:grid;place-items:center;font-size:13px;font-weight:900;color:#0a84ff;overflow:hidden;flex-shrink:0">
          <span>${abbr}</span>${imgTag}
        </div>
        <div style="min-width:0">
          <div style="font-size:13px;font-weight:900;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${item.driverName}</div>
          <div style="font-size:11px;font-weight:600;color:#64748b;margin-top:2px">${item.vehicleName || 'Viatura'} · ${item.plate || 'sem matrícula'}</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:10px">
        <div style="background:#f1f5f9;border-radius:8px;padding:6px">
          <div style="font-size:10px;font-weight:700;color:#64748b">Estado</div>
          <div style="font-size:11px;font-weight:900;color:#0f172a">${statusLabel}</div>
        </div>
        <div style="background:#f1f5f9;border-radius:8px;padding:6px">
          <div style="font-size:10px;font-weight:700;color:#64748b">Velocidade</div>
          <div style="font-size:11px;font-weight:900;color:#0f172a">${Math.round(item.speed || 0)} km/h</div>
        </div>
        <div style="background:#f1f5f9;border-radius:8px;padding:6px">
          <div style="font-size:10px;font-weight:700;color:#64748b">Direção</div>
          <div style="font-size:11px;font-weight:900;color:#0f172a">${Math.round(item.course || 0)}°</div>
        </div>
        <div style="background:#f1f5f9;border-radius:8px;padding:6px;grid-column:span 2">
          <div style="font-size:10px;font-weight:700;color:#64748b">Rota</div>
          <div style="font-size:11px;font-weight:900;color:#0f172a">${item.routeName || '-'}</div>
        </div>
      </div>
    </div>
  `
}

// ─── Map utility hooks ────────────────────────────────────────────────────────

function FitToData({ positions, centerSignal }) {
  const map = useMap()
  const positionsRef = useRef(positions)
  positionsRef.current = positions
  const didInitialFitRef = useRef(false)
  const lastCenterSignalRef = useRef(0)

  // Initial fit — only once, when vehicle data first arrives
  useEffect(() => {
    if (didInitialFitRef.current || !positions.length) return
    didInitialFitRef.current = true
    map.fitBounds(L.latLngBounds(positions).pad(0.18), { animate: false, maxZoom: 13 })
  }, [map, positions])

  // Manual "Centrar" button — reads positions via ref (no re-run on data refresh)
  useEffect(() => {
    if (!centerSignal || lastCenterSignalRef.current === centerSignal) return
    lastCenterSignalRef.current = centerSignal
    if (!positionsRef.current.length) return
    map.fitBounds(L.latLngBounds(positionsRef.current).pad(0.18), { animate: true, duration: 0.8, maxZoom: 13 })
  }, [centerSignal, map])

  return null
}

// Fits the map to the selected driver's route stops + vehicle position when
// the selection changes. Fires once per selection, not on every data refresh.
function SelectedDriverFit({ selectedDriverId, selectedItem, selectedRoute }) {
  const map = useMap()
  const lastIdRef = useRef(null)

  useEffect(() => {
    if (!selectedDriverId) {
      lastIdRef.current = null
      return
    }
    if (lastIdRef.current === selectedDriverId) return
    lastIdRef.current = selectedDriverId

    const points = []
    if (selectedItem && validCoord(selectedItem.lat, selectedItem.lng)) {
      points.push([Number(selectedItem.lat), Number(selectedItem.lng)])
    }
    for (const stop of selectedRoute?.stops || []) {
      if (validCoord(stop.lat, stop.lng)) points.push([Number(stop.lat), Number(stop.lng)])
    }

    if (!points.length) return

    if (points.length === 1) {
      map.flyTo(points[0], Math.max(map.getZoom(), 15), { animate: true, duration: 0.8 })
      return
    }

    map.fitBounds(L.latLngBounds(points).pad(0.25), { animate: true, duration: 0.9, maxZoom: 16 })
  }, [map, selectedDriverId, selectedItem, selectedRoute])

  return null
}

function SelectedVehicleFocus({ followSignal = 0, followVehicle, selectedDriverId, selectedItem }) {
  const map = useMap()
  const lastFocusedPositionRef = useRef(null)
  const lastFollowSignalRef = useRef(0)

  useEffect(() => {
    if (!followVehicle || !selectedDriverId || !selectedItem) {
      lastFocusedPositionRef.current = null
      return
    }

    const nextFocusedPosition = `${selectedDriverId}:${Number(selectedItem.lat).toFixed(6)},${Number(selectedItem.lng).toFixed(6)}`
    const hasNewFollowSignal = Boolean(followSignal) && lastFollowSignalRef.current !== followSignal

    if (!hasNewFollowSignal && lastFocusedPositionRef.current === nextFocusedPosition) return

    if (hasNewFollowSignal) lastFollowSignalRef.current = followSignal
    lastFocusedPositionRef.current = nextFocusedPosition
    map.flyTo([selectedItem.lat, selectedItem.lng], hasNewFollowSignal ? 16 : Math.max(map.getZoom(), 15), {
      animate: true,
      duration: 0.75,
    })
  }, [followSignal, followVehicle, map, selectedDriverId, selectedItem])

  return null
}

function MapCommandHandler({ command, positions }) {
  const map = useMap()

  useEffect(() => {
    if (!command) return

    if (command.type === 'zoomIn') map.zoomIn()
    if (command.type === 'zoomOut') map.zoomOut()

    if (command.type === 'locate') {
      if (!navigator.geolocation) {
        map.flyTo(MAP_CENTER, 13, { animate: true, duration: 0.7 })
        return
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => map.flyTo([pos.coords.latitude, pos.coords.longitude], 15, { animate: true, duration: 0.8 }),
        () => map.flyTo(MAP_CENTER, 13, { animate: true, duration: 0.7 }),
        { enableHighAccuracy: true, timeout: 3500 },
      )
    }

    if (command.type === 'routes' && positions.length) {
      map.fitBounds(L.latLngBounds(positions).pad(0.18), { animate: true, duration: 0.8, maxZoom: 14 })
    }
  }, [command, map, positions])

  return null
}

// ─── Imperative vehicle layer ─────────────────────────────────────────────────
// Bypasses React reconciliation for 180+ markers — updates only position and
// icon on each data refresh instead of diffing 180 React components.

const VehicleLayerManager = memo(function VehicleLayerManager({
  tracking,
  selectedDriverId,
  hoveredDriverId,
  driverById,
  onSelectDriver,
}) {
  const map = useMap()
  const groupRef = useRef(null)
  const markersRef = useRef(new Map()) // String(driverId) -> { marker, wasSelected }
  const onSelectRef = useRef(onSelectDriver)

  useEffect(() => {
    onSelectRef.current = onSelectDriver
  }, [onSelectDriver])

  useEffect(() => {
    const group = L.markerClusterGroup({
      maxClusterRadius: 48,
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      disableClusteringAtZoom: 16,
      iconCreateFunction(cluster) {
        const count = cluster.getChildCount()
        return L.divIcon({
          className: '',
          html: `<div style="width:40px;height:40px;border-radius:50%;background:#0a84ff;border:3px solid #fff;display:grid;place-items:center;font:900 13px Inter,Arial,sans-serif;color:#fff;box-shadow:0 4px 12px rgba(10,132,255,.4)">${count}</div>`,
          iconSize: [40, 40],
          iconAnchor: [20, 20],
        })
      },
    }).addTo(map)
    groupRef.current = group
    return () => {
      group.remove()
      markersRef.current.clear()
    }
  }, [map])

  useEffect(() => {
    const group = groupRef.current
    if (!group) return

    const markers = markersRef.current
    const seen = new Set()

    for (const item of tracking) {
      const id = String(item.driverId)
      seen.add(id)

      const driver = driverById.get(id)
      const displayItem = {
        ...item,
        status: driver?.status || item.status,
        driverPhotoUrl: driver?.photoUrl || item.driverPhotoUrl,
      }
      const selected = id === String(selectedDriverId)
      const highlighted = selected || id === String(hoveredDriverId)
      const icon = vehicleIcon(displayItem, highlighted)

      const entry = markers.get(id)
      if (entry) {
        if (entry.lat !== item.lat || entry.lng !== item.lng) {
          entry.marker.setLatLng([item.lat, item.lng])
          entry.lat = item.lat
          entry.lng = item.lng
        }
        if (entry.icon !== icon) {
          entry.marker.setIcon(icon)
          entry.icon = icon
        }
        const nextZ = highlighted ? 1000 : 0
        if (entry.zIndex !== nextZ) {
          entry.marker.setZIndexOffset(nextZ)
          entry.zIndex = nextZ
        }
        if (!selected && entry.wasSelected) entry.marker.closePopup()
        entry.wasSelected = selected
        if (selected && entry.marker.isPopupOpen()) {
          entry.marker.setPopupContent(buildPopupHtml(displayItem))
        }
      } else {
        const marker = L.marker([item.lat, item.lng], { icon, zIndexOffset: highlighted ? 1000 : 0 })
        marker.bindPopup(buildPopupHtml(displayItem), { maxWidth: 290 })
        marker.on('click', () => onSelectRef.current?.(item.driverId))
        group.addLayer(marker)
        markers.set(id, { marker, wasSelected: selected, lat: item.lat, lng: item.lng, icon, zIndex: highlighted ? 1000 : 0 })
      }
    }

    // Remove vehicles that disappeared from tracking
    for (const [id, { marker }] of markers) {
      if (!seen.has(id)) {
        group.removeLayer(marker)
        markers.delete(id)
      }
    }
  }, [tracking, selectedDriverId, hoveredDriverId, driverById])

  return null
})

// ─── Main component ───────────────────────────────────────────────────────────

export default function MapView({
  data,
  mapFilters,
  visibleDriverIds,
  routeFilter,
  selectedDriverId,
  hoveredDriverId,
  followSignal = 0,
  followVehicle = false,
  onToggleFilter,
  onToggleFollow,
  onCenter,
  centerSignal = 0,
  onSelectDriver,
}) {
  const [mapCommand, setMapCommand] = useState(null)
  const [roadRouteLines, setRoadRouteLines] = useState([])
  const routeCacheRef = useRef(new Map())
  const mapShellRef = useRef(null)

  const driverById = useMemo(
    () => new Map((data.drivers || []).map((driver) => [String(driver.id), driver])),
    [data.drivers],
  )
  const visibleDriverSet = useMemo(
    () => new Set((visibleDriverIds || []).map((id) => String(id))),
    [visibleDriverIds],
  )

  const tracking = useMemo(
    () =>
      data.tracking
        .filter((item) => validCoord(item.lat, item.lng))
        .filter(
          (item) =>
            !visibleDriverSet.size ||
            visibleDriverSet.has(String(item.driverId)) ||
            String(item.driverId) === String(selectedDriverId),
        ),
    [data.tracking, selectedDriverId, visibleDriverSet],
  )

  const trackingByDriverId = useMemo(
    () => new Map(tracking.map((item) => [String(item.driverId), item])),
    [tracking],
  )

  const visibleRoutes = useMemo(
    () =>
      data.routes.filter((route) => {
        const matchesRoute = routeFilter === 'all' || String(route.id) === String(routeFilter)
        const matchesDriver = !visibleDriverSet.size || visibleDriverSet.has(String(route.driverId))
        const isSelectedRoute = tracking.some((item) => String(item.routeId) === String(route.id))
        return matchesRoute && (matchesDriver || isSelectedRoute)
      }),
    [data.routes, routeFilter, tracking, visibleDriverSet],
  )

  const selectedItem = useMemo(
    () => tracking.find((item) => String(item.driverId) === String(selectedDriverId)),
    [selectedDriverId, tracking],
  )

  const selectedRoute = useMemo(() => {
    if (!selectedDriverId) return null
    const selectedRouteId = selectedItem?.routeId
    return (
      visibleRoutes.find((route) => String(route.driverId) === String(selectedDriverId)) ||
      visibleRoutes.find((route) => String(route.id) === String(selectedRouteId)) ||
      null
    )
  }, [selectedDriverId, selectedItem, visibleRoutes])

  const focusedRoutes = useMemo(() => (selectedRoute ? [selectedRoute] : []), [selectedRoute])

  const fallbackRouteLines = useMemo(
    () =>
      focusedRoutes
        .map((route) => fallbackRouteLine(route, trackingByDriverId.get(String(route.driverId))))
        .filter((route) => route.points.length > 1),
    [focusedRoutes, trackingByDriverId],
  )

  const routeRoutingKey = useMemo(
    () => fallbackRouteLines.map((route) => route.signature).join('||'),
    [fallbackRouteLines],
  )

  useEffect(() => {
    const controller = new AbortController()

    if (!fallbackRouteLines.length) return () => controller.abort()

    async function loadRoadRoutes() {
      const routedLines = await Promise.all(
        fallbackRouteLines.map(async (route) => {
          const cachedPoints = routeCacheRef.current.get(route.signature)
          if (cachedPoints) {
            return { ...route, points: cachedPoints, isRoadRouted: cachedPoints.length > route.points.length }
          }
          try {
            const roadPoints = await fetchRoadRoute(route, controller.signal)
            const points = roadPoints.length > 1 ? roadPoints : route.points
            routeCacheRef.current.set(route.signature, points)
            return { ...route, points, isRoadRouted: roadPoints.length > 1 }
          } catch {
            return route
          }
        }),
      )

      if (!controller.signal.aborted) setRoadRouteLines(routedLines)
    }

    loadRoadRoutes()
    return () => controller.abort()
  }, [fallbackRouteLines, routeRoutingKey])

  const roadRouteKey = useMemo(
    () => roadRouteLines.map((route) => route.signature).join('||'),
    [roadRouteLines],
  )
  const routeLines = roadRouteKey === routeRoutingKey ? roadRouteLines : fallbackRouteLines

  const selectedSequenceStops = useMemo(
    () =>
      selectedRoute
        ? [...(selectedRoute.stops || [])]
            .filter((stop) => validCoord(stop.lat, stop.lng))
            .sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0))
            .map((stop) => ({ ...stop, routeName: selectedRoute.name, routeColor: selectedRoute.color || '#0a84ff' }))
        : [],
    [selectedRoute],
  )

  const selectedRouteSignature = selectedRoute
    ? routeSignature(selectedRoute, trackingByDriverId.get(String(selectedRoute.driverId)))
    : ''
  const selectedRouteKey = selectedRoute
    ? `${selectedRoute.id || selectedRoute.name}-${selectedRouteSignature}`
    : ''

  // Only vehicle positions — not route line points — for FitToData/center commands.
  // Including route points (which can span km) caused unexpected zoom-outs.
  const positions = useMemo(
    () => tracking.map((item) => [item.lat, item.lng]),
    [tracking],
  )

  return (
    <div ref={mapShellRef} className="relative h-full w-full overflow-hidden rounded-b-[18px] bg-slate-100">
      <MapContainer center={MAP_CENTER} zoom={12} className="h-full w-full" scrollWheelZoom zoomControl>
        <TileLayer attribution="" url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" />
        <FitToData positions={positions} centerSignal={centerSignal} />
        <SelectedDriverFit
          selectedDriverId={selectedDriverId}
          selectedItem={selectedItem}
          selectedRoute={selectedRoute}
        />
        <SelectedVehicleFocus
          followSignal={followSignal}
          followVehicle={followVehicle}
          selectedDriverId={selectedDriverId}
          selectedItem={selectedItem}
        />
        <MapCommandHandler command={mapCommand} positions={positions} />

        {/* Imperative vehicle layer — avoids React reconciliation for 180+ markers */}
        <VehicleLayerManager
          tracking={tracking}
          selectedDriverId={selectedDriverId}
          hoveredDriverId={hoveredDriverId}
          driverById={driverById}
          onSelectDriver={onSelectDriver}
        />

        {mapFilters?.routes !== false &&
          routeLines.map((route, index) => {
            const isSelectedRoute =
              selectedRoute &&
              (String(route.driverId) === String(selectedRoute.driverId) ||
                `${route.id || route.name}-${route.signature}` === selectedRouteKey)

            return (
              <Polyline
                key={`route-${route.id || route.name}-${index}`}
                positions={route.points}
                pathOptions={{
                  color: isSelectedRoute ? '#38bdf8' : route.color || '#0a84ff',
                  weight: isSelectedRoute ? 7 : 5,
                  opacity: selectedRoute ? (isSelectedRoute ? 0.98 : 0.58) : 0.9,
                  lineCap: 'round',
                  lineJoin: 'round',
                  className: isSelectedRoute ? 'route-line-flow route-line-flow--selected' : 'route-line-flow',
                }}
              />
            )
          })}

        {mapFilters?.stops !== false &&
          selectedSequenceStops.map((stop, index) => (
            <Marker
              key={`selected-stop-${selectedRoute?.driverId || selectedRoute?.id}-${stop.id}-${stop.sequence}-${index}`}
              position={[stop.lat, stop.lng]}
              icon={sequenceStopIcon(stop, stop.routeColor)}
              zIndexOffset={900}
            >
              <Popup>
                <div className="min-w-[180px]">
                  <div className="text-[11px] font-black uppercase text-blue-500">Paragem {stop.sequence}</div>
                  <div className="mt-1 text-sm font-black text-slate-900">{stop.clientName}</div>
                  <div className="mt-1 text-xs font-semibold text-slate-500">{stop.routeName}</div>
                </div>
              </Popup>
            </Marker>
          ))}
      </MapContainer>

      <div className="absolute right-4 top-4 z-[1000] flex items-center gap-2">
        <MapButton icon={<Crosshair size={18} />} label="Centrar" wide onClick={onCenter} />
        <MapButton
          icon={<Maximize2 size={18} />}
          label="Ecrã completo"
          onClick={() => {
            if (!document.fullscreenElement) {
              mapShellRef.current?.requestFullscreen?.()
            } else {
              document.exitFullscreen?.()
            }
          }}
        />
      </div>

      <div className="absolute right-4 top-24 z-[1000] flex flex-col gap-3">
        <MapButton
          icon={<Navigation size={18} />}
          label={followVehicle ? 'Seguindo' : 'Seguir'}
          active={followVehicle && Boolean(selectedItem)}
          disabled={!selectedItem}
          onClick={() => selectedItem && onToggleFollow?.()}
        />
        <MapButton icon={<ZoomIn size={18} />} label="Aproximar" onClick={() => setMapCommand({ type: 'zoomIn', at: Date.now() })} />
        <MapButton icon={<ZoomOut size={18} />} label="Afastar" onClick={() => setMapCommand({ type: 'zoomOut', at: Date.now() })} />
        <MapButton icon={<LocateFixed size={18} />} label="Localizar" onClick={() => setMapCommand({ type: 'locate', at: Date.now() })} />
        <MapButton icon={<Route size={18} />} label="Rotas" active onClick={() => setMapCommand({ type: 'routes', at: Date.now() })} />
      </div>

      <div className="absolute bottom-4 left-4 z-[1000] flex flex-wrap gap-2">
        {MAP_FILTERS.map((filter, index) => {
          const active = mapFilters?.[filter.key] !== false
          return (
            <motion.button
              key={filter.key}
              type="button"
              onClick={() => onToggleFilter?.(filter.key)}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.035 }}
              whileHover={{ y: -2, scale: 1.04 }}
              whileTap={{ scale: 0.94 }}
              className={`rounded-full px-4 py-2 text-[11px] font-black shadow-sm transition ${
                active ? 'bg-[#0a84ff] text-white shadow-blue-500/25' : 'bg-white/90 text-slate-500 ring-1 ring-slate-200'
              }`}
            >
              {filter.label}
            </motion.button>
          )
        })}
      </div>

      <motion.div
        initial={{ opacity: 0, x: 14 }}
        animate={{ opacity: 1, x: 0 }}
        className="absolute bottom-5 right-4 z-[1000] w-[150px] rounded-2xl bg-white/94 p-4 shadow-xl ring-1 ring-slate-200"
      >
        <div className="mb-3 text-sm font-black text-slate-800">Legenda</div>
        <div className="space-y-2">
          {Object.entries(STATUS_META)
            .slice(0, 5)
            .map(([key, item]) => (
              <div key={key} className="flex items-center gap-2 text-[11px] font-bold text-slate-600">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                <span>{item.label}</span>
              </div>
            ))}
        </div>
      </motion.div>

    </div>
  )
}

function PopupStat({ label, value, wide = false }) {
  return (
    <div className={`rounded-xl bg-slate-100 p-2 ${wide ? 'col-span-2' : ''}`}>
      <div className="font-bold text-slate-500">{label}</div>
      <div className="truncate font-black text-slate-900">{value || '-'}</div>
    </div>
  )
}

function MapButton({ icon, label, active = false, disabled = false, wide = false, onClick }) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      whileHover={{ y: -2, scale: 1.04 }}
      whileTap={{ scale: 0.94 }}
      className={`grid h-10 place-items-center rounded-xl border border-blue-100 bg-white/95 text-[#0a84ff] shadow-sm transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-45 ${
        active ? 'bg-[#0a84ff] text-white hover:bg-[#0a84ff]' : ''
      } ${wide ? 'w-28 grid-cols-[22px_1fr] gap-2 px-3 text-[11px] font-black uppercase' : 'w-10'}`}
    >
      {icon}
      {wide && <span>{label}</span>}
    </motion.button>
  )
}
