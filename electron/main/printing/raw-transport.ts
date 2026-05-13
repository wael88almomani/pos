import { openSync, writeSync, closeSync } from 'node:fs'
import { createConnection } from 'node:net'

function comPath(port: string): string {
  const p = port.trim().toUpperCase()
  if (p.startsWith('\\\\.\\')) return p
  if (p.startsWith('COM')) return `\\\\.\\${p}`
  return `\\\\.\\${p}`
}

export function sendRawToCom(port: string, data: Buffer): { ok: boolean; error?: string } {
  try {
    const path = comPath(port)
    const fd = openSync(path, 'w')
    try {
      writeSync(fd, data)
    } finally {
      closeSync(fd)
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export function sendRawToTcp(host: string, port: number, data: Buffer, timeoutMs = 5000): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const sock = createConnection({ host, port })
    const t = setTimeout(() => {
      sock.destroy()
      resolve({ ok: false, error: 'tcp_timeout' })
    }, timeoutMs)
    sock.on('error', (err) => {
      clearTimeout(t)
      resolve({ ok: false, error: err.message })
    })
    sock.on('connect', () => {
      sock.write(data, () => {
        sock.end()
      })
    })
    sock.on('close', () => {
      clearTimeout(t)
      resolve({ ok: true })
    })
  })
}

export async function sendRawEscpos(
  transport: { type: 'com'; port: string } | { type: 'tcp'; host: string; port: number },
  data: Buffer
): Promise<{ ok: boolean; error?: string }> {
  if (transport.type === 'com') return sendRawToCom(transport.port, data)
  return sendRawToTcp(transport.host, transport.port, data)
}

/** ESC/POS cash drawer pulse (pin 2) */
export const ESCPOS_DRAWER_KICK_PIN2 = Buffer.from([0x1b, 0x70, 0x01, 0x19, 0xfa])
