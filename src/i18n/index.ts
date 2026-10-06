import { useSyncExternalStore } from 'react'
import { en, type Messages } from './en'
import { fr } from './fr'
import { es } from './es'
import { de } from './de'

export interface Locale {
  /** BCP 47 code, e.g. "en", "es", "hi". Also set as <html lang>. */
  code: string
  /** Name shown in the language picker, written in that language (e.g. "Español"). */
  label: string
  messages: Messages
  /**
   * Locale for dates and money. Leave undefined to follow the browser's regional
   * settings (English does this, so en-GB users keep "5 Oct 2026").
   */
  intl?: string
}

// Register languages here. To add one: copy en.ts to e.g. es.ts as `export const es: Messages = {...}`,
// translate the strings (TypeScript fails the build if a key is missing), then add a line below.
// The language picker appears automatically once there is more than one entry.
export const LOCALES: Locale[] = [
  { code: 'en', label: 'English', messages: en },
  { code: 'fr', label: 'Français', intl: 'fr', messages: fr },
  { code: 'es', label: 'Español', intl: 'es', messages: es },
  { code: 'de', label: 'Deutsch', intl: 'de', messages: de },
]

const STORAGE_KEY = 'locale'

function find(code: string | null | undefined): Locale | undefined {
  if (!code) return undefined
  return LOCALES.find((l) => l.code === code) ?? LOCALES.find((l) => l.code === code.split('-')[0])
}

function initialLocale(): Locale {
  let saved: string | null = null
  try {
    saved = localStorage.getItem(STORAGE_KEY)
  } catch {
    // Storage blocked; fall back to the browser language.
  }
  return find(saved) ?? find(navigator.language) ?? LOCALES[0]
}

let current = initialLocale()
document.documentElement.lang = current.code
const listeners = new Set<() => void>()

export function getLocale(): Locale {
  return current
}

export function setLocale(code: string): void {
  const next = find(code)
  if (!next || next === current) return
  current = next
  document.documentElement.lang = next.code
  try {
    localStorage.setItem(STORAGE_KEY, next.code)
  } catch {
    // Preference just won't persist.
  }
  listeners.forEach((fn) => fn())
}

/** Re-renders the caller when the language changes; returns the active code. */
export function useLocale(): string {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    () => current.code,
  )
}

/** Dot-path keys into the message tree, e.g. "login.title". */
type Paths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Paths<T[K], `${P}${K}.`>
}[keyof T & string]

export type MessageKey = Paths<Messages>

/** Translate a key, substituting `{name}` placeholders from `params`. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const value = key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], current.messages)
  const text = typeof value === 'string' ? value : key
  return params ? text.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`)) : text
}
