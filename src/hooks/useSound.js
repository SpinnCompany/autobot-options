import { useRef, useCallback } from 'react'

/**
 * Simple sound effects using the Web Audio API.
 * No external dependencies required.
 */
export function useSound() {
  const ctxRef = useRef(null)

  const getCtx = useCallback(() => {
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext || window.webkitAudioContext)()
    }
    return ctxRef.current
  }, [])

  /**
   * Play a simple synthesized tone.
   * @param {'click'|'win'|'loss'|'tick'} type
   */
  const play = useCallback((type = 'click') => {
    try {
      const ctx = getCtx()
      if (ctx.state === 'suspended') ctx.resume()

      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)

      const now = ctx.currentTime
      gain.gain.setValueAtTime(0.15, now)

      switch (type) {
        case 'click':
          osc.type = 'sine'
          osc.frequency.setValueAtTime(800, now)
          osc.frequency.exponentialRampToValueAtTime(1200, now + 0.04)
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08)
          osc.start(now)
          osc.stop(now + 0.08)
          break

        case 'win':
          osc.type = 'sine'
          osc.frequency.setValueAtTime(523, now)
          osc.frequency.setValueAtTime(659, now + 0.08)
          osc.frequency.setValueAtTime(784, now + 0.16)
          gain.gain.setValueAtTime(0.15, now)
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3)
          osc.start(now)
          osc.stop(now + 0.3)
          break

        case 'loss':
          osc.type = 'sawtooth'
          osc.frequency.setValueAtTime(300, now)
          osc.frequency.exponentialRampToValueAtTime(150, now + 0.3)
          gain.gain.setValueAtTime(0.08, now)
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3)
          osc.start(now)
          osc.stop(now + 0.3)
          break

        case 'tick':
          osc.type = 'sine'
          osc.frequency.setValueAtTime(1800, now)
          gain.gain.setValueAtTime(0.04, now)
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03)
          osc.start(now)
          osc.stop(now + 0.03)
          break
      }
    } catch {
      // Silently fail — audio may not be available
    }
  }, [getCtx])

  return { play }
}