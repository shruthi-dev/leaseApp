import { useCallback, useEffect, useState } from 'react'
import { getLease, isInProgress, type Lease } from './leases'
import { errorMessage } from './errors'

const POLL_MS = 3000

/** Loads one lease (raw, with its amendments) and keeps polling while it or an amendment is processing. */
export function useLease(id: string) {
  const [lease, setLease] = useState<Lease | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setLease(await getLease(id))
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    setLoading(true)
    refresh()
  }, [refresh])

  const polling = !!lease && (isInProgress(lease) || (lease.amendments ?? []).some(isInProgress))
  useEffect(() => {
    if (!polling) return
    const timer = setInterval(refresh, POLL_MS)
    return () => clearInterval(timer)
  }, [polling, refresh])

  return { lease, setLease, loading, error, refresh }
}
