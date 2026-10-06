// CSV export. Lease values come from uploaded documents, so cells are escaped and
// guarded against spreadsheet formula injection.

export type CsvValue = string | number | null | undefined

function cell(value: CsvValue): string {
  if (value === null || value === undefined) return ''
  let text = String(value)
  // A leading =, +, -, @ (or tab/CR) makes Excel/Sheets treat text as a formula.
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(header: string[], rows: CsvValue[][]): string {
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')
}

export function downloadCsv(filename: string, csv: string): void {
  // BOM so Excel opens UTF-8 (accented names, currency symbols) correctly.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
