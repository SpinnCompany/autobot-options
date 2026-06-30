import { useState, useCallback, useEffect, useRef } from 'react'

// ── Constants ────────────────────────────────────────────────

const STORAGE_KEY = 'autobot_options_history'
export const MAX_OPEN = 5
export const DEFAULT_BALANCE = 10000
export const DEFAULT_PAYOUT = 82
export const WIN_RATE = 0.55
export const EARLY_CLOSE_REFUND = 0.65
export const STARTING_BASE_AMOUNT = 100

// ── DemoEngine (pure JS, no React dependency) ─────────────────

export class DemoEngine {
  balance = DEFAULT_BALANCE
  positions = []
  baseAmount = STARTING_BASE_AMOUNT
  lastTradeResult = null  // 'win' | 'loss' | null
  lastTradeProfit = 0     // dollar profit/loss from last resolved trade

  maxOpen = MAX_OPEN
  winRate = WIN_RATE
  defaultPayout = DEFAULT_PAYOUT
  earlyCloseRefund = EARLY_CLOSE_REFUND
  pendingOrders = []       // entry orders awaiting price trigger

  // Risk management
  dailyLossLimit = 0       // 0 = disabled, e.g. 500 = block when daily P&L <= -$500
  maxPositionPct = 0       // 0 = disabled, e.g. 10 = max 10% of balance per trade
  maxDailyTrades = 0       // 0 = disabled, e.g. 50 = max trades per day
  minPayoutPct = 0         // 0 = disabled, e.g. 85 = reject trades on assets with payout < 85%
  newsBlockEnabled = false // block trades during active news events
  newsBlockLevels = { high: true, medium: true, low: false }  // which impact levels to block
  activeNewsEvents = []    // populated by economic calendar — { impact: 'high'|'medium'|'low', ... }
  dailyTradeCount = 0
  _tradeDay = null         // tracks which day the count is for

  // Callbacks — set by the React hook wrapper
  onStateChange = null   // () => void
  onToast = null         // (message: string, type: string) => void
  onSound = null         // (type: string) => void

  // ── Callback helpers ─────────────────────────────────────

  _notify() {
    this.onStateChange?.()
  }

  _toast(msg, type = 'success') {
    this.onToast?.(msg, type)
  }

  _sound(type) {
    this.onSound?.(type)
  }

  // ── Trade Execution ──────────────────────────────────────

  /**
   * Place a demo trade. Returns true if the trade was accepted.
   * Expiry is handled by checkExpiry() on the tick loop — no setTimeout needed.
   */
  placeTrade({ asset, direction, amount, duration, tp, sl, payoutPercent, entryPrice }) {
    const amt = parseFloat(amount) || 0

    // Validation
    if (amt <= 0) {
      this._toast('Enter a valid amount', 'error')
      return false
    }
    if (amt > this.balance) {
      this._toast('Insufficient balance', 'error')
      return false
    }
    if (this.openCount >= this.maxOpen) {
      this._toast(`Max ${this.maxOpen} open positions allowed`, 'error')
      return false
    }

    // ── Risk management checks ──
    // Reset daily counter on day change
    const today = new Date().toDateString()
    if (this._tradeDay !== today) {
      this._tradeDay = today
      this.dailyTradeCount = 0
    }

    // Daily trade limit
    if (this.maxDailyTrades > 0 && this.dailyTradeCount >= this.maxDailyTrades) {
      this._toast(`Daily trade limit (${this.maxDailyTrades}) reached`, 'error')
      return false
    }

    // Daily loss limit
    if (this.dailyLossLimit > 0 && this.dailyPnl <= -this.dailyLossLimit) {
      this._toast(`Daily loss limit (-$${this.dailyLossLimit}) hit — trading blocked`, 'error')
      return false
    }

    // Max position size % of balance
    if (this.maxPositionPct > 0) {
      const maxAmt = this.balance * (this.maxPositionPct / 100)
      if (amt > maxAmt) {
        this._toast(`Position size capped at ${this.maxPositionPct}% of balance ($${maxAmt.toFixed(2)})`, 'error')
        return false
      }
    }

    // Min payout % — reject "cheap" assets
    if (this.minPayoutPct > 0) {
      const pct = payoutPercent || this.defaultPayout
      if (pct < this.minPayoutPct) {
        this._toast(`${asset} payout ${pct}% is below minimum ${this.minPayoutPct}%`, 'error')
        return false
      }
    }

    // News event blocker — reject during active high/medium/low impact events
    if (this.newsBlockEnabled && this.activeNewsEvents.length > 0) {
      const blockingLevels = Object.entries(this.newsBlockLevels)
        .filter(([, enabled]) => enabled)
        .map(([level]) => level)
      const hasBlocking = this.activeNewsEvents.some(ev => blockingLevels.includes(ev.impact))
      if (hasBlocking) {
        const impacts = this.activeNewsEvents.map(e => e.impact.toUpperCase()).join(', ')
        this._toast(`News event active (${impacts}) — trading blocked`, 'error')
        return false
      }
    }

    // Increment daily trade counter
    this.dailyTradeCount++

    // TP/SL validation relative to direction
    const tpVal = parseFloat(tp) || 0
    const slVal = parseFloat(sl) || 0
    if (tpVal > 0 && slVal > 0) {
      if (direction === 'call') {
        if (tpVal <= entryPrice) {
          this._toast('TP must be above entry for CALL', 'error')
          return false
        }
        if (slVal >= entryPrice) {
          this._toast('SL must be below entry for CALL', 'error')
          return false
        }
      } else {
        if (tpVal >= entryPrice) {
          this._toast('TP must be below entry for PUT', 'error')
          return false
        }
        if (slVal <= entryPrice) {
          this._toast('SL must be above entry for PUT', 'error')
          return false
        }
      }
    }

    const pct = payoutPercent || this.defaultPayout
    const id = `pos-${Date.now()}`
    const now = Date.now()
    const position = {
      id,
      asset,
      direction,
      amount: amt,
      duration,
      entryPrice,
      openTime: now,
      expiresAt: now + duration * 1000,
      status: 'open',
      pnl: 0,
      payoutPercent: pct,
      tp: tpVal || undefined,
      sl: slVal || undefined,
      note: '',             // trade journal note
      closeReason: null,    // set on close: 'expired' | 'tp' | 'sl' | 'early_close'
    }

    // Apply immediately
    this.positions = [position, ...this.positions]
    this.balance -= amt

    this._toast(`${direction.toUpperCase()} ${asset} — $${amt}`, 'success')
    this._sound('click')
    this._notify()

    this._persist()
    return true
  }

  /**
   * Early-close a position. Returns true if successful.
   */
  closePosition(posId, currentPrice) {
    const pos = this.positions.find(p => p.id === posId)
    if (!pos || pos.status !== 'open') return false

    const refund = pos.amount * this.earlyCloseRefund
    const pnl = refund - pos.amount

    this.balance += refund
    this._toast(
      `Closed early — $${refund.toFixed(2)} refund (${Math.round(this.earlyCloseRefund * 100)}%)`,
      'error'
    )

    this.positions = this.positions.map(p => {
      if (p.id !== posId) return p
      return {
        ...p,
        status: 'loss',
        pnl,
        exitPrice: currentPrice,
        closedAt: Date.now(),
        closeReason: 'early_close',
      }
    })

    this._persist()
    this._notify()
    return true
  }

  /**
   * Double up — open a second position with the same amount and direction.
   */
  doubleUp(pos, currentPrice) {
    if (!pos || pos.status !== 'open') return false
    if (this.openCount >= this.maxOpen) {
      this._toast(`Max ${this.maxOpen} open positions`, 'error')
      return false
    }
    if (pos.amount > this.balance) {
      this._toast('Insufficient balance for Double Up', 'error')
      return false
    }

    const pct = pos.payoutPercent || this.defaultPayout
    const id = `pos-${Date.now()}`
    const now = Date.now()
    const position = {
      id,
      asset: pos.asset,
      direction: pos.direction,
      amount: pos.amount,
      duration: pos.duration,
      entryPrice: currentPrice,
      openTime: now,
      expiresAt: now + pos.duration * 1000,
      status: 'open',
      pnl: 0,
      payoutPercent: pct,
      tp: pos.tp || undefined,
      sl: pos.sl || undefined,
      note: '',
      closeReason: null,
    }

    this.positions = [position, ...this.positions]
    this.balance -= pos.amount

    this._toast(`Double Up ${pos.direction.toUpperCase()} ${pos.asset} — $${pos.amount}`, 'success')
    this._sound('click')
    this._notify()

    this._persist()
    return true
  }

  // ── Trade Journal ───────────────────────────────────────

  setPositionNote(posId, note) {
    const pos = this.positions.find(p => p.id === posId)
    if (!pos) return false
    this.positions = this.positions.map(p =>
      p.id === posId ? { ...p, note: note || '' } : p
    )
    this._persist()
    this._notify()
    return true
  }

  // ── Rollover / Extend ────────────────────────────────────

  /**
   * Extend an open position's duration. Charges 10% of the position amount as fee.
   * @returns {boolean} true if successful
   */
  extendPosition(posId, extraSeconds, currentPrice) {
    const pos = this.positions.find(p => p.id === posId)
    if (!pos || pos.status !== 'open') {
      this._toast('Position not found or already closed', 'error')
      return false
    }

    const fee = pos.amount * 0.10
    if (fee > this.balance) {
      this._toast('Insufficient balance for extend fee', 'error')
      return false
    }

    // Charge the extension fee
    this.balance -= fee

    // Extend duration — recalculate expiresAt from now + remaining + extra
    const remainingMs = Math.max(0, pos.expiresAt - Date.now())
    const newDurationSec = parseFloat(((remainingMs / 1000) + extraSeconds).toFixed(0))

    this.positions = this.positions.map(p => {
      if (p.id !== posId) return p
      return {
        ...p,
        duration: newDurationSec,
        openTime: Date.now(),
        expiresAt: Date.now() + newDurationSec * 1000,
        extended: (p.extended || 0) + 1,
      }
    })

    this._toast(`Extended ${pos.asset} by +${extraSeconds}s — fee $${fee.toFixed(2)}`, 'success')
    this._sound('click')
    this._persist()
    this._notify()
    return true
  }

  // ── Tick Checks (called from App.jsx on every price update) ──

  /**
   * Check all open positions with TP/SL against current prices.
   * Call this on every price tick. Returns true if any position closed.
   * @param {Map<string, number>} assetPrices — asset name → current price
   */
  checkTP_SL(assetPrices) {
    const openWithTPSL = this.positions.filter(
      p => p.status === 'open' && (p.tp || p.sl)
    )
    if (openWithTPSL.length === 0) return false

    let changed = false
    this.positions = this.positions.map(p => {
      if (p.status !== 'open' || (!p.tp && !p.sl)) return p

      const price = assetPrices.get(p.asset)
      if (price == null) return p

      const tp = p.tp
      const sl = p.sl

      if (p.direction === 'call') {
        if (tp && price >= tp) {
          changed = true
          const payout = p.amount * (1 + (p.payoutPercent || this.defaultPayout) / 100)
          this.balance += payout
          this._toast(`TP hit: ${p.asset} at ${price.toFixed(5)}`, 'success')
          this._sound('win')
          return { ...p, status: 'win', pnl: payout - p.amount, exitPrice: price, closedAt: Date.now(), closeReason: 'tp' }
        }
        if (sl && price <= sl) {
          changed = true
          this._toast(`SL hit: ${p.asset} at ${price.toFixed(5)}`, 'error')
          this._sound('loss')
          return { ...p, status: 'loss', pnl: -p.amount, exitPrice: price, closedAt: Date.now(), closeReason: 'sl' }
        }
      } else {
        // PUT direction
        if (tp && price <= tp) {
          changed = true
          const payout = p.amount * (1 + (p.payoutPercent || this.defaultPayout) / 100)
          this.balance += payout
          this._toast(`TP hit: ${p.asset} at ${price.toFixed(5)}`, 'success')
          this._sound('win')
          return { ...p, status: 'win', pnl: payout - p.amount, exitPrice: price, closedAt: Date.now(), closeReason: 'tp' }
        }
        if (sl && price >= sl) {
          changed = true
          this._toast(`SL hit: ${p.asset} at ${price.toFixed(5)}`, 'error')
          this._sound('loss')
          return { ...p, status: 'loss', pnl: -p.amount, exitPrice: price, closedAt: Date.now(), closeReason: 'sl' }
        }
      }
      return p
    })

    if (changed) {
      this._persist()
      this._notify()
    }
    return changed
  }

  /**
   * Check all open positions for natural expiry.
   * Uses openTime + duration (expiresAt) rather than setTimeout — accurate even
   * when the browser tab was backgrounded.
   * Call this on every price tick, AFTER checkTP_SL (TP/SL takes priority).
   * @param {Map<string, number>} assetPrices — asset name → current price
   * @returns {string[]} IDs of expired positions
   */
  checkExpiry(assetPrices) {
    const now = Date.now()
    const expired = this.positions.filter(
      p => p.status === 'open' && p.expiresAt && now >= p.expiresAt
    )
    if (expired.length === 0) return []

    const ids = []
    for (const pos of expired) {
      ids.push(pos.id)
      const exitPrice = assetPrices.get(pos.asset) ?? pos.entryPrice
      this._resolvePosition(pos.id, pos.amount, pos.payoutPercent || this.defaultPayout, pos.asset, exitPrice)
    }

    if (ids.length > 0) {
      this._persist()
      this._notify()
    }
    return ids
  }

  // ── Price Alerts ────────────────────────────────────────

  /**
   * Check active alerts against current prices.
   * @returns {number[]} IDs of triggered alerts
   */
  checkAlerts(alerts, assetPrices) {
    const active = alerts.filter(a => !a.triggered)
    if (active.length === 0) return []

    const triggered = []
    for (const alert of active) {
      const price = assetPrices.get(alert.asset)
      if (price == null) continue
      const crossed =
        alert.direction === 'above'
          ? price >= alert.price
          : price <= alert.price
      if (crossed) {
        triggered.push(alert.id)
        this._toast(
          `Alert: ${alert.asset} ${alert.direction === 'above' ? '>' : '<'} ${alert.price.toFixed(5)}`,
          'success'
        )
        this._sound('click')
      }
    }
    return triggered
  }

  // ── Pending / Entry Orders ───────────────────────────────

  /**
   * Place a pending entry order. Executes when price crosses entryPrice.
   */
  placePendingOrder({ asset, direction, amount, duration, entryPrice, tp, sl, payoutPercent }) {
    const amt = parseFloat(amount) || 0
    if (amt <= 0) { this._toast('Invalid order amount', 'error'); return false }
    if (amt > this.balance) { this._toast('Insufficient balance for order', 'error'); return false }
    // Reserve the amount from balance
    this.balance -= amt

    const id = `ord-${Date.now()}`
    const order = {
      id,
      asset,
      direction,
      amount: amt,
      duration,
      entryPrice: parseFloat(entryPrice),
      tp: parseFloat(tp) || 0,
      sl: parseFloat(sl) || 0,
      payoutPercent: payoutPercent || this.defaultPayout,
      createdAt: Date.now(),
    }
    this.pendingOrders = [order, ...this.pendingOrders]
    this._toast(`Order placed: ${direction.toUpperCase()} ${asset} @ ${order.entryPrice.toFixed(5)}`, 'success')
    this._sound('click')
    this._persist()
    this._notify()
    return true
  }

  /**
   * Cancel a pending order and refund the reserved amount.
   */
  cancelPendingOrder(orderId) {
    const order = this.pendingOrders.find(o => o.id === orderId)
    if (!order) return false
    this.balance += order.amount
    this.pendingOrders = this.pendingOrders.filter(o => o.id !== orderId)
    this._toast('Order cancelled', 'error')
    this._persist()
    this._notify()
    return true
  }

  /**
   * Check pending orders against current prices. Triggered orders auto-execute as trades.
   * Call on every price tick.
   * @returns {string[]} IDs of triggered orders
   */
  checkPendingOrders(assetPrices) {
    if (this.pendingOrders.length === 0) return []

    const triggered = []
    this.pendingOrders = this.pendingOrders.filter(order => {
      const price = assetPrices.get(order.asset)
      if (price == null) return true // keep if no price data yet

      let shouldTrigger = false
      if (order.direction === 'call') {
        // CALL order triggers when price rises to or above entryPrice
        shouldTrigger = price >= order.entryPrice
      } else {
        // PUT order triggers when price falls to or below entryPrice
        shouldTrigger = price <= order.entryPrice
      }

      if (shouldTrigger) {
        triggered.push(order.id)
        this._toast(`Order triggered: ${order.direction.toUpperCase()} ${order.asset} @ ${price.toFixed(5)}`, 'success')
        this._sound('win')
        // Execute the trade at current price
        this.placeTrade({
          asset: order.asset,
          direction: order.direction,
          amount: order.amount,
          duration: order.duration,
          tp: order.tp,
          sl: order.sl,
          payoutPercent: order.payoutPercent,
          entryPrice: price,
        })
        return false // remove order
      }
      return true // keep order
    })

    if (triggered.length > 0) {
      this._persist()
      this._notify()
    }
    return triggered
  }

  // ── Computed Properties ─────────────────────────────────

  get openCount() {
    return this.positions.filter(p => p.status === 'open').length
  }

  get dailyPnl() {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayTs = todayStart.getTime()
    return this.positions
      .filter(p => p.status !== 'open' && (p.closedAt || 0) >= todayTs)
      .reduce((sum, p) => sum + (p.pnl || 0), 0)
  }

  getSummary() {
    const closed = this.positions.filter(p => p.status !== 'open')
    const wins = closed.filter(p => p.status === 'win').length
    return {
      balance: this.balance,
      openCount: this.openCount,
      dailyPnl: this.dailyPnl,
      totalTrades: closed.length,
      winRate: closed.length > 0 ? wins / closed.length : 0,
    }
  }

  // ── Account Management ──────────────────────────────────

  resetAccount(startingBalance = DEFAULT_BALANCE) {
    this.balance = startingBalance
    this.positions = []
    this.pendingOrders = []
    this.baseAmount = STARTING_BASE_AMOUNT
    this.lastTradeResult = null
    this.lastTradeProfit = 0
    this._persist()
    this._notify()
  }

  // No-op kept for backward compatibility with React hook cleanup
  destroy() {
    // Timers removed — all expiry is tick-driven via checkExpiry()
  }

  // ── Internal ────────────────────────────────────────────

  /**
   * Resolve a position's outcome. Called when the position expires naturally.
   * @param {string} id — position ID
   * @param {number} amount — trade amount
   * @param {number} payoutPercent — payout percentage
   * @param {string} asset — asset name
   * @param {number} exitPrice — current market price at expiry
   */
  _resolvePosition(id, amount, payoutPercent, asset, exitPrice) {
    const outcome = Math.random() > (1 - this.winRate) ? 'win' : 'loss'

    // Track for martingale / compounding
    this.lastTradeResult = outcome
    const multiplier = 1 + payoutPercent / 100
    const payout = outcome === 'win' ? amount * multiplier : 0
    this.lastTradeProfit = payout - amount  // positive for win, negative for loss
    if (outcome === 'win') {
      this.baseAmount = amount
    } else if (this.baseAmount == null) {
      this.baseAmount = amount
    }

    this.positions = this.positions.map(p =>
      p.id === id
        ? {
            ...p,
            status: outcome,
            pnl: payout - amount,
            exitPrice: exitPrice ?? p.entryPrice,
            closedAt: Date.now(),
            closeReason: 'expired',
          }
        : p
    )
    this.balance += payout

    this._toast(
      outcome === 'win'
        ? `Won: ${asset} +$${payout.toFixed(2)}`
        : `Lost: ${asset}`,
      outcome === 'win' ? 'success' : 'error'
    )
    this._sound(outcome === 'win' ? 'win' : 'loss')
  }

  // ── Persistence ─────────────────────────────────────────
  //
  // Every closed position is written to localStorage with the full record:
  //   id, asset, direction, amount, duration,
  //   entryPrice, exitPrice, openTime, closedAt,
  //   status, pnl, payoutPercent, closeReason, note

  _persist() {
    try {
      const closed = this.positions.filter(p => p.status !== 'open')
      const existing = this._loadHistory()
      const ids = new Set()
      const merged = [
        ...closed.map(p => ({
          id: p.id,
          asset: p.asset,
          direction: p.direction,
          amount: p.amount,
          duration: p.duration,
          entryPrice: p.entryPrice,
          exitPrice: p.exitPrice,
          openTime: p.openTime,
          closedAt: p.closedAt || Date.now(),
          status: p.status,
          pnl: p.pnl,
          payoutPercent: p.payoutPercent || this.defaultPayout,
          closeReason: p.closeReason || 'expired',
          note: p.note || '',
        })),
        ...existing,
      ].filter(t => {
        if (ids.has(t.id)) return false
        ids.add(t.id)
        return true
      })
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged.slice(-100)))
    } catch {
      // quota exceeded or private browsing — silently ignore
    }
  }

  _loadHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  }
}

// ── React Hook Wrapper ─────────────────────────────────────

/**
 * useDemoEngine — React hook that wraps DemoEngine for use in components.
 *
 * @param {object} options
 * @param {function} options.onToast — toast callback (msg, type)
 * @param {function} options.onSound — sound callback (type)
 * @returns {object} engine state + action methods
 */
export function useDemoEngine({ onToast, onSound } = {}) {
  const engineRef = useRef(null)
  if (!engineRef.current) {
    engineRef.current = new DemoEngine()
  }
  const engine = engineRef.current

  // ── React state mirrors ──
  const [balance, setBalance] = useState(DEFAULT_BALANCE)
  const [positions, setPositions] = useState([])
  const [lastTradeResult, setLastTradeResult] = useState(null)
  const [lastTradeProfit, setLastTradeProfit] = useState(0)
  const [baseAmount, setBaseAmount] = useState(STARTING_BASE_AMOUNT)
  const [pendingOrders, setPendingOrders] = useState([])

  // Wire engine → React state. Stable callback; reads live engine ref.
  const syncState = useCallback(() => {
    setBalance(engine.balance)
    setPositions([...engine.positions])
    setPendingOrders([...engine.pendingOrders])
    setLastTradeResult(engine.lastTradeResult)
    setLastTradeProfit(engine.lastTradeProfit)
    setBaseAmount(engine.baseAmount)
  }, [])

  engine.onStateChange = syncState

  // Keep callbacks fresh on every render — engine always calls latest version
  engine.onToast = onToast
  engine.onSound = onSound

  // Cleanup on unmount
  useEffect(() => {
    return () => engine.destroy()
  }, [])

  // ── Action methods (stable references via engine ref) ──

  const placeTrade = useCallback(
    (direction, amount, duration, tp, sl, asset, payoutPercent, entryPrice) =>
      engine.placeTrade({ asset, direction, amount, duration, tp, sl, payoutPercent, entryPrice }),
    []
  )

  const closePosition = useCallback(
    (posId, currentPrice) => engine.closePosition(posId, currentPrice),
    []
  )

  const doubleUp = useCallback(
    (pos, currentPrice) => engine.doubleUp(pos, currentPrice),
    []
  )

  const extendPosition = useCallback(
    (posId, extraSeconds, currentPrice) => engine.extendPosition(posId, extraSeconds, currentPrice),
    []
  )

  const setPositionNote = useCallback(
    (posId, note) => engine.setPositionNote(posId, note),
    []
  )

  const checkTP_SL = useCallback(
    (assetPrices) => engine.checkTP_SL(assetPrices),
    []
  )

  const checkExpiry = useCallback(
    (assetPrices) => engine.checkExpiry(assetPrices),
    []
  )

  const checkAlerts = useCallback(
    (alerts, assetPrices) => engine.checkAlerts(alerts, assetPrices),
    []
  )

  const placePendingOrder = useCallback(
    (order) => engine.placePendingOrder(order),
    []
  )

  const cancelPendingOrder = useCallback(
    (orderId) => engine.cancelPendingOrder(orderId),
    []
  )

  const checkPendingOrders = useCallback(
    (assetPrices) => engine.checkPendingOrders(assetPrices),
    []
  )

  const resetAccount = useCallback(
    (startingBalance) => engine.resetAccount(startingBalance),
    []
  )

  const getSummary = useCallback(() => engine.getSummary(), [])

  const setDailyLossLimit = useCallback((v) => { engine.dailyLossLimit = v; syncState() }, [syncState])
  const setMaxPositionPct = useCallback((v) => { engine.maxPositionPct = v; syncState() }, [syncState])
  const setMaxDailyTrades = useCallback((v) => { engine.maxDailyTrades = v; syncState() }, [syncState])
  const setMinPayoutPct = useCallback((v) => { engine.minPayoutPct = v; syncState() }, [syncState])
  const setNewsBlockEnabled = useCallback((v) => { engine.newsBlockEnabled = v; syncState() }, [syncState])
  const setNewsBlockLevels = useCallback((v) => { engine.newsBlockLevels = v; syncState() }, [syncState])

  return {
    // State
    balance,
    positions,
    pendingOrders,
    lastTradeResult,
    lastTradeProfit,
    baseAmount,
    // Computed
    openCount: engine.openCount,
    dailyPnl: engine.dailyPnl,
    dailyTradeCount: engine.dailyTradeCount,
    dailyLossLimit: engine.dailyLossLimit,
    maxPositionPct: engine.maxPositionPct,
    maxDailyTrades: engine.maxDailyTrades,
    setDailyLossLimit,
    setMaxPositionPct,
    setMaxDailyTrades,
    setMinPayoutPct,
    setNewsBlockEnabled,
    setNewsBlockLevels,
    minPayoutPct: engine.minPayoutPct,
    newsBlockEnabled: engine.newsBlockEnabled,
    newsBlockLevels: engine.newsBlockLevels,
    // Actions
    placeTrade,
    closePosition,
    doubleUp,
    extendPosition,
    setPositionNote,
    checkTP_SL,
    checkExpiry,
    checkAlerts,
    placePendingOrder,
    cancelPendingOrder,
    checkPendingOrders,
    resetAccount,
    getSummary,
  }
}
