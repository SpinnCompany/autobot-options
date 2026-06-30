export function generateInitialAssets() {
  return [
    { name: 'EUR/USD', price: 1.0852, change: '+0.12', category: 'Forex', color: '#2979ff', icon: '€', icon2: '$', payout: 88, spread: 0.00012, dayHigh: 1.0875, dayLow: 1.0820 },
    { name: 'GBP/USD', price: 1.2645, change: '-0.08', category: 'Forex', color: '#00c853', icon: '£', icon2: '$', payout: 85, spread: 0.00018, dayHigh: 1.2680, dayLow: 1.2610 },
    { name: 'USD/JPY', price: 154.32, change: '+0.23', category: 'Forex', color: '#ff1744', icon: '$', icon2: '¥', payout: 85, spread: 0.015, dayHigh: 154.80, dayLow: 153.65 },
    { name: 'AUD/USD', price: 0.6590, change: '+0.05', category: 'Forex', color: '#ffc107', icon: 'A', icon2: '$', payout: 83, spread: 0.00025, dayHigh: 0.6615, dayLow: 0.6560 },
    { name: 'USD/CAD', price: 1.3621, change: '-0.15', category: 'Forex', color: '#e040fb', icon: '$', icon2: 'C', payout: 82, spread: 0.00020, dayHigh: 1.3655, dayLow: 1.3580 },
    { name: 'NZD/USD', price: 0.6015, change: '+0.09', category: 'Forex', color: '#00e5ff', icon: 'N', icon2: '$', payout: 80, spread: 0.00030, dayHigh: 0.6040, dayLow: 0.5990 },
    { name: 'EUR/GBP', price: 0.8580, change: '-0.03', category: 'Forex', color: '#ff6d00', icon: '€', icon2: '£', payout: 86, spread: 0.00015, dayHigh: 0.8610, dayLow: 0.8550 },
    { name: 'EUR/JPY', price: 167.45, change: '+0.31', category: 'Forex', color: '#00bcd4', icon: '€', icon2: '¥', payout: 84, spread: 0.022, dayHigh: 168.20, dayLow: 166.50 },
    { name: 'USD/CHF', price: 0.8952, change: '-0.07', category: 'Forex', color: '#ff5722', icon: '$', icon2: 'F', payout: 83, spread: 0.00018, dayHigh: 0.8980, dayLow: 0.8920 },
    { name: 'Bitcoin', price: 67432.50, change: '+1.25', category: 'Crypto', color: '#f7931a', icon: '₿', payout: 93, spread: 12.50, dayHigh: 68100, dayLow: 66800 },
    { name: 'Ethereum', price: 3450.80, change: '+2.10', category: 'Crypto', color: '#627eea', icon: 'Ξ', payout: 92, spread: 1.80, dayHigh: 3520, dayLow: 3400 },
    { name: 'Litecoin', price: 84.25, change: '-0.45', category: 'Crypto', color: '#bfbbbb', icon: 'Ł', payout: 90, spread: 0.08, dayHigh: 85.50, dayLow: 83.00 },
    { name: 'Gold', price: 2334.50, change: '+0.32', category: 'Commodities', color: '#ffd700', icon: 'Au', payout: 87, spread: 0.45, dayHigh: 2350, dayLow: 2310 },
    { name: 'Silver', price: 27.85, change: '-0.18', category: 'Commodities', color: '#c0c0c0', icon: 'Ag', payout: 85, spread: 0.03, dayHigh: 28.20, dayLow: 27.40 },
    { name: 'Crude Oil', price: 78.45, change: '+1.15', category: 'Commodities', color: '#ff9800', icon: 'Cr', payout: 84, spread: 0.05, dayHigh: 79.80, dayLow: 77.20 },
    { name: 'S&P 500', price: 5280.50, change: '+0.42', category: 'Indices', color: '#4caf50', icon: 'S5', payout: 82, spread: 0.75, dayHigh: 5310, dayLow: 5250 },
    { name: 'NASDAQ', price: 18650.30, change: '+0.68', category: 'Indices', color: '#2196f3', icon: 'NQ', payout: 83, spread: 2.50, dayHigh: 18780, dayLow: 18500 },
    { name: 'DAX 40', price: 18240.00, change: '-0.22', category: 'Indices', color: '#f44336', icon: 'D4', payout: 81, spread: 1.50, dayHigh: 18350, dayLow: 18100 },
    { name: 'FTSE 100', price: 8230.20, change: '+0.11', category: 'Indices', color: '#9c27b0', icon: 'FT', payout: 80, spread: 1.20, dayHigh: 8270, dayLow: 8200 },
    { name: 'Compound', price: 7420.26, change: '+0.55', category: 'Indices', color: '#f57b00', icon: 'CI', payout: 86, spread: 3.50, dayHigh: 7480, dayLow: 7350 },
  ]
}

// ── Price generation helpers ──────────────────────────────

function noise(price, volatility = 0.002, bias = 0.48) {
  return price * (Math.random() - bias) * volatility
}

function nextPrice(prev) {
  return parseFloat((prev + noise(prev)).toFixed(5))
}

// ── Tick history (area chart, 1‑second ticks) ─────────────

export function generatePriceHistory(count, startPrice) {
  const data = []
  let price = startPrice + (Math.random() - 0.5) * startPrice * 0.1
  for (let i = 0; i < count; i++) {
    price = nextPrice(price)
    data.push({ time: i, price: parseFloat(price.toFixed(5)) })
  }
  return data
}

// ── Candlestick (OHLC) history ────────────────────────────

export function generateCandleHistory(count, startPrice, tfMs = 60000) {
  const data = []
  const alignedNow = Math.floor(Date.now() / tfMs) * tfMs
  let prevClose = startPrice + (Math.random() - 0.5) * startPrice * 0.1
  for (let i = 0; i < count; i++) {
    const open = prevClose
    const mid = open + noise(open, 0.004)
    const high = Math.max(open, mid) + Math.abs(noise(open, 0.001))
    const low = Math.min(open, mid) - Math.abs(noise(open, 0.001))
    const close = parseFloat((low + Math.random() * (high - low)).toFixed(5))
    // Synthetic volume — mostly base range with occasional spikes
    const v = Math.floor(100 + Math.random() * 900 + (Math.random() > 0.85 ? Math.random() * 3000 : 0))
    data.push({ time: alignedNow - (count - 1 - i) * tfMs, open, high, low, close, v })
    prevClose = close
  }
  return data
}

// ── VWAP (Volume-Weighted Average Price) ────────────────────

/**
 * Compute VWAP from candle data with volume.
 * Resets at the start of each visible session (candle array).
 * @param {Array} candles — each with { h, l, c, v }
 * @returns {Array} VWAP values parallel to candles (null where not enough data)
 */
export function computeVWAP(candles) {
  if (!candles || candles.length === 0) return []
  const vwap = []
  let cumPV = 0  // cumulative price × volume
  let cumV = 0   // cumulative volume
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]
    const v = c.v || 0
    if (v > 0) {
      const typical = (c.h + c.l + c.c) / 3
      cumPV += typical * v
      cumV += v
    }
    vwap.push(cumV > 0 ? parseFloat((cumPV / cumV).toFixed(5)) : null)
  }
  return vwap
}

// ── Order Book (Level 2 depth) ──────────────────────────────

/**
 * Generate synthetic order book levels for demo display.
 * @param {number} midPrice — current price
 * @param {number} levels — number of levels each side (default 12)
 * @returns {{ bids: Array, asks: Array }}
 */
export function generateOrderBook(midPrice, levels = 12) {
  const step = midPrice * 0.0001 // ~0.01% per level
  const bids = []
  const asks = []
  let cumBid = 0, cumAsk = 0
  for (let i = 0; i < levels; i++) {
    const bidPrice = parseFloat((midPrice - step * (i + 1) - Math.random() * step * 0.5).toFixed(5))
    const askPrice = parseFloat((midPrice + step * (i + 1) + Math.random() * step * 0.5).toFixed(5))
    const bidVol = Math.floor(100 + Math.random() * 900 + (Math.random() > 0.8 ? Math.random() * 3000 : 0))
    const askVol = Math.floor(100 + Math.random() * 900 + (Math.random() > 0.8 ? Math.random() * 3000 : 0))
    cumBid += bidVol; cumAsk += askVol
    bids.push({ price: bidPrice, volume: bidVol, cumulative: cumBid })
    asks.push({ price: askPrice, volume: askVol, cumulative: cumAsk })
  }
  const maxCum = Math.max(cumBid, cumAsk, 1)
  bids.forEach(b => { b.pct = b.cumulative / maxCum })
  asks.forEach(a => { a.pct = a.cumulative / maxCum })
  return { bids, asks }
}

// ── Volume Profile ───────────────────────────────────────────

/**
 * Compute volume-at-price histogram from candle data.
 * @param {Array} candles — each with { h, l, c, v }
 * @param {number} bins — number of price slices (default 30)
 * @returns {Array} [{ price, volume, pct }] sorted by price descending
 */
export function computeVolumeProfile(candles, bins = 30) {
  if (!candles || candles.length < 2) return []

  const prices = candles.flatMap(c => [c.h, c.l])
  const pMin = Math.min(...prices)
  const pMax = Math.max(...prices)
  const step = (pMax - pMin) / bins
  if (step <= 0) return []

  // Initialize bins
  const profile = []
  for (let i = 0; i < bins; i++) {
    profile.push({ price: parseFloat((pMax - i * step - step / 2).toFixed(5)), volume: 0 })
  }

  // Distribute volume across bins each candle spans
  for (const c of candles) {
    const v = c.v || 100
    const range = c.h - c.l
    if (range <= 0) {
      // Flat candle — assign all volume to bin containing close
      const idx = Math.min(bins - 1, Math.max(0, Math.floor((pMax - c.c) / step)))
      profile[idx].volume += v
      continue
    }
    // Distribute volume: 60% weighted to close, 40% spread across range
    const closeWeight = v * 0.6
    const spreadWeight = v * 0.4
    const closeIdx = Math.min(bins - 1, Math.max(0, Math.floor((pMax - c.c) / step)))
    profile[closeIdx].volume += closeWeight
    // Spread remaining across the candle's range
    const lowIdx = Math.min(bins - 1, Math.max(0, Math.floor((pMax - c.h) / step)))
    const highIdx = Math.min(bins - 1, Math.max(0, Math.floor((pMax - c.l) / step)))
    const spanned = Math.abs(highIdx - lowIdx) + 1
    if (spanned > 0) {
      const perBin = spreadWeight / spanned
      for (let i = Math.min(lowIdx, highIdx); i <= Math.max(lowIdx, highIdx); i++) {
        profile[i].volume += perBin
      }
    }
  }

  // Normalize to percentages of max
  const maxVol = Math.max(...profile.map(p => p.volume), 1)
  profile.forEach(p => { p.pct = p.volume / maxVol })

  return profile
}

// ── Utility helpers ───────────────────────────────────────

export function getAssetColor(assetName, assets) {
  const asset = assets?.find(a => a.name === assetName)
  return asset?.color || '#f57b00'
}

// ── Volume generation ─────────────────────────────────────

export function generateVolumeHistory(count) {
  const volumes = []
  for (let i = 0; i < count; i++) {
    volumes.push(Math.floor(100 + Math.random() * 900 + Math.random() * 2000 * (Math.random() > 0.9 ? 1 : 0)))
  }
  return volumes
}

// ── Indicator Calculations ────────────────────────────────

export function computeSMA(data, period) {
  const sma = []
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { sma.push(null); continue }
    let sum = 0
    for (let j = i - period + 1; j <= i; j++) sum += data[j].close
    sma.push(parseFloat((sum / period).toFixed(5)))
  }
  return sma
}

export function computeEMA(data, period) {
  const ema = []
  const k = 2 / (period + 1)
  let prev = null
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { ema.push(null); continue }
    if (prev === null) {
      let sum = 0
      for (let j = i - period + 1; j <= i; j++) sum += data[j].close
      prev = sum / period
    } else {
      prev = data[i].close * k + prev * (1 - k)
    }
    ema.push(parseFloat(prev.toFixed(5)))
  }
  return ema
}

export function computeBollingerBands(data, period = 20, multiplier = 2) {
  const middle = computeSMA(data, period)
  const upper = []
  const lower = []
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { upper.push(null); lower.push(null); continue }
    let sumSq = 0
    for (let j = i - period + 1; j <= i; j++) sumSq += Math.pow(data[j].close - middle[i], 2)
    const std = Math.sqrt(sumSq / period)
    upper.push(parseFloat((middle[i] + multiplier * std).toFixed(5)))
    lower.push(parseFloat((middle[i] - multiplier * std).toFixed(5)))
  }
  return { middle, upper, lower }
}

export function computeRSI(data, period = 14) {
  const rsi = []
  let avgGain = 0, avgLoss = 0
  for (let i = 0; i < data.length; i++) {
    if (i === 0) { rsi.push(null); continue }
    const change = data[i].close - data[i - 1].close
    const gain = change > 0 ? change : 0
    const loss = change < 0 ? -change : 0
    if (i < period) {
      avgGain += gain
      avgLoss += loss
      if (i === period - 1) {
        avgGain /= period
        avgLoss /= period
        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
        rsi.push(parseFloat((100 - 100 / (1 + rs)).toFixed(2)))
      } else {
        rsi.push(null)
      }
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period
      avgLoss = (avgLoss * (period - 1) + loss) / period
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
      rsi.push(parseFloat((100 - 100 / (1 + rs)).toFixed(2)))
    }
  }
  return rsi
}

export function computeMACD(data, fast = 12, slow = 26, signal = 9) {
  const fastEMA = computeEMAPeriod(data, fast)
  const slowEMA = computeEMAPeriod(data, slow)
  const macdLine = []
  for (let i = 0; i < data.length; i++) {
    if (fastEMA[i] == null || slowEMA[i] == null) { macdLine.push(null); continue }
    macdLine.push(parseFloat((fastEMA[i] - slowEMA[i]).toFixed(5)))
  }
  const signalLine = computeEMASingle(macdLine, signal)
  const histogram = []
  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] == null || signalLine[i] == null) { histogram.push(null); continue }
    histogram.push(parseFloat((macdLine[i] - signalLine[i]).toFixed(5)))
  }
  return { macdLine, signalLine, histogram }
}

function computeEMAPeriod(data, period) {
  const ema = []
  const k = 2 / (period + 1)
  let prev = null
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { ema.push(null); continue }
    if (prev === null) {
      let sum = 0
      for (let j = i - period + 1; j <= i; j++) sum += data[j].close
      prev = sum / period
    } else {
      prev = data[i].close * k + prev * (1 - k)
    }
    ema.push(prev)
  }
  return ema
}

function computeEMASingle(arr, period) {
  const ema = []
  const k = 2 / (period + 1)
  let prev = null
  let firstNonNull = -1
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] == null) { ema.push(null); continue }
    if (prev === null) {
      if (firstNonNull === -1) firstNonNull = i
      let sum = 0, count = 0
      for (let j = firstNonNull; j <= i; j++) {
        if (arr[j] != null) { sum += arr[j]; count++ }
      }
      prev = sum / count
    } else {
      prev = arr[i] * k + prev * (1 - k)
    }
    if (i >= firstNonNull + period - 1) ema.push(prev)
    else ema.push(null)
  }
  return ema
}

// ── Constants ─────────────────────────────────────────────

export const CATEGORIES = ['All', 'Forex', 'Crypto', 'Commodities', 'Indices']

export const TIMEFRAMES = [
  { label: '15s', value: '15s' },
  { label: '30s', value: '30s' },
  { label: '1m', value: '1m' },
  { label: '5m', value: '5m' },
  { label: '15m', value: '15m' },
]

export const TF_MAP = { '15s': 15000, '30s': 30000, '1m': 60000, '5m': 300000, '15m': 900000 }

export const DURATIONS = [
  { label: '30s', value: 30 },
  { label: '1m', value: 60 },
  { label: '3m', value: 180 },
  { label: '5m', value: 300 },
  { label: '15m', value: 900 },
]

export const AMOUNT_PRESETS = [10, 25, 50, 100, 250, 500]

// ── Local storage helpers ─────────────────────────────────

const STORAGE_KEY = 'autobot_options_history'

export function loadTradeHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveTradeHistory(history) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-100)))
  } catch {
    // quota exceeded or private browsing — ignore
  }
}

export function updateHistoryNote(tradeId, note) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const history = raw ? JSON.parse(raw) : []
    const updated = history.map(t => t.id === tradeId ? { ...t, note: note || '' } : t)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated.slice(-100)))
  } catch {
    // ignore
  }
}