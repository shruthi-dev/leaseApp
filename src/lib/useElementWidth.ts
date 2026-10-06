import { useEffect, useState, type RefObject } from 'react'

/** Tracks an element's content width so SVG charts can lay out in real pixels. */
export function useElementWidth(ref: RefObject<HTMLElement | null>, fallback = 640): number {
  const [width, setWidth] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.floor(entry.contentRect.width))))
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return width
}
