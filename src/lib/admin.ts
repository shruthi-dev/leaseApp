// Organization admin: the role comes from public.profiles (set in SQL), and list_users() returns
// every signed-up user to admins only. See supabase/migrations/*_profiles_admin.sql.

import { supabase } from './supabase'

export type Role = 'admin' | 'member'

export interface OrgUser {
  id: string
  email: string
  role: Role
  created_at: string
  last_sign_in_at: string | null
  lease_count: number
  /** The current (admin) user already shares their leases with this person. */
  can_view_my_leases: boolean
}

export async function getMyRole(): Promise<Role> {
  const { data: session } = await supabase.auth.getSession()
  const id = session.session?.user.id
  if (!id) return 'member'
  const { data, error } = await supabase.from('profiles').select('role').eq('id', id).maybeSingle()
  if (error) throw error
  return (data?.role as Role | undefined) ?? 'member'
}

/** Emails of the organization's admins; any signed-in user may read these. */
export async function listAdmins(): Promise<string[]> {
  const { data, error } = await supabase.rpc('list_admins')
  if (error) throw error
  return ((data ?? []) as { email: string }[]).map((a) => a.email)
}

export async function listUsers(): Promise<OrgUser[]> {
  const { data, error } = await supabase.rpc('list_users')
  if (error) throw error
  return (data ?? []).map((u: OrgUser) => ({ ...u, lease_count: Number(u.lease_count) }))
}
