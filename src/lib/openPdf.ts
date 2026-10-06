import { getFileUrl } from './documents'

/**
 * Opens a private PDF in a new tab, optionally at a page. The tab is opened synchronously
 * (inside the click) so popup blockers allow it, then pointed at the signed URL once it arrives.
 */
export function openPdf(path: string, page?: number | null): void {
  const tab = window.open('about:blank', '_blank')
  getFileUrl(path)
    .then((url) => {
      const target = page ? `${url}#page=${page}` : url
      if (tab) {
        tab.opener = null
        tab.location.href = target
      } else {
        window.location.href = target
      }
    })
    .catch(() => tab?.close())
}
