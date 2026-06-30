import { useQuery } from '@tanstack/react-query'
import { normalizeDashboard } from '../utils/normalizeDashboard.js'

const API_URL = import.meta.env.VITE_API_URL

function getAssetBaseUrl() {
  try {
    return new URL(API_URL).origin
  } catch {
    return ''
  }
}

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard-full'],
    queryFn: async () => {
      const response = await fetch(API_URL, {
        method: 'GET',
        cache: 'no-store',
      })

      if (!response.ok) {
        throw new Error('Erro ao carregar dashboard')
      }

      const data = await response.json()

      return normalizeDashboard(data, { assetBaseUrl: getAssetBaseUrl() })
    },
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
    staleTime: 12000,
    retry: 2,
  })
}
