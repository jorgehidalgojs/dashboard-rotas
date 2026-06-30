const STATUS_MAP = {
  running: 'running',
  route: 'running',
  rota: 'running',
  em_rota: 'running',
  emrota: 'running',
  em_transito: 'running',
  transito: 'running',
  moving: 'running',
  in_route: 'running',
  on_route: 'running',

  stop: 'stop',
  stopped: 'stop',
  parado: 'stop',
  parada: 'stop',
  paused: 'stop',
  idle: 'stop',

  outside: 'outside',
  fora: 'outside',
  fora_rota: 'outside',
  fora_de_rota: 'outside',
  off_route: 'outside',

  offline: 'offline',
  sem_sinal: 'offline',
  no_signal: 'offline',
  desconectado: 'offline',

  done: 'done',
  feito: 'done',
  completed: 'done',
  concluido: 'done',
  concluida: 'done',
  recebido: 'done',

  partial: 'partial',
  parcial: 'partial',
  entregue: 'partial',

  planned: 'planned',
  planeado: 'planned',
  planejado: 'planned',
  pending: 'planned',
  pendente: 'planned',
}

function normalizeStatus(status) {
  if (!status) return 'offline'

  const key = String(status)
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_')

  return STATUS_MAP[key] || 'offline'
}

function pick(source, keys, fallback = '') {
  for (const key of keys) {
    if (source?.[key] !== undefined && source?.[key] !== null && source?.[key] !== '') {
      return source[key]
    }
  }

  return fallback
}

function asArray(value) {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.data)) return value.data
  if (Array.isArray(value?.items)) return value.items
  if (Array.isArray(value?.records)) return value.records
  return []
}

function asNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function resolveAssetUrl(value, assetBaseUrl = '') {
  if (!value) return ''

  const url = String(value).trim()
  if (!url) return ''
  if (/^(https?:|data:|blob:)/i.test(url)) return url

  const base = assetBaseUrl || (typeof window !== 'undefined' ? window.location.origin : '')
  if (!base) return url

  try {
    return new URL(url, base).toString()
  } catch {
    return url
  }
}

function normalizeStop(stop = {}) {
  return {
    id: asNumber(pick(stop, ['id', 'stop_id', 'stopId', 'sequence', 'seq'])),
    sequence: asNumber(pick(stop, ['sequence', 'seq', 'order', 'ordem'])),
    clientName: pick(stop, ['client_name', 'clientName', 'customer_name', 'customerName', 'name', 'cliente'], 'Cliente'),
    lat: asNumber(pick(stop, ['lat', 'latitude', 'gps_lat', 'gpsLat'])),
    lng: asNumber(pick(stop, ['lng', 'lon', 'longitude', 'gps_lng', 'gpsLng', 'gps_lon'])),
    status: normalizeStatus(pick(stop, ['status', 'state', 'estado'], 'pending')),
    plannedTime: pick(stop, ['planned_time', 'plannedTime', 'eta', 'hora_planeada', 'time']),
  }
}

function normalizeDashboard(raw = {}, options = {}) {
  const assetBaseUrl = options.assetBaseUrl || ''
  const root = raw?.data && !Array.isArray(raw.data) ? raw.data : raw
  const kpis = root?.kpis || root?.metrics || root?.summary || {}
  const driversRaw = asArray(pick(root, ['drivers', 'motoristas', 'driver_list'], []))
  const vehiclesRaw = asArray(pick(root, ['vehicles', 'viaturas', 'cars', 'fleet'], []))
  const trackingRaw = asArray(pick(root, ['tracking', 'positions', 'locations', 'gps'], []))
  const routesRaw = asArray(pick(root, ['routes', 'rotas', 'route_list'], []))

  const drivers = driversRaw.map((driver) => {
    const completed = asNumber(pick(driver, ['completed', 'completed_stops', 'completedStops', 'concluidas']))
    const total = asNumber(pick(driver, ['total', 'total_stops', 'totalStops', 'planned_stops', 'paragens']))

    return {
      id: asNumber(pick(driver, ['id', 'driver_id', 'driverId', 'motorista_id'])),
      name: pick(driver, ['name', 'driver_name', 'driverName', 'motorista', 'nome'], 'Motorista'),
      phone: pick(driver, ['phone', 'telefone', 'mobile', 'telemovel']),
      photoUrl: resolveAssetUrl(pick(driver, ['photo_url', 'photoUrl', 'avatar', 'image', 'foto']), assetBaseUrl),
      status: normalizeStatus(pick(driver, ['status', 'state', 'estado'])),
      statusText: pick(driver, ['status_text', 'statusText', 'estado_texto']),
      routeId: pick(driver, ['route_id', 'routeId', 'rota_id']),
      routeName: pick(driver, ['route_name', 'routeName', 'rota', 'rota_nome'], 'Plano diario de distribuicao'),
      vehicleId: pick(driver, ['vehicle_id', 'vehicleId', 'viatura_id']),
      vehicleName: pick(driver, ['vehicle_name', 'vehicleName', 'viatura', 'car_name'], ''),
      plate: pick(driver, ['plate', 'matricula', 'license_plate', 'licensePlate'], ''),
      completed,
      total,
      progress: total ? Math.round((completed / total) * 100) : asNumber(pick(driver, ['progress', 'progresso'])),
      speed: asNumber(pick(driver, ['speed', 'velocidade'])),
      lastUpdate: pick(driver, ['last_update', 'lastUpdate', 'updated_at', 'gps_time']),
    }
  })

  const vehicles = vehiclesRaw.map((vehicle) => ({
    id: asNumber(pick(vehicle, ['id', 'vehicle_id', 'vehicleId', 'viatura_id'])),
    name: pick(vehicle, ['name', 'vehicle_name', 'vehicleName', 'viatura'], ''),
    plate: pick(vehicle, ['plate', 'matricula', 'license_plate', 'licensePlate'], ''),
    type: pick(vehicle, ['type', 'tipo'], ''),
    status: normalizeStatus(pick(vehicle, ['status', 'state', 'estado'])),
    driverId: pick(vehicle, ['driver_id', 'driverId', 'motorista_id']),
    lat: asNumber(pick(vehicle, ['lat', 'latitude', 'gps_lat', 'gpsLat'])),
      lng: asNumber(pick(vehicle, ['lng', 'lon', 'longitude', 'gps_lng', 'gpsLng', 'gps_lon'])),
      speed: asNumber(pick(vehicle, ['speed', 'velocidade'])),
      course: asNumber(pick(vehicle, ['course', 'heading', 'bearing', 'direction', 'direcao'])),
      lastUpdate: pick(vehicle, ['last_update', 'lastUpdate', 'updated_at', 'gps_time']),
    }))

  const tracking = trackingRaw.map((item) => ({
    driverId: asNumber(pick(item, ['driver_id', 'driverId', 'motorista_id'])),
    driverName: pick(item, ['driver_name', 'driverName', 'motorista', 'name'], 'Motorista'),
    driverPhotoUrl: resolveAssetUrl(pick(item, ['driver_photo_url', 'driverPhotoUrl', 'photo_url', 'photoUrl', 'avatar']), assetBaseUrl),
    vehicleId: asNumber(pick(item, ['vehicle_id', 'vehicleId', 'viatura_id'])),
    vehicleName: pick(item, ['vehicle_name', 'vehicleName', 'viatura'], ''),
    plate: pick(item, ['plate', 'matricula', 'license_plate', 'licensePlate'], ''),
    routeId: pick(item, ['route_id', 'routeId', 'rota_id']),
    routeName: pick(item, ['route_name', 'routeName', 'rota'], 'Plano diario de distribuicao'),
    lat: asNumber(pick(item, ['lat', 'latitude', 'gps_lat', 'gpsLat'])),
    lng: asNumber(pick(item, ['lng', 'lon', 'longitude', 'gps_lng', 'gpsLng', 'gps_lon'])),
    speed: asNumber(pick(item, ['speed', 'velocidade'])),
    course: asNumber(pick(item, ['course', 'heading', 'bearing', 'direction', 'direcao'])),
    status: normalizeStatus(pick(item, ['status', 'state', 'estado'])),
    lastUpdate: pick(item, ['last_update', 'lastUpdate', 'updated_at', 'gps_time']),
  }))

  const routes = routesRaw.map((route) => ({
    id: asNumber(pick(route, ['id', 'route_id', 'routeId', 'rota_id'])),
    name: pick(route, ['name', 'route_name', 'routeName', 'rota'], 'Rota'),
    color: pick(route, ['color', 'cor'], '#0a84ff'),
    status: normalizeStatus(pick(route, ['status', 'state', 'estado'], 'planned')),
    driverId: pick(route, ['driver_id', 'driverId', 'motorista_id']),
    vehicleId: pick(route, ['vehicle_id', 'vehicleId', 'viatura_id']),
    completedStops: asNumber(pick(route, ['completed_stops', 'completedStops', 'completed', 'concluidas'])),
    totalStops: asNumber(pick(route, ['total_stops', 'totalStops', 'total', 'paragens'])),
    stops: asArray(pick(route, ['stops', 'paragens', 'points', 'pontos'], [])).map(normalizeStop),
  }))

  const activeRoutes = asNumber(pick(kpis, ['active_routes', 'activeRoutes', 'rotas_ativas']), routes.length)
  const vehiclesOnRoute = asNumber(
    pick(kpis, ['vehicles_on_route', 'vehiclesOnRoute', 'viaturas_em_rota']),
    tracking.filter((item) => item.status === 'running').length,
  )
  const activeDrivers = asNumber(pick(kpis, ['active_drivers', 'activeDrivers', 'motoristas_ativos']), drivers.length)
  const plannedDeliveries = asNumber(
    pick(kpis, ['planned_deliveries', 'plannedDeliveries', 'entregas_planeadas']),
    routes.reduce((total, route) => total + route.totalStops, 0),
  )
  const completedDeliveries = asNumber(
    pick(kpis, ['completed_deliveries', 'completedDeliveries', 'entregas_concluidas']),
    routes.reduce((total, route) => total + route.completedStops, 0),
  )
  const completionRate = asNumber(
    pick(kpis, ['completion_rate', 'completionRate', 'taxa_conclusao']),
    plannedDeliveries ? Math.round((completedDeliveries / plannedDeliveries) * 100) : 0,
  )

  return {
    timestamp: pick(root, ['timestamp', 'updated_at', 'last_update'], ''),
    kpis: {
      activeRoutes,
      vehiclesOnRoute,
      activeDrivers,
      plannedDeliveries,
      completedDeliveries,
      pendingDeliveries: asNumber(pick(kpis, ['pending_deliveries', 'pendingDeliveries', 'entregas_pendentes']), Math.max(plannedDeliveries - completedDeliveries, 0)),
      failedDeliveries: asNumber(pick(kpis, ['failed_deliveries', 'failedDeliveries', 'falhas'])),
      completionRate,
      activeAlerts: asNumber(pick(kpis, ['active_alerts', 'activeAlerts', 'alertas_ativos']), asArray(root?.alerts).length),
    },
    drivers,
    vehicles,
    tracking,
    routes,
    alerts: asArray(pick(root, ['alerts', 'alertas', 'incidents'], [])),
    performance: {
      completionRate: asNumber(pick(root?.performance, ['completion_rate', 'completionRate']), completionRate),
      completedDeliveries: asNumber(pick(root?.performance, ['completed_deliveries', 'completedDeliveries']), completedDeliveries),
      pendingDeliveries: asNumber(pick(root?.performance, ['pending_deliveries', 'pendingDeliveries']), Math.max(plannedDeliveries - completedDeliveries, 0)),
      failedDeliveries: asNumber(pick(root?.performance, ['failed_deliveries', 'failedDeliveries'])),
      averageTimePerStop: asNumber(pick(root?.performance, ['average_time_per_stop', 'averageTimePerStop'])),
      totalKm: asNumber(pick(root?.performance, ['total_km', 'totalKm'])),
      averageDelayMinutes: asNumber(pick(root?.performance, ['average_delay_minutes', 'averageDelayMinutes'])),
    },
  }
}

export { normalizeDashboard, normalizeStatus }
