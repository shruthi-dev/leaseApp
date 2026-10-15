// The organization's name: read by everyone (shown in the header), renamed by admins in Settings.
// Kept in a tiny shared store so a rename updates the header straight away.

import { useEffect, useState } from 'react'
import { supabase } from './supabase'

let current: string | null = null
const listeners = new Set<(name: string | null) => void>()

function publish(name: string | null) {
  current = name
  listeners.forEach((l) => l(name))
}

export async function loadOrganizationName(): Promise<string | null> {
  const { data, error } = await supabase.from('organization').select('name').maybeSingle()
  if (error) throw error
  publish(data?.name ?? null)
  return current
}

/** Admins only (RLS); anyone else gets an error. */
export async function renameOrganization(name: string): Promise<string> {
  const { data, error } = await supabase
    .from('organization')
    .update({ name: name.trim(), updated_at: new Date().toISOString() })
    .eq('id', true)
    .select('name')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Only admins can rename the organization.')
  publish(data.name)
  return data.name
}

/** The organization name, loaded once and kept current after renames. Null until loaded. */
export function useOrganizationName(): string | null {
  const [name, setName] = useState(current)
  useEffect(() => {
    listeners.add(setName)
    if (current === null) loadOrganizationName().catch(() => {})
    return () => {
      listeners.delete(setName)
    }
  }, [])
  return name
}
