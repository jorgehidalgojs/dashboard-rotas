import { forwardRef, memo, useCallback, useEffect, useMemo, useRef, useState, useDeferredValue } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  Box,
  CheckCircle2,
  Clock3,
  Cloud,
  CloudDrizzle,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Compass,
  Expand,
  Gauge,
  Loader2,
  MapPin,
  Moon,
  PackageCheck,
  Phone,
  RefreshCw,
  Route,
  Search,
  Server,
  Siren,
  SlidersHorizontal,
  Sun,
  Truck,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react'
import { useDashboard } from '../hooks/useDashboard'
import { useDashboardStore } from '../store/dashboardStore'
import MapView from '../components/MapView'

const KPI_SECTION_VARIANTS = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.08 } },
}

const EMPTY_DATA = {
  kpis: {},
  drivers: [],
  vehicles: [],
  tracking: [],
  routes: [],
  alerts: [],
  performance: {},
}

const STATUS_LABELS = {
  running: 'Rota',
  stop: 'Parado',
  outside: 'Fora',
  offline: 'Offline',
  done: 'Feito',
  partial: 'Parcial',
  planned: 'Plano',
}

const STATUS_STYLES = {
  running: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  stop: 'border-amber-200 bg-amber-50 text-amber-700',
  outside: 'border-rose-200 bg-rose-50 text-rose-700',
  offline: 'border-slate-200 bg-slate-100 text-slate-500',
  done: 'border-blue-200 bg-blue-50 text-blue-700',
  partial: 'border-violet-200 bg-violet-50 text-violet-700',
  planned: 'border-slate-200 bg-slate-50 text-slate-600',
}

function minutesSince(value, now = new Date()) {
  if (!value) return null
  const normalized = String(value).replace(' ', 'T')
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return null
  return Math.max(0, Math.round((now.getTime() - date.getTime()) / 60000))
}

function formatTime(value) {
  if (!value) return '--:--'
  try {
    return new Date(String(value).replace(' ', 'T')).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return '--:--'
  }
}

function relativeTime(value) {
  const mins = minutesSince(value)
  if (mins === null) return '--'
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins}min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h${mins % 60 > 0 ? `${mins % 60}m` : ''}`
  return `${Math.floor(hours / 24)}d`
}

function generateOperationalIntelligence(data) {
  const now = new Date()
  const alerts = []
  const insights = []
  const drivers = data.drivers || []
  const tracking = data.tracking || []
  const routes = data.routes || []

  const outside = drivers.filter((driver) => driver.status === 'outside')
  const offline = drivers.filter((driver) => driver.status === 'offline')
  const running = tracking.filter((item) => item.status === 'running')
  const stopped = tracking.filter((item) => item.status === 'stop')
  const stale = tracking.filter((item) => {
    const age = minutesSince(item.lastUpdate, now)
    return age !== null && age > 45
  })
  const fast = tracking.filter((item) => Number(item.speed) >= 45)

  if (outside.length) {
    alerts.push({
      title: `${outside.length} fora de rota`,
      body: outside.slice(0, 3).map((driver) => driver.name).join(', '),
      severity: 'critical',
    })
  }

  if (offline.length) {
    alerts.push({
      title: `${offline.length} offline`,
      body: 'Motoristas sem sinal GPS ou sem última posição válida.',
      severity: 'warning',
    })
  }

  if (stale.length) {
    alerts.push({
      title: `${stale.length} GPS desatualizado`,
      body: 'Existem viaturas com última atualização acima de 45 minutos.',
      severity: 'warning',
    })
  }

  if (fast.length) {
    alerts.push({
      title: `${fast.length} velocidade elevada`,
      body: fast.slice(0, 2).map((item) => `${item.plate || item.driverName} ${Math.round(item.speed)} km/h`).join(' · '),
      severity: 'info',
    })
  }

  insights.push({
    title: 'Distribuição da frota',
    body: `${running.length} em movimento, ${stopped.length} paradas, ${outside.length} fora de rota, ${offline.length} offline.`,
  })

  insights.push({
    title: 'Cobertura GPS',
    body: `${tracking.length}/${drivers.length || tracking.length} motoristas com posição válida no mapa.`,
  })

  if (data.kpis?.completionRate === 0 && data.kpis?.activeRoutes > 0) {
    insights.push({
      title: 'Conclusão ainda zerada',
      body: `${data.kpis.activeRoutes} rotas ativas sem entregas concluídas até agora.`,
    })
  }

  if (routes.length) {
    const averageStops = routes.reduce((total, route) => total + (route.totalStops || 0), 0) / routes.length
    insights.push({
      title: 'Carga média por rota',
      body: `${averageStops.toFixed(1)} pontos por rota planeada.`,
    })
  }

  return { alerts, insights }
}

// WMO weather code → { label, Icon }
function weatherMeta(code) {
  if (code === 0) return { label: 'Céu limpo', Icon: Sun }
  if (code <= 3) return { label: 'Parcialmente nublado', Icon: CloudSun }
  if (code <= 48) return { label: 'Nevoeiro', Icon: Cloud }
  if (code <= 55) return { label: 'Chuviscos', Icon: CloudDrizzle }
  if (code <= 67) return { label: 'Chuva', Icon: CloudRain }
  if (code <= 77) return { label: 'Neve', Icon: CloudSnow }
  if (code <= 82) return { label: 'Aguaceiros', Icon: CloudRain }
  if (code <= 99) return { label: 'Trovoada', Icon: CloudLightning }
  return { label: '—', Icon: CloudSun }
}

function useWeather() {
  const [weather, setWeather] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function fetch_() {
      try {
        const res = await fetch(
          'https://api.open-meteo.com/v1/forecast?latitude=-25.9653&longitude=32.5892&current=temperature_2m,weathercode,windspeed_10m&timezone=Africa%2FMaputo&forecast_days=1',
        )
        if (!res.ok) return
        const json = await res.json()
        if (cancelled) return
        const c = json.current
        setWeather({
          temp: Math.round(c.temperature_2m),
          code: c.weathercode,
          wind: Math.round(c.windspeed_10m),
        })
      } catch { /* silently ignore — keep widget showing last value */ }
    }

    fetch_()
    const id = setInterval(fetch_, 30 * 60 * 1000) // refresh every 30 min
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  return weather
}

export default function DashboardPage() {
  const {
    activeTab,
    followVehicle,
    mapFilters,
    routeFilter,
    search,
    selectedDriverId,
    setActiveTab,
    setFollowVehicle,
    setRouteFilter,
    setSearch,
    setSelectedDriverId,
    setSelectedRouteId,
    setSelectedVehicleId,
    toggleMapFilter,
  } = useDashboardStore()
  const weather = useWeather()
  const [centerSignal, setCenterSignal] = useState(0)
  const [followSignal, setFollowSignal] = useState(0)
  const [hoveredDriverId, setHoveredDriverId] = useState(null)
  const [hoveredDriver, setHoveredDriver] = useState(null)
  const [hoverCardY, setHoverCardY] = useState(0)
  const [isDark, setIsDark] = useState(() => localStorage.getItem('dashboard-theme') === 'dark')
  const appShellRef = useRef(null)
  const asideRef = useRef(null)

  const { data: liveData = EMPTY_DATA, isLoading, isError, error, dataUpdatedAt, isFetching, refetch } = useDashboard()

  // useDeferredValue makes data updates non-blocking: React keeps the current
  // UI while computing the new render in the background, preventing freeze frames.
  const data = useDeferredValue(liveData)

  const updatedAt = liveData.timestamp
    ? formatTime(liveData.timestamp)
    : (dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--')

  useEffect(() => {
    localStorage.setItem('dashboard-theme', isDark ? 'dark' : 'light')
  }, [isDark])

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      appShellRef.current?.requestFullscreen?.()
    } else {
      document.exitFullscreen?.()
    }
  }, [])

  const handleToggleDark = useCallback(() => setIsDark((v) => !v), [])
  const handleToggleFollow = useCallback(() => setFollowVehicle((v) => !v), [setFollowVehicle])
  const handleCenter = useCallback(() => setCenterSignal((v) => v + 1), [])
  const handleSelectDriver = useCallback((driverId) => setSelectedDriverId(driverId), [setSelectedDriverId])
  const handleSelect = useCallback((driver) => {
    setSelectedDriverId(driver.id)
    setSelectedVehicleId(driver.vehicleId)
    setSelectedRouteId(driver.routeId)
    setFollowVehicle(false)
  }, [setSelectedDriverId, setSelectedVehicleId, setSelectedRouteId, setFollowVehicle])
  const handleFollow = useCallback((driver) => {
    setSelectedDriverId(driver.id)
    setSelectedVehicleId(driver.vehicleId)
    setSelectedRouteId(driver.routeId)
    setFollowVehicle(true)
    setFollowSignal((v) => v + 1)
  }, [setSelectedDriverId, setSelectedVehicleId, setSelectedRouteId, setFollowVehicle])

  const filteredDrivers = useMemo(() => {
    const term = search.trim().toLowerCase()

    return data.drivers.filter((driver) => {
      const matchesTab = activeTab === 'all' || driver.status === activeTab
      const matchesRoute = routeFilter === 'all' || String(driver.routeId) === String(routeFilter)
      const haystack = `${driver.name} ${driver.vehicleName} ${driver.plate} ${driver.routeName}`.toLowerCase()
      const matchesSearch = !term || haystack.includes(term)

      return matchesTab && matchesRoute && matchesSearch
    })
  }, [activeTab, data.drivers, routeFilter, search])

  const counts = useMemo(
    () => ({
      all: data.drivers.length,
      running: data.drivers.filter((driver) => driver.status === 'running').length,
      stop: data.drivers.filter((driver) => driver.status === 'stop').length,
      outside: data.drivers.filter((driver) => driver.status === 'outside').length,
      offline: data.drivers.filter((driver) => driver.status === 'offline').length,
      done: data.drivers.filter((driver) => driver.status === 'done').length,
    }),
    [data.drivers],
  )

  const operational = useMemo(() => generateOperationalIntelligence(data), [data])
  const visibleDriverIds = useMemo(() => filteredDrivers.map((driver) => driver.id), [filteredDrivers])

  const hoveredTracking = useMemo(
    () => hoveredDriver ? liveData.tracking.find((t) => String(t.driverId) === String(hoveredDriver.id)) : null,
    [hoveredDriver, liveData.tracking],
  )

  const handleHoverDriver = useCallback((driver, y) => {
    setHoveredDriverId(driver?.id ?? null)
    setHoveredDriver(driver ?? null)
    setHoverCardY(y ?? 0)
  }, [])

  if (isLoading) {
    return (
      <ScreenShell>
        <div className="grid h-full place-items-center">
          <div className="flex items-center gap-3 rounded-2xl bg-white px-6 py-4 text-sm font-black text-slate-600 shadow-sm ring-1 ring-slate-200">
            <Loader2 className="animate-spin text-[#0a84ff]" size={20} />
            A carregar dashboard...
          </div>
        </div>
      </ScreenShell>
    )
  }

  if (isError) {
    return (
      <ScreenShell>
        <div className="grid h-full place-items-center">
          <div className="max-w-md rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-rose-100">
            <Siren className="mx-auto text-rose-500" size={34} />
            <h1 className="mt-3 text-xl font-black text-slate-900">Erro ao carregar</h1>
            <p className="mt-2 text-sm font-semibold text-slate-500">{error.message}</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-5 rounded-xl bg-[#0a84ff] px-5 py-3 text-sm font-black text-white shadow-sm"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      </ScreenShell>
    )
  }

  return (
    <ScreenShell ref={appShellRef} isDark={isDark}>
      <div className="grid h-full grid-rows-[72px_78px_minmax(0,1fr)] gap-2">
        <motion.div initial={{ opacity: 0, y: -14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
          <Header
            updatedAt={updatedAt}
            isFetching={isFetching}
            isDark={isDark}
            onToggleDark={handleToggleDark}
            onToggleFullscreen={toggleFullscreen}
            weather={weather}
          />
        </motion.div>

        <motion.section
          className="grid grid-cols-6 gap-2"
          initial="hidden"
          animate="show"
          variants={KPI_SECTION_VARIANTS}
        >
          <KpiCard icon={<Route size={22} />} title="Rotas ativas" value={data.kpis.activeRoutes || 0} detail="planificadas" color="blue" />
          <KpiCard icon={<Truck size={22} />} title="Viaturas em rota" value={data.kpis.vehiclesOnRoute || 0} detail="com despacho/rota" color="emerald" />
          <KpiCard icon={<Users size={22} />} title="Motoristas ativos" value={data.kpis.activeDrivers || 0} detail="viaturas em movimento" color="violet" />
          <KpiCard icon={<Box size={22} />} title="Entregas hoje" value={data.kpis.plannedDeliveries || 0} detail={`${data.kpis.pendingDeliveries || 0} pendentes`} color="amber" />
          <KpiCard icon={<CheckCircle2 size={22} />} title="Conclusão" value={`${data.kpis.completionRate || 0}%`} detail={`${data.kpis.completedDeliveries || 0} concluidas`} color="teal" />
          <KpiCard icon={<AlertTriangle size={22} />} title="Alertas" value={Math.max(data.kpis.activeAlerts || 0, operational.alerts.length)} detail={operational.alerts.length ? 'gerados pelo cliente' : 'sem incidentes'} color="rose" />
        </motion.section>

        <main className="relative grid min-h-0 grid-cols-[600px_minmax(0,1fr)] gap-2">
          <AnimatePresence>
            {hoveredDriver && (
              <DriverHoverCard
                key={hoveredDriver.id}
                driver={hoveredDriver}
                tracking={hoveredTracking}
                asideRef={asideRef}
                cardY={hoverCardY}
              />
            )}
          </AnimatePresence>

          <motion.aside
            ref={asideRef}
            className="grid min-h-0 grid-rows-[44px_76px_minmax(0,1fr)_38px] overflow-hidden rounded-[18px] bg-white shadow-sm ring-1 ring-slate-200"
            initial={{ opacity: 0, x: -18 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.46, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
          >
            <PanelTitle icon={<SlidersHorizontal size={18} />} title="Motoristas e viaturas">
              <button
                type="button"
                onClick={() => refetch()}
                aria-label="Atualizar"
                title="Atualizar"
                className="grid h-9 w-9 place-items-center rounded-xl border border-blue-100 text-[#0a84ff] hover:bg-blue-50"
              >
                <RefreshCw size={18} className={isFetching ? 'animate-spin' : ''} />
              </button>
            </PanelTitle>

            <div className="border-b border-slate-100 px-3 py-2">
              <div className="mb-2 grid grid-cols-6 gap-2">
                <FilterTab active={activeTab === 'all'} label={`Todos (${counts.all})`} onClick={() => setActiveTab('all')} />
                <FilterTab active={activeTab === 'running'} label={`Rota (${counts.running})`} onClick={() => setActiveTab('running')} />
                <FilterTab active={activeTab === 'stop'} label={`Parados (${counts.stop})`} onClick={() => setActiveTab('stop')} />
                <FilterTab active={activeTab === 'outside'} label={`Fora (${counts.outside})`} onClick={() => setActiveTab('outside')} />
                <FilterTab active={activeTab === 'offline'} label={`Offline (${counts.offline})`} onClick={() => setActiveTab('offline')} />
                <FilterTab active={activeTab === 'done'} label={`Feito (${counts.done})`} onClick={() => setActiveTab('done')} />
              </div>

              <div className="grid grid-cols-[1fr_128px] gap-2">
                <label className="flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-400">
                  <Search size={18} className="text-slate-500" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-xs font-bold text-slate-700 outline-none placeholder:text-slate-400"
                    placeholder="Pesquisar motorista, viatura, matricula ou rota..."
                  />
                </label>
                <select
                  value={routeFilter}
                  onChange={(event) => setRouteFilter(event.target.value)}
                  className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 outline-none"
                >
                  <option value="all">Todas as rotas</option>
                  {data.routes.map((route, index) => (
                    <option key={`${route.id || route.name}-${index}`} value={route.id}>
                      {route.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <DriverTable
              drivers={filteredDrivers}
              selectedDriverId={selectedDriverId}
              onSelect={handleSelect}
              onFollow={handleFollow}
              onHover={handleHoverDriver}
            />

            <div className="grid grid-cols-[1fr_1fr_1.25fr] border-t border-slate-200 bg-slate-50 text-[11px] font-black text-slate-700">
              <FooterMetric icon={<MapPin size={16} />} label="GPS:" value={`${data.tracking.length}/${data.drivers.length}`} />
              <FooterMetric icon={<Server size={16} />} label="API:" value="Online" />
              <FooterMetric icon={<Clock3 size={16} />} label="Sync:" value={updatedAt} />
            </div>
          </motion.aside>

          <motion.section
            className="grid min-h-0 grid-rows-[44px_minmax(0,1fr)_124px] overflow-hidden rounded-[18px] bg-white shadow-sm ring-1 ring-slate-200"
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.46, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            <PanelTitle icon={<MapPin size={18} />} title="Mapa operacional em tempo real" />

            <MapView
              data={data}
              mapFilters={mapFilters}
              visibleDriverIds={visibleDriverIds}
              routeFilter={routeFilter}
              selectedDriverId={selectedDriverId}
              hoveredDriverId={hoveredDriverId}
              followSignal={followSignal}
              followVehicle={followVehicle}
              onToggleFilter={toggleMapFilter}
              onToggleFollow={handleToggleFollow}
              onCenter={handleCenter}
              centerSignal={centerSignal}
              onSelectDriver={handleSelectDriver}
            />

            <section className="grid grid-cols-3 gap-2 bg-slate-100 pt-2">
              <BottomPanel title="Alertas ativos" icon={<AlertTriangle size={18} className="text-rose-500" />}>
                {operational.alerts.length || data.alerts.length ? (
                  [...operational.alerts, ...data.alerts].slice(0, 2).map((alert, index) => (
                    <AlertItem
                      key={alert.id || `${alert.title}-${index}`}
                      title={alert.title || alert.name || 'Alerta'}
                      body={alert.body || alert.message || alert.description || 'Verificar operação.'}
                      severity={alert.severity}
                    />
                  ))
                ) : (
                  <AlertItem title="Operação estável" body="Não existem alertas ativos neste momento." ok />
                )}
              </BottomPanel>

              <BottomPanel title="Desempenho" icon={<PackageCheck size={18} />}>
                <div className="grid h-full grid-cols-2 place-items-center">
                  <BigMetric value={`${data.performance.completionRate || data.kpis.completionRate || 0}%`} label="Conclusão" />
                  <BigMetric value={data.performance.completedDeliveries || data.kpis.completedDeliveries || 0} label="Concluidas" />
                </div>
              </BottomPanel>

              <BottomPanel title="Insights" icon={<CloudSun size={18} />}>
                <div className="space-y-2 overflow-y-auto pr-1">
                  {operational.insights.slice(0, 4).map((insight, index) => (
                    <Insight key={`${insight.title}-${index}`} title={insight.title} body={insight.body} />
                  ))}
                </div>
              </BottomPanel>
            </section>
          </motion.section>
        </main>
      </div>
    </ScreenShell>
  )
}

const ScreenShell = forwardRef(function ScreenShell({ children, isDark = false }, ref) {
  return (
    <div
      ref={ref}
      className={`dashboard-shell h-screen overflow-hidden p-2 transition-colors duration-300 ${
        isDark ? 'dashboard-shell--dark bg-[#07111f] text-slate-100' : 'bg-[#eef5fb] text-[#102a43]'
      }`}
    >
      {children}
    </div>
  )
})

function Header({ updatedAt, isFetching, isDark, onToggleDark, onToggleFullscreen, weather }) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <header className="grid h-full grid-cols-[154px_minmax(0,1fr)_auto] items-center rounded-[18px] bg-white px-4 shadow-sm ring-1 ring-slate-200 transition-colors duration-300 dark-surface">
      <div className="flex items-center border-r border-slate-200 pr-4">
      <img
        src="/logopalace.png"
        alt="Chicken Palace"
        className="h-14 w-auto object-contain"
      />
    </div>

      <div className="min-w-0 px-4">
        <h1 className="truncate text-[18px] font-black uppercase leading-[1.04] text-[#102a43]">Controlo de Despacho Diário</h1>
        <p className="truncate text-[11px] font-bold text-slate-500">Gestão de rotas e frotas em tempo real · Chicken Palace</p>
      </div>

      <div className="flex items-center gap-2">
        <HeaderPill>
          <span className={`h-3 w-3 rounded-full ${isFetching ? 'bg-amber-400' : 'bg-emerald-500'}`} />
          <span>Online · {updatedAt}</span>
        </HeaderPill>
        <HeaderPill compact>15s</HeaderPill>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-1 text-center">
          <div className="text-xl font-black tabular-nums text-slate-900">{now.toLocaleTimeString('pt-PT')}</div>
          <div className="text-[11px] font-black text-slate-400">{now.toLocaleDateString('pt-PT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</div>
        </div>
        <WeatherPill weather={weather} />
        <IconPill icon={<Moon size={20} />} label="Modo escuro" active={isDark} onClick={onToggleDark} />
        <IconPill icon={<Expand size={20} />} label="Ecrã completo" onClick={onToggleFullscreen} />
      </div>
    </header>
  )
}

function WeatherPill({ weather }) {
  if (!weather) {
    return (
      <div className="flex h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-xs font-black text-slate-400">
        <CloudSun size={20} className="animate-pulse text-amber-300" />
        <span>Maputo, MZ</span>
      </div>
    )
  }
  const { temp, code, wind } = weather
  const { label, Icon } = weatherMeta(code)
  return (
    <motion.div
      key={temp}
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex h-10 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-xs font-black text-slate-700"
      title={`${label} · Vento ${wind} km/h`}
    >
      <Icon size={20} className="shrink-0 text-amber-400" />
      <span>
        {temp}°C
        <br />
        <span className="text-[10px] font-bold text-slate-400">{label}</span>
      </span>
    </motion.div>
  )
}

function HeaderPill({ children, compact = false }) {
  return (
    <div className={`flex h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-xs font-black text-slate-700 ${compact ? 'w-14 px-0 text-[#0a84ff]' : ''}`}>
      {children}
    </div>
  )
}

function IconPill({ icon, label, active = false, onClick }) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      whileHover={{ y: -1, scale: 1.04 }}
      whileTap={{ scale: 0.94 }}
      className={`grid h-10 w-10 place-items-center rounded-2xl border transition ${
        active ? 'border-blue-200 bg-[#0a84ff] text-white' : 'border-slate-200 bg-slate-50 text-slate-900'
      }`}
    >
      {icon}
    </motion.button>
  )
}

function KpiCard({ icon, title, value, detail, color }) {
  const colors = {
    blue: 'from-blue-500 text-blue-600 bg-blue-50',
    emerald: 'from-emerald-500 text-emerald-600 bg-emerald-50',
    violet: 'from-violet-500 text-violet-600 bg-violet-50',
    amber: 'from-amber-500 text-amber-600 bg-amber-50',
    teal: 'from-teal-500 text-teal-600 bg-teal-50',
    rose: 'from-rose-500 text-rose-600 bg-rose-50',
  }[color]

  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 16, scale: 0.98 },
        show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.42, ease: [0.22, 1, 0.36, 1] } },
      }}
      whileHover={{ y: -4, scale: 1.015 }}
      className={`group relative overflow-hidden rounded-[16px] bg-white p-3 shadow-sm ring-1 ring-slate-200 transition-shadow hover:shadow-lg after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:bg-gradient-to-r ${colors}`}
    >
      <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/70 to-transparent opacity-0 transition duration-700 group-hover:translate-x-full group-hover:opacity-100" />
      <div className="flex items-center gap-3">
        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${colors}`}>
          {icon}
        </div>
        <div>
          <div className="text-[11px] font-black uppercase text-slate-500">{title}</div>
          <motion.div
            key={String(value)}
            initial={{ opacity: 0.3 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="text-2xl font-black leading-tight text-slate-900"
          >
            {value}
          </motion.div>
          <div className="mt-1 text-[10px] font-black text-slate-400">{detail}</div>
        </div>
      </div>
    </motion.div>
  )
}

function PanelTitle({ icon, title, children }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-200 px-4">
      <div className="flex items-center gap-2 text-sm font-black uppercase text-slate-900">
        {icon}
        {title}
      </div>
      {children}
    </div>
  )
}

function FilterTab({ active, label, onClick }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      layout
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.95 }}
      className={`relative h-8 rounded-xl border px-2 text-[10px] font-black uppercase transition ${
        active ? 'border-[#0a84ff] bg-[#0a84ff] text-white shadow-md shadow-blue-500/20' : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-blue-50'
      }`}
    >
      {active && <motion.span layoutId="filter-pill" className="absolute inset-0 rounded-xl bg-[#0a84ff]" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
      <span className="relative">{label}</span>
    </motion.button>
  )
}

const ROW_HEIGHT = 66

function DriverTable({ drivers, selectedDriverId, onSelect, onFollow, onHover }) {
  const parentRef = useRef(null)

  const virtualizer = useVirtualizer({
    count: drivers.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 6,
  })

  return (
    <div className="min-h-0 overflow-hidden">
      <div className="grid h-8 grid-cols-[128px_90px_185px_64px_67px] items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 text-[10px] font-black uppercase text-slate-400">
        <div>Motorista</div>
        <div>Viatura</div>
        <div>Rota</div>
        <div>Prog.</div>
        <div>Act.</div>
      </div>
      <div ref={parentRef} className="h-[calc(100%-32px)] overflow-y-auto">
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const driver = drivers[virtualRow.index]
            return (
              <div
                key={`${driver.id || driver.name}-${driver.plate}`}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <DriverRow
                  driver={driver}
                  isSelected={String(selectedDriverId) === String(driver.id)}
                  onSelect={() => onSelect(driver)}
                  onFollow={() => onFollow(driver)}
                  onHover={(y) => onHover(driver, y)}
                  onLeave={() => onHover(null)}
                />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const DriverRow = memo(function DriverRow({ driver, isSelected, onSelect, onFollow, onHover, onLeave }) {
  const accent = {
    running: 'border-l-emerald-400 bg-emerald-50/35',
    stop: 'border-l-amber-400 bg-amber-50/35',
    outside: 'border-l-rose-400 bg-rose-50/35',
    offline: 'border-l-slate-300 bg-slate-50/55',
    done: 'border-l-blue-400 bg-blue-50/35',
  }[driver.status] || 'border-l-slate-300'

  const selectedClass = isSelected
    ? 'bg-blue-50/90 shadow-[inset_0_0_0_2px_rgba(10,132,255,.2)]'
    : ''

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onDoubleClick={onFollow}
      onMouseEnter={(e) => onHover(e.currentTarget.getBoundingClientRect().top + e.currentTarget.getBoundingClientRect().height / 2)}
      onMouseLeave={onLeave}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect()
        }
      }}
      className={`group grid min-h-[66px] cursor-pointer grid-cols-[128px_90px_185px_64px_67px] items-center gap-2 border-b border-slate-100 border-l-4 px-3 text-[11px] outline-none transition-colors hover:bg-blue-50/95 hover:shadow-[inset_0_0_0_1px_rgba(10,132,255,.18),0_8px_18px_rgba(15,23,42,.05)] focus-visible:ring-2 focus-visible:ring-blue-400 ${accent} ${selectedClass}`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <Avatar name={driver.name} status={driver.status} photoUrl={driver.photoUrl} />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: STATUS_COLOR[driver.status] || '#94a3b8' }}
              title={STATUS_LABEL_PT[driver.status] || driver.status}
            />
            <span className="truncate font-black text-slate-900 group-hover:text-[#0a84ff]">{driver.name}</span>
          </div>
          <div className="truncate font-bold text-blue-500">{driver.phone || '3281813700 ...'}</div>
        </div>
      </div>
      <div className="min-w-0">
        <div className="truncate font-black text-slate-700">{driver.vehicleName || 'Viatura'}</div>
        <div className="truncate font-bold text-slate-500">{driver.plate || 'sem matricula'}</div>
      </div>
      <div className="min-w-0">
        <div className="truncate rounded-full bg-blue-50 px-2 py-1 text-[10px] font-black uppercase text-[#0a84ff]" title={driver.routeName}>{driver.routeName}</div>
        <div className="mt-1 truncate text-[10px] font-bold text-slate-400">{driver.completed}/{driver.total} paragens · {driver.progress}%</div>
      </div>
      <div>
        <div className="font-black text-slate-900">{driver.completed || 0}/{driver.total || 0}</div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-[#0a84ff]"
            style={{ width: `${Math.min(driver.progress || 0, 100)}%` }}
          />
        </div>
        <div className="mt-1 text-[10px] font-bold text-slate-500">{driver.progress || 0}% concl.</div>
      </div>
      <div className="text-right text-[10px] font-black text-slate-600">
        <div>{formatTime(driver.lastUpdate)}</div>
        <div className="text-slate-400">{relativeTime(driver.lastUpdate)}</div>
      </div>
    </div>
  )
}, areDriverRowsEqual)

function areDriverRowsEqual(prev, next) {
  return (
    prev.isSelected === next.isSelected &&
    prev.driver.id === next.driver.id &&
    prev.driver.status === next.driver.status &&
    prev.driver.vehicleId === next.driver.vehicleId &&
    prev.driver.routeId === next.driver.routeId &&
    prev.driver.completed === next.driver.completed &&
    prev.driver.total === next.driver.total &&
    prev.driver.progress === next.driver.progress &&
    prev.driver.lastUpdate === next.driver.lastUpdate &&
    prev.driver.photoUrl === next.driver.photoUrl
  )
}

function Avatar({ name, status, photoUrl }) {
  const [imgError, setImgError] = useState(false)
  useEffect(() => { setImgError(false) }, [photoUrl])

  const initials = String(name || 'M')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()

  return (
    <div className="relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-blue-100 text-xs font-black text-[#0a84ff] transition-transform group-hover:scale-105">
      <span>{initials || 'M'}</span>
      {photoUrl && !imgError ? (
        <img
          src={photoUrl}
          alt=""
          className="absolute inset-0 h-full w-full rounded-xl object-cover"
          onError={() => setImgError(true)}
        />
      ) : null}
      <span
        className={`absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-white ${{
          running: 'bg-emerald-500',
          stop: 'bg-amber-400',
          outside: 'bg-rose-500',
          offline: 'bg-slate-400',
          done: 'bg-blue-400',
          partial: 'bg-violet-400',
          planned: 'bg-slate-300',
        }[status] || 'bg-slate-400'}`}
      />
    </div>
  )
}

function StatusBadge({ status }) {
  return (
    <span className={`w-fit rounded-full border px-2 py-1 text-[10px] font-black ${STATUS_STYLES[status] || STATUS_STYLES.offline}`}>
      {status === 'offline' ? <WifiOff className="mr-1 inline" size={12} /> : <Wifi className="mr-1 inline" size={12} />}
      {STATUS_LABELS[status] || status}
    </span>
  )
}

function FooterMetric({ icon, label, value }) {
  return (
    <div className="flex items-center justify-center gap-2 whitespace-nowrap border-r border-slate-200 last:border-r-0">
      <span className="text-slate-500">{icon}</span>
      <span>{label}</span>
      <span className="text-slate-900">{value}</span>
    </div>
  )
}

function BottomPanel({ title, icon, children }) {
  return (
    <motion.div whileHover={{ y: -2 }} className="overflow-hidden rounded-t-[18px] bg-white shadow-sm ring-1 ring-slate-200 transition-shadow hover:shadow-md">
      <div className="flex h-10 items-center gap-2 border-b border-slate-200 px-4 text-sm font-black uppercase text-slate-900">
        {icon}
        {title}
      </div>
      <div className="h-[84px] p-3">{children}</div>
    </motion.div>
  )
}

function AlertItem({ title, body, ok = false, severity = 'stable' }) {
  const tone = {
    critical: 'border-rose-200 bg-rose-50 text-rose-900',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    info: 'border-blue-200 bg-blue-50 text-blue-900',
    stable: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  }[ok ? 'stable' : severity] || 'border-amber-200 bg-amber-50 text-amber-900'

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`rounded-xl border p-3 text-xs ${tone}`}>
      <div className="font-black">{title}</div>
      <div className="mt-1 font-semibold">{body}</div>
      <div className="mt-1 text-right text-[10px] font-black text-slate-400">Agora</div>
    </motion.div>
  )
}

function BigMetric({ value, label }) {
  return (
    <motion.div className="text-center" whileHover={{ scale: 1.04 }}>
      <motion.div key={String(value)} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-3xl font-black text-slate-900">{value}</motion.div>
      <div className="mt-1 text-xs font-black text-slate-400">{label}</div>
    </motion.div>
  )
}

function Insight({ title, body }) {
  return (
    <motion.div whileHover={{ x: 3 }} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-slate-800">
      <div className="font-black">{title}</div>
      <div className="mt-1 font-semibold">{body}</div>
    </motion.div>
  )
}

const STATUS_COLOR = {
  running: '#10b981',
  stop: '#f59e0b',
  outside: '#ef4444',
  offline: '#94a3b8',
  done: '#0a84ff',
  partial: '#8b5cf6',
  planned: '#64748b',
}

const STATUS_LABEL_PT = {
  running: 'Em rota',
  stop: 'Parado',
  outside: 'Fora de rota',
  offline: 'Offline',
  done: 'Concluído',
  partial: 'Parcial',
  planned: 'Planeado',
}

function DriverHoverCard({ driver, tracking, asideRef, cardY }) {
  const color = STATUS_COLOR[driver.status] || '#94a3b8'
  const statusLabel = STATUS_LABEL_PT[driver.status] || driver.status

  // Compute card top, clamped inside viewport
  const CARD_HEIGHT = 340
  const MARGIN = 12
  const top = Math.min(Math.max(cardY - CARD_HEIGHT / 2, MARGIN), window.innerHeight - CARD_HEIGHT - MARGIN)

  // Position to the right of the aside
  const asideRight = asideRef.current ? asideRef.current.getBoundingClientRect().right : 608

  const abbr = String(driver.name || 'M')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase()

  return (
    <motion.div
      initial={{ opacity: 0, x: -12, scale: 0.97 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -8, scale: 0.97 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      style={{ position: 'fixed', top, left: asideRight + 10, zIndex: 2000, width: 272 }}
      className="overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200"
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-4" style={{ borderBottom: `3px solid ${color}` }}>
        <div
          className="relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl text-white text-lg font-black"
          style={{ background: color }}
        >
          <span>{abbr || 'M'}</span>
          {driver.photoUrl ? (
            <img
              src={driver.photoUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : null}
          <span
            className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-white"
            style={{ background: color }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-black text-slate-900">{driver.name}</div>
          <div
            className="mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black text-white"
            style={{ background: color }}
          >
            {driver.status !== 'offline'
              ? <Wifi size={9} />
              : <WifiOff size={9} />}
            {statusLabel}
          </div>
          {driver.phone ? (
            <div className="mt-1 flex items-center gap-1 text-[11px] font-bold text-slate-500">
              <Phone size={11} />
              {driver.phone}
            </div>
          ) : null}
        </div>
      </div>

      {/* Body */}
      <div className="space-y-2 p-3">
        {/* Vehicle */}
        <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
          <Truck size={14} className="shrink-0 text-slate-400" />
          <div className="min-w-0">
            <div className="truncate text-[11px] font-black text-slate-800">{driver.vehicleName || 'Viatura'}</div>
            <div className="text-[10px] font-bold text-slate-400">{driver.plate || 'sem matrícula'}</div>
          </div>
        </div>

        {/* Route + progress */}
        <div className="rounded-xl bg-blue-50 px-3 py-2">
          <div className="flex items-center gap-1.5 text-[11px] font-black text-blue-700">
            <Route size={12} />
            <span className="truncate">{driver.routeName || '—'}</span>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-blue-200">
              <div
                className="h-full rounded-full bg-[#0a84ff] transition-all"
                style={{ width: `${Math.min(driver.progress || 0, 100)}%` }}
              />
            </div>
            <span className="text-[10px] font-black text-blue-700">{driver.progress || 0}%</span>
          </div>
          <div className="mt-1 text-[10px] font-bold text-blue-500">
            {driver.completed || 0} concluídas · {Math.max((driver.total || 0) - (driver.completed || 0), 0)} pendentes · {driver.total || 0} total
          </div>
        </div>

        {/* GPS / Speed */}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
            <Gauge size={13} className="shrink-0 text-slate-400" />
            <div>
              <div className="text-[11px] font-black text-slate-800">{Math.round(tracking?.speed || 0)} km/h</div>
              <div className="text-[10px] font-bold text-slate-400">Velocidade</div>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
            <Compass size={13} className="shrink-0 text-slate-400" />
            <div>
              <div className="text-[11px] font-black text-slate-800">{Math.round(tracking?.course || 0)}°</div>
              <div className="text-[10px] font-bold text-slate-400">Direção</div>
            </div>
          </div>
        </div>

        {/* Last update */}
        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-[10px]">
          <div className="flex items-center gap-1.5 font-bold text-slate-500">
            <Clock3 size={11} />
            Última atualização
          </div>
          <div className="font-black text-slate-700">
            {formatTime(driver.lastUpdate)} · <span className="text-slate-400">{relativeTime(driver.lastUpdate)}</span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
