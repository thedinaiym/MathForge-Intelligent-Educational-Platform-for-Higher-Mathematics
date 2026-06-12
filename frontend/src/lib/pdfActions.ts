export function openPdfUrl(url: string) {
  const popup = window.open(url, '_blank', 'noopener,noreferrer')
  if (!popup) {
    window.location.assign(url)
  }
}

export function downloadPdfUrl(url: string, filename: string) {
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener noreferrer'
  link.style.display = 'none'

  document.body.appendChild(link)
  link.click()
  link.remove()
}
