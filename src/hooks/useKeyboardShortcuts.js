import { useEffect, useCallback } from 'react'
import { AMOUNT_PRESETS } from '../data/mockData'

/**
 * Global keyboard shortcuts for the trading terminal.
 * Skips when focus is in an input/textarea/select element.
 *
 * Shortcuts:
 *   Enter / Space → CALL
 *   Escape       → PUT
 *   1-6          → Amount presets ($10, $25, $50, $100, $250, $500)
 *   ArrowUp      → Increase amount by $1
 *   ArrowDown    → Decrease amount by $1
 */
export function useKeyboardShortcuts({
  onCall,
  onPut,
  amount,
  setAmount,
  balance,
  enabled = true,
}) {
  const handleKeyDown = useCallback((e) => {
    if (!enabled) return

    // Don't fire when user is typing in an input
    const tag = e.target.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

    // Don't fire when modifiers are held (Ctrl+C, Alt+Tab, etc.)
    if (e.ctrlKey || e.altKey || e.metaKey) return

    const key = e.key

    switch (key) {
      case 'Enter':
      case ' ':
        e.preventDefault()
        onCall?.()
        break

      case 'Escape':
        e.preventDefault()
        onPut?.()
        break

      case 'ArrowUp': {
        e.preventDefault()
        const current = parseFloat(amount) || 0
        const next = Math.min(balance, current + 1)
        setAmount?.(String(next))
        break
      }

      case 'ArrowDown': {
        e.preventDefault()
        const current = parseFloat(amount) || 0
        const next = Math.max(1, current - 1)
        setAmount?.(String(next))
        break
      }

      default:
        // Number keys 1-6 for amount presets
        if (key >= '1' && key <= '6') {
          const idx = parseInt(key, 10) - 1
          if (idx < AMOUNT_PRESETS.length) {
            e.preventDefault()
            setAmount?.(String(AMOUNT_PRESETS[idx]))
          }
        }
        break
    }
  }, [enabled, onCall, onPut, amount, setAmount, balance])

  useEffect(() => {
    if (!enabled) return
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [enabled, handleKeyDown])
}
