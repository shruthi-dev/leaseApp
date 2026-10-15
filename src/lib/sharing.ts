// Portfolio sharing: an owner lets other users view all of their leases, read-only.
// RLS does the enforcing (see supabase/migrations/*_portfolio_shares.sql); this is just data access.

import { supabase } from './supabase'

export interface PortfolioShare {
  owner_id: string
  viewer_id: string
  owner_email: string
  viewer_email: string
  created_at: string
}

/** Errors share_portfolio() raises, translated under sharing.errors.* */
export const SHARE_ERRORS = ['user_not_found', 'cannot_share_with_self', 'already_shared'] as const
export type ShareError = (typeof SHARE_ERRORS)[number]

export class SharingError extends Error {
  constructor(public code: ShareError | null, message: string) {
    super(message)
  }
}

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id ?? null
}

/** People I share with, and people who share with me. */
export async function listShares(): Promise<{ mine: PortfolioShare[]; withMe: PortfolioShare[] }> {
  const [me, { data, error }] = await Promise.all([
    currentUserId(),
    supabase.from('portfolio_shares').select('*').order('created_at', { ascending: true }),
  ])
  if (error) throw error
  const rows = (data ?? []) as PortfolioShare[]
  return { mine: rows.filter((s) => s.owner_id === me), withMe: rows.filter((s) => s.viewer_id === me) }
}

/** Owner id → email for every portfolio shared with the current user. */
export async function sharedOwners(): Promise<Map<string, string>> {
  const { withMe } = await listShares()
  return new Map(withMe.map((s) => [s.owner_id, s.owner_email]))
}

export async function sharePortfolio(email: string): Promise<PortfolioShare> {
  const { data, error } = await supabase.rpc('share_portfolio', { viewer_email: email })
  if (error) {
    const code = SHARE_ERRORS.find((c) => error.message.includes(c)) ?? null
    throw new SharingError(code, error.message)
  }
  return data as PortfolioShare
}

/** Stops a share. The owner can remove a viewer, and a viewer can remove themselves. */
export async function removeShare(share: Pick<PortfolioShare, 'owner_id' | 'viewer_id'>): Promise<void> {
  const { error } = await supabase
    .from('portfolio_shares')
    .delete()
    .eq('owner_id', share.owner_id)
    .eq('viewer_id', share.viewer_id)
  if (error) throw error
}
