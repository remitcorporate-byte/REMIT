import { useEffect, useState } from 'react'

export function useLoad<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')

    loader()
      .then((value) => active && setData(value))
      .catch((err) => active && setError(err instanceof Error ? err.message : 'Request failed'))
      .finally(() => active && setLoading(false))

    return () => {
      active = false
    }
  }, [tick, ...deps])

  return {
    data,
    loading,
    error,
    reload: () => setTick((value) => value + 1),
  }
}
