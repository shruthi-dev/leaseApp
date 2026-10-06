import { useMemo, useState } from 'react'
import { UploadDropzone } from '../components/UploadDropzone'
import { LeaseTable } from '../components/LeaseTable'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Alert } from '../components/Alert'
import { SearchIcon } from '../components/Icons'
import { deleteLease, MAX_FILE_BYTES, retryLease, uploadLease, validatePdf, type Lease, type Progress } from '../lib/leases'
import { useLeases } from '../lib/useLeases'
import { errorMessage } from '../lib/errors'
import { describeLeaseError } from '../lib/leaseErrors'
import { t } from '../i18n'

export function LeasesPage() {
  const { leases, loading, error, refresh } = useLeases()
  const [progress, setProgress] = useState<Record<string, Progress>>({})
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
  const [messages, setMessages] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [toDelete, setToDelete] = useState<Lease | null>(null)
  const [deleting, setDeleting] = useState(false)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return leases
    return leases.filter((l) =>
      [l.file_name, l.tenant, l.landlord, l.premises_address, l.premises].some((v) => v?.toLowerCase().includes(q)),
    )
  }, [leases, query])

  const onProgress = (leaseId: string, p: Progress) => {
    setProgress((prev) => ({ ...prev, [leaseId]: p }))
    // Pick up newly created rows and status changes as each step lands.
    refresh()
  }

  const clearProgress = (leaseId?: string) =>
    setProgress((prev) => {
      if (!leaseId) return prev
      const next = { ...prev }
      delete next[leaseId]
      return next
    })

  async function onFiles(files: File[]) {
    const problems: string[] = []
    const valid = files.filter((file) => {
      const issue = validatePdf(file)
      if (issue === 'notPdf') problems.push(t('upload.notPdf', { name: file.name }))
      if (issue === 'tooLarge') problems.push(t('upload.tooLarge', { name: file.name, size: MAX_FILE_BYTES / 1024 / 1024 }))
      return !issue
    })
    setMessages(problems)

    // One at a time keeps the browser responsive while pdf.js parses large files.
    for (const file of valid) {
      let leaseId: string | undefined
      try {
        await uploadLease(file, (id, p) => {
          leaseId = id
          onProgress(id, p)
        })
      } catch (err) {
        // Once the row exists its error is shown in the table; only report failures before that.
        if (!leaseId) {
          const message = describeLeaseError(err)
          setMessages((prev) => [...prev, t('upload.failed', { name: file.name, message })])
        }
      } finally {
        clearProgress(leaseId)
        refresh()
      }
    }
  }

  async function onRetry(lease: Lease) {
    setBusyIds((prev) => new Set(prev).add(lease.id))
    try {
      await retryLease(lease, onProgress)
    } catch {
      // The failure is saved on the lease and shown in its row.
    } finally {
      clearProgress(lease.id)
      setBusyIds((prev) => {
        const next = new Set(prev)
        next.delete(lease.id)
        return next
      })
      refresh()
    }
  }

  async function confirmDelete() {
    if (!toDelete) return
    setDeleting(true)
    try {
      await deleteLease(toDelete)
      setToDelete(null)
      refresh()
    } catch (err) {
      const message = errorMessage(err)
      setMessages([t('leases.deleteError', { message })])
      setToDelete(null)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <h1>{t('leases.title')}</h1>
          <p className="muted">{t('leases.subtitle')}</p>
        </div>
      </header>

      <UploadDropzone onFiles={onFiles} />

      {messages.length > 0 && (
        <div className="stack">
          {messages.map((m, i) => (
            <Alert key={i} kind="error" message={m} />
          ))}
        </div>
      )}
      {error && <Alert kind="error" message={t('leases.loadError', { message: error })} />}

      <div className="card table-card">
        <div className="table-toolbar">
          <span className="muted small">
            {leases.length === 1 ? t('leases.countOne') : t('leases.count', { count: leases.length })}
          </span>
          <label className="search">
            <SearchIcon />
            <input
              type="search"
              placeholder={t('leases.searchPlaceholder')}
              aria-label={t('leases.searchPlaceholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>

        {loading ? (
          <p className="empty muted">{t('common.loading')}</p>
        ) : leases.length === 0 ? (
          <p className="empty muted">{t('leases.empty')}</p>
        ) : filtered.length === 0 ? (
          <p className="empty muted">{t('leases.noMatches')}</p>
        ) : (
          <LeaseTable
            leases={filtered}
            progress={progress}
            busyIds={busyIds}
            onRetry={onRetry}
            onDelete={setToDelete}
          />
        )}
      </div>

      <ConfirmDialog
        open={!!toDelete}
        title={t('leases.deleteTitle')}
        body={t('leases.deleteBody', { name: toDelete?.file_name ?? '' })}
        confirmLabel={t('common.delete')}
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => !deleting && setToDelete(null)}
      />
    </section>
  )
}
