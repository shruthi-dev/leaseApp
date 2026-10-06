import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { getLocale, LOCALES, setLocale, t, useLocale, type Locale } from '../i18n'
import { CheckIcon, ChevronDownIcon, GlobeIcon } from './Icons'

/**
 * Option text: the language's name in the current UI language, with its own name in brackets so
 * people can find their language even when they can't read the current one,
 * e.g. "Spanish (Español)" in the English UI, "Spanisch (Español)" in the German UI.
 */
function optionLabel(uiCode: string, locale: Locale): string {
  if (locale.code === uiCode) return locale.label
  let name: string | undefined
  try {
    name = new Intl.DisplayNames([uiCode], { type: 'language' }).of(locale.code)
  } catch {
    // Intl.DisplayNames unavailable: fall back to the native name only.
  }
  if (!name || name === locale.code) return locale.label
  const capitalized = name.charAt(0).toLocaleUpperCase(uiCode) + name.slice(1)
  return capitalized === locale.label ? capitalized : `${capitalized} (${locale.label})`
}

/**
 * Language picker styled like the account menu. Renders nothing until a second language is
 * registered in i18n/index.ts. `align` positions the popup under the trigger.
 */
export function LanguageSwitcher({ align = 'right' }: { align?: 'right' | 'center' }) {
  const code = useLocale()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const items = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    if (!open) return
    // Focus the current language so arrow keys start from it.
    items.current[LOCALES.findIndex((l) => l.code === getLocale().code)]?.focus()
    const onClick = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  if (LOCALES.length < 2) return null
  const current = LOCALES.find((l) => l.code === code) ?? LOCALES[0]

  function onMenuKey(e: KeyboardEvent) {
    const index = items.current.findIndex((el) => el === document.activeElement)
    const focusAt = (i: number) => items.current[(i + LOCALES.length) % LOCALES.length]?.focus()
    if (e.key === 'ArrowDown') focusAt(index + 1)
    else if (e.key === 'ArrowUp') focusAt(index - 1)
    else if (e.key === 'Home') focusAt(0)
    else if (e.key === 'End') focusAt(LOCALES.length - 1)
    else if (e.key === 'Escape' || e.key === 'Tab') {
      setOpen(false)
      if (e.key === 'Escape') root.current?.querySelector<HTMLButtonElement>('.lang-trigger')?.focus()
      return
    } else return
    e.preventDefault()
  }

  return (
    <div className="lang-menu" ref={root}>
      <button
        className="lang-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t('nav.language')}: ${current.label}`}
        title={t('nav.language')}
        onClick={() => setOpen((o) => !o)}
      >
        <GlobeIcon />
        <span>{current.label}</span>
        <ChevronDownIcon className="lang-chevron" />
      </button>
      {open && (
        <div className={`menu lang-list align-${align}`} role="menu" aria-label={t('nav.language')} onKeyDown={onMenuKey}>
          {LOCALES.map((l, i) => (
            <button
              key={l.code}
              ref={(el) => {
                items.current[i] = el
              }}
              role="menuitemradio"
              aria-checked={l.code === code}
              className="menu-item lang-option"
              lang={l.code}
              onClick={() => {
                setOpen(false)
                setLocale(l.code)
              }}
            >
              <span>{optionLabel(code, l)}</span>
              {l.code === code && <CheckIcon className="lang-check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
