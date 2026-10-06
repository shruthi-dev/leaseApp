import { useCallback, useEffect, useState } from 'react'
import { isInProgress, listLeases, type Lease } from './leases'
import { applyAmendments } from './amendments'
import { errorMessage } from './errors'

const POLL_MS = 3000

/**
 * Loads the user's leases with amendments applied (so every page sees current terms) and keeps
 * polling while any lease or amendment is still processing.
 */
export function useLeases() {
  const [leases, setLeases] = useState<Lease[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setLeases((await listLeases()).map(applyAmendments))
      setError(null)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const polling = leases.some((l) => isInProgress(l) || (l.amendments ?? []).some(isInProgress))
  useEffect(() => {
    if (!polling) return
    const timer = setInterval(refresh, POLL_MS)
    return () => clearInterval(timer)
  }, [polling, refresh])

  return { leases, loading, error, refresh }
}
