import { computeRSI, computeSMA, computeMACD } from '../data/mockData'

/**
 * Run a strategy backtest against historical candle data.
 *
 * @param {object} params
 * @param {Array} params.candles — candle history [{open, high, low, close, time, v}]
 * @param {string} params.entryType — 'rsi' | 'sma_cross' | 'macd_cross'
 * @param {object} params.entryParams — depends on entryType
 * @param {string} params.direction — 'call' | 'put'
 * @param {number} params.duration — trade duration in candles (not seconds)
 * @param {number} params.amount — amount per trade
 * @param {number} params.payout — payout percent
 * @returns {{ trades: Array, summary: object }}
 */
export function runBacktest({ candles, entryType, entryParams, direction, duration, amount, payout = 82 }) {
  if (!candles || candles.length < 50) return { trades: [], summary: null }

  // Compute indicators
  const indicators = {}
  if (entryType === 'rsi') {
    indicators.rsi = computeRSI(candles, entryParams.period || 14)
  } else if (entryType === 'sma_cross') {
    indicators.smaFast = computeSMA(candles, entryParams.fast || 9)
    indicators.smaSlow = computeSMA(candles, entryParams.slow || 21)
  } else if (entryType === 'macd_cross') {
    indicators.macd = computeMACD(candles, entryParams.fast || 12, entryParams.slow || 26, entryParams.signal || 9)
  }

  const trades = []
  let inTrade = false
  let tradeOpenIdx = 0
  const multiplier = 1 + payout / 100

  for (let i = Math.max(50, duration); i < candles.length; i++) {
    if (inTrade) {
      // Check if trade expired
      if (i >= tradeOpenIdx + duration) {
        const exitCandle = candles[i]
        const entryCandle = candles[tradeOpenIdx]
        const isWin = direction === 'call'
          ? exitCandle.close > entryCandle.close
          : exitCandle.close < entryCandle.close
        const pnl = isWin ? amount * (multiplier - 1) : -amount
        trades.push({
          entryIdx: tradeOpenIdx,
          exitIdx: i,
          entryPrice: entryCandle.close,
          exitPrice: exitCandle.close,
          direction,
          amount,
          pnl,
          status: isWin ? 'win' : 'loss',
        })
        inTrade = false
      }
      continue
    }

    // Check entry condition
    let signal = false
    if (entryType === 'rsi') {
      const rsiVal = indicators.rsi[i]
      if (rsiVal == null) continue
      if (direction === 'call') signal = rsiVal <= (entryParams.oversold || 30)
      else signal = rsiVal >= (entryParams.overbought || 70)
    } else if (entryType === 'sma_cross') {
      const fast = indicators.smaFast[i], slow = indicators.smaSlow[i]
      const fastPrev = indicators.smaFast[i - 1], slowPrev = indicators.smaSlow[i - 1]
      if (fast == null || slow == null || fastPrev == null || slowPrev == null) continue
      const crossedUp = fastPrev <= slowPrev && fast > slow
      const crossedDown = fastPrev >= slowPrev && fast < slow
      if (direction === 'call') signal = crossedUp
      else signal = crossedDown
    } else if (entryType === 'macd_cross') {
      const ml = indicators.macd.macdLine[i], sl = indicators.macd.signalLine[i]
      const mlPrev = indicators.macd.macdLine[i - 1], slPrev = indicators.macd.signalLine[i - 1]
      if (ml == null || sl == null || mlPrev == null || slPrev == null) continue
      const crossedUp = mlPrev <= slPrev && ml > sl
      const crossedDown = mlPrev >= slPrev && ml < sl
      if (direction === 'call') signal = crossedUp
      else signal = crossedDown
    }

    if (signal) {
      inTrade = true
      tradeOpenIdx = i
    }
  }

  // Summary
  if (trades.length === 0) return { trades: [], summary: null }

  const wins = trades.filter(t => t.status === 'win').length
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0)
  let peak = 0, maxDd = 0, running = 0
  const equity = []
  trades.forEach(t => {
    running += t.pnl
    equity.push(parseFloat(running.toFixed(2)))
    if (running > peak) peak = running
    const dd = peak - running
    if (dd > maxDd) maxDd = dd
  })

  return {
    trades,
    summary: {
      totalTrades: trades.length,
      wins,
      losses: trades.length - wins,
      winRate: parseFloat(((wins / trades.length) * 100).toFixed(1)),
      totalPnl: parseFloat(totalPnl.toFixed(2)),
      avgPnl: parseFloat((totalPnl / trades.length).toFixed(2)),
      maxDrawdown: parseFloat(maxDd.toFixed(2)),
      profitFactor: trades.filter(t => t.pnl > 0).reduce((s, t) => s + t.pnl, 1)
        / Math.abs(trades.filter(t => t.pnl < 0).reduce((s, t) => s + t.pnl, -1) || 1),
      equity,
    },
  }
}