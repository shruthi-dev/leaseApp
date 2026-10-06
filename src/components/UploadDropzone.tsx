import { useRef, useState, type DragEvent } from 'react'
import { UploadIcon } from './Icons'
import { MAX_FILE_BYTES } from '../lib/leases'
import { t } from '../i18n'

export function UploadDropzone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length) onFiles(files)
  }

  return (
    <div
      className={`dropzone${dragging ? ' dragging' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <span className="dropzone-icon">
        <UploadIcon width="22" height="22" />
      </span>
      <div>
        <p className="dropzone-title">
          {t('upload.title')} <span className="muted">{t('upload.or')}</span>{' '}
          <button type="button" className="link-button" onClick={() => input.current?.click()}>
            {t('upload.browse')}
          </button>
        </p>
        <p className="muted small">{t('upload.hint', { size: MAX_FILE_BYTES / 1024 / 1024 })}</p>
      </div>
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = '' // allow picking the same file again
          if (files.length) onFiles(files)
        }}
      />
    </div>
  )
}
