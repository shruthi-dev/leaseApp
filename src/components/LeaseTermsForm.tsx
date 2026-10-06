import { useState, type FormEvent } from 'react'
import type { EditableTerms, Lease } from '../lib/leases'
import { Alert } from './Alert'
import { t } from '../i18n'

type Draft = Record<keyof EditableTerms, string>

const toDraft = (l: Lease): Draft => ({
  landlord: l.landlord ?? '',
  tenant: l.tenant ?? '',
  premises_address: l.premises_address ?? '',
  premises: l.premises ?? '',
  commencement_date: l.commencement_date ?? '',
  expiration_date: l.expiration_date ?? '',
  monthly_rent: l.monthly_rent?.toString() ?? '',
  currency: l.currency ?? '',
  security_deposit: l.security_deposit?.toString() ?? '',
  renewal_options: l.renewal_options ?? '',
  summary: l.summary ?? '',
})

const text = (v: string) => v.trim() || null
const amount = (v: string) => (v.trim() === '' ? null : Number(v))

interface Props {
  lease: Lease
  saving: boolean
  onSave: (terms: EditableTerms) => void
  onCancel: () => void
}

export function LeaseTermsForm({ lease, saving, onSave, onCancel }: Props) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(lease))
  const [error, setError] = useState<string | null>(null)
  const set = (key: keyof Draft) => (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [key]: e.target.value }))

  function submit(e: FormEvent) {
    e.preventDefault()
    const terms: EditableTerms = {
      landlord: text(draft.landlord),
      tenant: text(draft.tenant),
      premises_address: text(draft.premises_address),
      premises: text(draft.premises),
      commencement_date: text(draft.commencement_date),
      expiration_date: text(draft.expiration_date),
      monthly_rent: amount(draft.monthly_rent),
      currency: text(draft.currency)?.toUpperCase() ?? null,
      security_deposit: amount(draft.security_deposit),
      renewal_options: text(draft.renewal_options),
      summary: text(draft.summary),
    }
    if ([terms.monthly_rent, terms.security_deposit].some((n) => n !== null && (!Number.isFinite(n) || n < 0))) {
      return setError(t('detail.invalidAmount'))
    }
    if (terms.currency && !/^[A-Z]{3}$/.test(terms.currency)) return setError(t('detail.invalidCurrency'))
    if (terms.commencement_date && terms.expiration_date && terms.expiration_date < terms.commencement_date) {
      return setError(t('detail.invalidDates'))
    }
    setError(null)
    onSave(terms)
  }

  return (
    <form className="form terms-form" onSubmit={submit}>
      <div className="form-grid">
        <label>
          {t('columns.tenant')}
          <input value={draft.tenant} onChange={set('tenant')} />
        </label>
        <label>
          {t('columns.landlord')}
          <input value={draft.landlord} onChange={set('landlord')} />
        </label>
        <label className="span-2">
          {t('columns.address')}
          <input value={draft.premises_address} onChange={set('premises_address')} />
        </label>
        <label className="span-2">
          {t('detail.premisesDescription')}
          <textarea rows={2} value={draft.premises} onChange={set('premises')} />
        </label>
        <label>
          {t('columns.commencement')}
          <input type="date" value={draft.commencement_date} onChange={set('commencement_date')} />
        </label>
        <label>
          {t('columns.expiration')}
          <input type="date" value={draft.expiration_date} onChange={set('expiration_date')} />
        </label>
        <label>
          {t('columns.monthlyRent')}
          <input type="number" min="0" step="0.01" inputMode="decimal" value={draft.monthly_rent} onChange={set('monthly_rent')} />
        </label>
        <label>
          {t('columns.deposit')}
          <input type="number" min="0" step="0.01" inputMode="decimal" value={draft.security_deposit} onChange={set('security_deposit')} />
        </label>
        <label>
          {t('detail.currency')}
          <input value={draft.currency} onChange={set('currency')} maxLength={3} placeholder="USD" className="input-short" />
        </label>
        <label className="span-2">
          {t('columns.renewal')}
          <textarea rows={3} value={draft.renewal_options} onChange={set('renewal_options')} />
        </label>
        <label className="span-2">
          {t('columns.summary')}
          <textarea rows={5} value={draft.summary} onChange={set('summary')} />
        </label>
      </div>
      <Alert kind="error" message={error} />
      <div className="form-actions">
        <button type="button" className="button-secondary" onClick={onCancel} disabled={saving}>
          {t('common.cancel')}
        </button>
        <button type="submit" disabled={saving}>
          {saving ? t('common.loading') : t('detail.save')}
        </button>
      </div>
    </form>
  )
}
