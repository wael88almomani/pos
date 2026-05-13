import dgram from 'node:dgram'
import { logInfo, logWarn } from '../logger'

const PORT = 45123

let socket: dgram.Socket | null = null

export function startLanDiscovery(deviceId: string, onPeer?: (info: { deviceId: string; address: string }) => void): void {
  if (socket) return
  try {
    const s = dgram.createSocket('udp4')
    s.on('error', (err) => logWarn('lan discovery socket', err.message))
    s.on('message', (msg, rinfo) => {
      try {
        const j = JSON.parse(msg.toString()) as { t?: string; deviceId?: string }
        if (j.t === 'pos-lan-ping' && j.deviceId && j.deviceId !== deviceId) {
          onPeer?.({ deviceId: j.deviceId, address: rinfo.address })
        }
      } catch {
        /* ignore */
      }
    })
    s.bind(PORT, () => {
      logInfo('lan discovery listening', { port: PORT })
    })
    socket = s

    const announce = () => {
      const payload = Buffer.from(JSON.stringify({ t: 'pos-lan-ping', deviceId }))
      s.setBroadcast(true)
      s.send(payload, PORT, '255.255.255.255', (err) => {
        if (err) logWarn('lan broadcast', err.message)
      })
    }
    announce()
    setInterval(announce, 15_000)
  } catch (e) {
    logWarn('lan discovery start failed', String(e))
  }
}

export function stopLanDiscovery(): void {
  try {
    socket?.close()
  } catch {
    /* */
  }
  socket = null
}
