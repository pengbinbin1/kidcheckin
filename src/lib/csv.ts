// CSV 构建与导出（带 BOM，保证 Excel 打开中文不乱码）

export function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function buildCSV(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvCell).join(',')]
  for (const r of rows) lines.push(r.map(csvCell).join(','))
  return `\ufeff${lines.join('\r\n')}`
}

export function csvFileName(base: string): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${base}_${y}${m}${day}.csv`
}

/** 导出 CSV：优先走系统分享（iOS 保存到「文件」/转发），否则直接下载 */
export async function exportCSV(fileName: string, csv: string): Promise<'shared' | 'downloaded'> {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })

  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean }
  if (nav.canShare && typeof File !== 'undefined') {
    const file = new File([blob], fileName, { type: 'text/csv;charset=utf-8' })
    if (nav.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] })
        return 'shared'
      } catch (e) {
        if ((e as DOMException).name === 'AbortError') return 'shared'
      }
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
  return 'downloaded'
}
