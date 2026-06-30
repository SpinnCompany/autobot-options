// ── PriceFeedEngine — simulated market condition modes ──────────
//
// Modes:
//   'random'   — current behavior, slight upward bias
//   'trending' — ~65% of ticks move in trendDir direction
//   'volatile' — 3x normal volatility, occasional spikes
//   'sideways' — mean-reverting around per-asset anchor
//
// Usage:
//   const engine = new PriceFeedEngine()
//   engine.configure({ mode: 'trending', trendDir: 'up' })
//   const next = engine.nextTick(currentPrice, 'EUR/USD')

const MODES = ['random', 'trending', 'volatile', 'sideways']

export class PriceFeedEngine {
  mode = 'random'
  trendDir = 'up'
  _anchors = new Map()

  configure({ mode, trendDir } = {}) {
    if (mode && MODES.includes(mode)) {
      if (mode !== this.mode) {
        // Reset anchors on mode switch — fresh anchors established on first tick
        this._anchors.clear()
      }
      this.mode = mode
    }
    if (trendDir === 'up' || trendDir === 'down') {
      this.trendDir = trendDir
    }
  }

  /**
   * Generate the next price for one asset/tab.
   *
   * @param {number} price  — current price
   * @param {number} vol    — base volatility factor (e.g. 0.001 for charts, 0.0008 for assets)
   * @param {string} [key]  — unique key for per-asset sideways anchors (e.g. asset name)
   * @returns {number} next price
   */
  nextTick(price, vol = 0.001, key = null) {
    switch (this.mode) {
      case 'trending':
        return this._tickTrending(price, vol)
      case 'volatile':
        return this._tickVolatile(price, vol)
      case 'sideways':
        return this._tickSideways(price, vol, key)
      case 'random':
      default:
        return this._tickRandom(price, vol)
    }
  }

  // ── Mode algorithms ─────────────────────────────────────────

  _tickRandom(price, vol) {
    return parseFloat((price + price * (Math.random() - 0.48) * vol).toFixed(5))
  }

  _tickTrending(price, vol) {
    const dir = this.trendDir === 'up' ? 1 : -1
    // Bias of 0.15 means ~65% of ticks go in the trend direction
    const bias = 0.5 - dir * 0.15
    return parseFloat((price + price * (Math.random() - bias) * vol).toFixed(5))
  }

  _tickVolatile(price, vol) {
    // 3x normal volatility
    let wiggle = (Math.random() - 0.48) * vol * 3
    // 10% chance of an extra spike (2x the already-amplified move)
    if (Math.random() < 0.10) {
      wiggle *= 2
    }
    return parseFloat((price + price * wiggle).toFixed(5))
  }

  _tickSideways(price, vol, key) {
    const anchorKey = key || '__global__'

    // Establish anchor on first tick in this mode (or after mode switch)
    if (!this._anchors.has(anchorKey)) {
      this._anchors.set(anchorKey, price)
    }
    const anchor = this._anchors.get(anchorKey)

    // Mean reversion: pull back 3% of deviation from anchor per tick
    const deviation = anchor - price
    const pullForce = deviation * 0.03

    // Halved noise for tighter oscillation
    const noise = price * (Math.random() - 0.5) * vol * 0.5

    return parseFloat((price + pullForce + noise).toFixed(5))
  }
}
