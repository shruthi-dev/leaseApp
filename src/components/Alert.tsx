export function Alert({ kind, message }: { kind: 'error' | 'success'; message: string | null }) {
  if (!message) return null
  return (
    <p className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {message}
    </p>
  )
}
