// Browser-side PDF text extraction with pdf.js. Loaded lazily so the library
// is only downloaded when someone actually uploads a lease.

export interface ExtractedPage {
  page_number: number
  text: string
}

export async function extractPdfPages(
  data: ArrayBuffer,
  onPage?: (done: number, total: number) => void,
): Promise<ExtractedPage[]> {
  const [pdfjs, { default: workerUrl }] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

  const task = pdfjs.getDocument({ data })
  const doc = await task.promise
  try {
    const pages: ExtractedPage[] = []
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n)
      const content = await page.getTextContent()
      let text = ''
      for (const item of content.items) {
        if (!('str' in item)) continue
        text += item.str + (item.hasEOL ? '\n' : ' ')
      }
      pages.push({ page_number: n, text: text.replace(/[ \t]+\n/g, '\n').trim() })
      page.cleanup()
      onPage?.(n, doc.numPages)
    }
    return pages
  } finally {
    await task.destroy()
  }
}
