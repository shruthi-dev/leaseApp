/** Readable message from anything thrown, including Supabase's plain-object errors. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') return err.message
  return String(err)
}
