import type { jsPDF } from 'jspdf'

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  const chunk = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunk) {
    const end = Math.min(i + chunk, bytes.length)
    for (let j = i; j < end; j++) binary += String.fromCharCode(bytes[j]!)
  }
  return btoa(binary)
}

/** يحمّل Amiri من `public/fonts` ويُسجّله في jsPDF لدعم العربية في الـ PDF. */
export async function registerAmiriFont(doc: jsPDF): Promise<void> {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/')
  const url = `${base}fonts/Amiri-Regular.ttf`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`تعذّر تحميل الخط (${res.status})`)
  const b64 = arrayBufferToBase64(await res.arrayBuffer())
  doc.addFileToVFS('Amiri-Regular.ttf', b64)
  doc.addFont('Amiri-Regular.ttf', 'Amiri', 'normal', 'Identity-H')
  doc.setFont('Amiri', 'normal')
}
