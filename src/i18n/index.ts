import { en, type Messages } from './en'

const locales: Record<string, Messages> = { en }

let current: Messages = en

export function setLocale(code: string) {
  current = locales[code] ?? en
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
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], current)
  const text = typeof value === 'string' ? value : key
  return params ? text.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`)) : text
}
