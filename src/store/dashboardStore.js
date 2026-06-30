import { create } from 'zustand'

export const useDashboardStore = create((set) => ({
  selectedDriverId: null,
  selectedVehicleId: null,
  selectedRouteId: null,

  activeTab: 'all',
  search: '',
  routeFilter: 'all',

  followVehicle: false,

  mapFilters: {
    running: true,
    stop: true,
    outside: true,
    offline: false,
    done: true,
    planned: true,
    stops: true,
    routes: true,
  },

  setSelectedDriverId: (id) => set({ selectedDriverId: id }),
  setSelectedVehicleId: (id) => set({ selectedVehicleId: id }),
  setSelectedRouteId: (id) => set({ selectedRouteId: id }),

  setActiveTab: (tab) => set({ activeTab: tab }),
  setSearch: (search) => set({ search }),
  setRouteFilter: (routeId) => set({ routeFilter: routeId }),

  setFollowVehicle: (value) => set({ followVehicle: value }),

  toggleMapFilter: (key) =>
    set((state) => ({
      mapFilters: {
        ...state.mapFilters,
        [key]: !state.mapFilters[key],
      },
    })),
}))
