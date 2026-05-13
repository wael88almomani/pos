/** Code128 كصورة PNG base64 لإدراجها في HTML receipt */

export async function code128DataUrl(text: string): Promise<string | null> {
  const t = text.trim().slice(0, 48)
  if (!t) return null
  try {
    const mod = (await import('bwip-js/node')) as unknown as {
      toBuffer?: (o: object) => Promise<Buffer>
      default?: { toBuffer?: (o: object) => Promise<Buffer> }
    }
    const toBuffer = mod.toBuffer ?? mod.default?.toBuffer
    if (!toBuffer) return null
    const png = await toBuffer({
      bcid: 'code128',
      text: t,
      scale: 2,
      height: 12,
      includetext: true,
      textxalign: 'center'
    })
    return `data:image/png;base64,${png.toString('base64')}`
  } catch {
    return null
  }
}
