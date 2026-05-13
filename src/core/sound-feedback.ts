/** أصوات خفيفة عبر Web Audio — بدون ملفات خارجية */

function getPrefs(): { enabled: boolean; volume: number } {
  try {
    const en = localStorage.getItem('ui.sound.enabled')
    const vol = localStorage.getItem('ui.sound.volume')
    return {
      enabled: en !== '0',
      volume: Math.min(1, Math.max(0, parseFloat(vol ?? '0.45') || 0.45))
    }
  } catch {
    return { enabled: true, volume: 0.45 }
  }
}

function beep(freq: number, duration: number, type: OscillatorType = 'sine') {
  const { enabled, volume } = getPrefs()
  if (!enabled) return
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return
  const ctx = new Ctx()
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = type
  osc.frequency.value = freq
  g.gain.value = volume * 0.15
  osc.connect(g)
  g.connect(ctx.destination)
  osc.start()
  osc.stop(ctx.currentTime + duration)
  setTimeout(() => ctx.close(), (duration + 0.05) * 1000)
}

export function playScanSound(): void {
  beep(880, 0.04, 'square')
}

export function playSuccessSound(): void {
  beep(523, 0.07)
  setTimeout(() => beep(784, 0.09), 70)
}

export function playErrorSound(): void {
  beep(180, 0.18, 'sawtooth')
}

export function playPaymentSound(): void {
  beep(392, 0.08)
  setTimeout(() => beep(523, 0.1), 90)
}
