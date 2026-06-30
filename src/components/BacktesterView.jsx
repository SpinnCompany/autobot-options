import { useState, useMemo, useCallback } from 'react'
import { Play, RotateCcw } from 'lucide-react'
import { generateCandleHistory } from '../data/mockData'
import { runBacktest } from '../engine/BacktestEngine'

const STRATEGIES = [
  { value: 'rsi', label: 'RSI Overbought/Oversold' },
  { value: 'sma_cross', label: 'SMA Crossover' },
  { value: 'macd_cross', label: 'MACD Signal Cross' },
]

export default function BacktesterView({ assets }) {
  const [asset, setAsset] = useState('EUR/USD')
  const [strategy, setStrategy] = useState('rsi')
  const [direction, setDirection] = useState('call')
  const [duration, setDuration] = useState(5) // candles
  const [amount, setAmount] = useState(100)
  const [payout, setPayout] = useState(82)

  // Strategy params
  const [rsiPeriod, setRsiPeriod] = useState(14)
  const [rsiOversold, setRsiOversold] = useState(30)
  const [rsiOverbought, setRsiOverbought] = useState(70)
  const [smaFast, setSmaFast] = useState(9)
  const [smaSlow, setSmaSlow] = useState(21)
  const [macdFast, setMacdFast] = useState(12)
  const [macdSlow, setMacdSlow] = useState(26)
  const [macdSignal, setMacdSignal] = useState(9)

  const [result, setResult] = useState(null)

  const candleData = useMemo(() => {
    const assetData = assets.find(a => a.name === asset)
    return generateCandleHistory(500, assetData?.price || 1)
  }, [asset, assets])

  const handleRun = useCallback(() => {
    const entryParams = strategy === 'rsi'
      ? { period: rsiPeriod, oversold: rsiOversold, overbought: rsiOverbought }
      : strategy === 'sma_cross'
        ? { fast: smaFast, slow: smaSlow }
        : { fast: macdFast, slow: macdSlow, signal: macdSignal }

    const res = runBacktest({
      candles: candleData,
      entryType: strategy,
      entryParams,
      direction,
      duration,
      amount,
      payout,
    })
    setResult(res)
  }, [candleData, strategy, direction, duration, amount, payout, rsiPeriod, rsiOversold, rsiOverbought, smaFast, smaSlow, macdFast, macdSlow, macdSignal])

  const s = result?.summary

  return (
    <div style={{ gridColumn: '2 / 5', padding: 20, overflow: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 18, fontWeight: 700 }}>Strategy Backtester</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>500 candles</span>
      </div>

      {/* Config form */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: 10, marginBottom: 16, padding: 14,
        background: 'var(--bg-elevated)', borderRadius: 10,
        border: '1px solid var(--border-subtle)',
      }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>Asset</div>
          <select value={asset} onChange={e => setAsset(e.target.value)} style={{
            width: '100%', padding: '6px 8px', borderRadius: 5, fontSize: 12, fontWeight: 600,
            background: 'var(--bg-input)', border: '1px solid var(--border-default)',
            color: 'var(--text-primary)', outline: 'none', cursor: 'pointer',
          }}>
            {assets.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>Strategy</div>
          <select value={strategy} onChange={e => setStrategy(e.target.value)} style={{
            width: '100%', padding: '6px 8px', borderRadius: 5, fontSize: 12, fontWeight: 600,
            background: 'var(--bg-input)', border: '1px solid var(--border-default)',
            color: 'var(--text-primary)', outline: 'none', cursor: 'pointer',
          }}>
            {STRATEGIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>Direction</div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => setDirection('call')} style={{
              flex: 1, padding: '6px 0', borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: 'pointer',
              background: direction === 'call' ? 'var(--success)' : 'var(--bg-input)',
              border: direction === 'call' ? '1px solid var(--success)' : '1px solid var(--border-default)',
              color: direction === 'call' ? '#000' : 'var(--text-secondary)',
            }}>CALL</button>
            <button onClick={() => setDirection('put')} style={{
              flex: 1, padding: '6px 0', borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: 'pointer',
              background: direction === 'put' ? 'var(--danger)' : 'var(--bg-input)',
              border: direction === 'put' ? '1px solid var(--danger)' : '1px solid var(--border-default)',
              color: direction === 'put' ? '#fff' : 'var(--text-secondary)',
            }}>PUT</button>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>Duration (candles)</div>
          <input type="number" value={duration} min={1} max={50} onChange={e => setDuration(parseInt(e.target.value) || 5)}
            style={{ width: '100%', padding: '6px 8px', borderRadius: 5, fontSize: 12, fontWeight: 600,
              background: 'var(--bg-input)', border: '1px solid var(--border-default)',
              color: 'var(--text-primary)', outline: 'none', textAlign: 'center' }} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>Amount $</div>
          <input type="number" value={amount} min={1} onChange={e => setAmount(parseInt(e.target.value) || 100)}
            style={{ width: '100%', padding: '6px 8px', borderRadius: 5, fontSize: 12, fontWeight: 600,
              background: 'var(--bg-input)', border: '1px solid var(--border-default)',
              color: 'var(--text-primary)', outline: 'none', textAlign: 'center' }} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>Payout %</div>
          <input type="number" value={payout} min={50} max={100} onChange={e => setPayout(parseInt(e.target.value) || 82)}
            style={{ width: '100%', padding: '6px 8px', borderRadius: 5, fontSize: 12, fontWeight: 600,
              background: 'var(--bg-input)', border: '1px solid var(--border-default)',
              color: 'var(--text-primary)', outline: 'none', textAlign: 'center' }} />
        </div>
      </div>

      {/* Strategy params */}
      <div style={{
        display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16,
        padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 10,
        border: '1px solid var(--border-subtle)', fontSize: 11,
      }}>
        {strategy === 'rsi' && (
          <>
            <span style={{ color: 'var(--text-muted)' }}>RSI</span>
            <input type="number" value={rsiPeriod} min={2} max={100} onChange={e => setRsiPeriod(parseInt(e.target.value) || 14)}
              style={{ width: 45, padding: '2px 4px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                background: 'var(--bg-input)', border: '1px solid var(--border-default)',
                color: 'var(--text-primary)', outline: 'none', textAlign: 'center' }} />
            <span style={{ color: 'var(--text-muted)' }}>period</span>
            <span style={{ color: 'var(--success)' }}>Oversold</span>
            <input type="number" value={rsiOversold} min={1} max={50} onChange={e => setRsiOversold(parseInt(e.target.value) || 30)}
              style={{ width: 45, padding: '2px 4px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                background: 'var(--bg-input)', border: '1px solid var(--border-default)',
                color: 'var(--text-primary)', outline: 'none', textAlign: 'center' }} />
            <span style={{ color: 'var(--danger)' }}>Overbought</span>
            <input type="number" value={rsiOverbought} min={50} max={99} onChange={e => setRsiOverbought(parseInt(e.target.value) || 70)}
              style={{ width: 45, padding: '2px 4px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                background: 'var(--bg-input)', border: '1px solid var(--border-default)',
                color: 'var(--text-primary)', outline: 'none', textAlign: 'center' }} />
          </>
        )}
        {strategy === 'sma_cross' && (
          <>
            <span style={{ color: 'var(--text-muted)' }}>Fast SMA</span>
            <input type="number" value={smaFast} min={2} max={50} onChange={e => setSmaFast(parseInt(e.target.value) || 9)}
              style={{ width: 45, padding: '2px 4px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                background: 'var(--bg-input)', border: '1px solid var(--border-default)',
                color: 'var(--text-primary)', outline: 'none', textAlign: 'center' }} />
            <span style={{ color: 'var(--text-muted)' }}>Slow SMA</span>
            <input type="number" value={smaSlow} min={5} max={200} onChange={e => setSmaSlow(parseInt(e.target.value) || 21)}
              style={{ width: 45, padding: '2px 4px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                background: 'var(--bg-input)', border: '1px solid var(--border-default)',
                color: 'var(--text-primary)', outline: 'none', textAlign: 'center' }} />
          </>
        )}
        {strategy === 'macd_cross' && (
          <>
            <span style={{ color: 'var(--text-muted)' }}>Fast/Slow/Signal</span>
            <input type="number" value={macdFast} min={2} max={50} onChange={e => setMacdFast(parseInt(e.target.value) || 12)}
              style={{ width: 40, padding: '2px 4px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                background: 'var(--bg-input)', border: '1px solid var(--border-default)',
                color: 'var(--text-primary)', outline: 'none', textAlign: 'center' }} />
            <input type="number" value={macdSlow} min={2} max={100} onChange={e => setMacdSlow(parseInt(e.target.value) || 26)}
              style={{ width: 40, padding: '2px 4px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                background: 'var(--bg-input)', border: '1px solid var(--border-default)',
                color: 'var(--text-primary)', outline: 'none', textAlign: 'center' }} />
            <input type="number" value={macdSignal} min={2} max={50} onChange={e => setMacdSignal(parseInt(e.target.value) || 9)}
              style={{ width: 40, padding: '2px 4px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                background: 'var(--bg-input)', border: '1px solid var(--border-default)',
                color: 'var(--text-primary)', outline: 'none', textAlign: 'center' }} />
          </>
        )}
      </div>

      {/* Run button */}
      <button onClick={handleRun} style={{
        padding: '10px 24px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
        background: 'var(--brand)', border: 'none', color: '#000',
        display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20,
      }}><Play size={16} /> Run Backtest</button>

      {/* Results */}
      {result && result.summary && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            {[
              ['Total Trades', s.totalTrades],
              ['Win Rate', `${s.winRate}%`],
              ['Total P&L', `${s.totalPnl >= 0 ? '+' : ''}$${s.totalPnl}`],
              ['Avg P&L', `${s.avgPnl >= 0 ? '+' : ''}$${s.avgPnl}`],
              ['Max DD', `-$${s.maxDrawdown}`],
              ['Profit Factor', s.profitFactor.toFixed(2)],
            ].map(([label, value]) => (
              <div key={label} style={{
                flex: 1, minWidth: 100, padding: '10px 14px',
                background: 'var(--bg-elevated)', borderRadius: 8,
                border: '1px solid var(--border-subtle)', textAlign: 'center',
              }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 3 }}>{label}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: typeof value === 'string' && value.startsWith('+') ? 'var(--success)' :
                  typeof value === 'string' && value.startsWith('-') ? 'var(--danger)' : 'var(--text-primary)'
                }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Equity curve */}
          <div style={{ padding: 12, background: 'var(--bg-elevated)', borderRadius: 10, border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Equity Curve</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 120 }}>
              {s.equity.map((v, i) => {
                const h = Math.max(2, Math.abs(v) / Math.max(Math.abs(s.totalPnl), 1) * 100)
                return (
                  <div key={i} style={{
                    flex: 1, height: `${h}%`,
                    background: v >= 0 ? 'var(--success)' : 'var(--danger)',
                    borderRadius: '1px 1px 0 0',
                    alignSelf: 'flex-end',
                    opacity: 0.7,
                    minWidth: 1,
                  }} />
                )
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              <span>Trade 1</span>
              <span>Trade {s.totalTrades}</span>
            </div>
          </div>
        </>
      )}

      {result && !result.summary && (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, marginTop: 20 }}>
          No trades generated — try adjusting parameters
        </div>
      )}
    </div>
  )
}