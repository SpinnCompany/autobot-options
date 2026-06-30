import { useState, useMemo, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Play, RotateCcw } from 'lucide-react'
import { generateCandleHistory } from '../data/mockData'
import { runBacktest } from '../engine/BacktestEngine'

const BT_KEY = 'autobot_backtest'

function loadPrefs() {
  try { const r = localStorage.getItem(BT_KEY); return r ? JSON.parse(r) : {} } catch { return {} }
}
function savePrefs(patch) {
  try { localStorage.setItem(BT_KEY, JSON.stringify({ ...loadPrefs(), ...patch })) } catch {}
}

const STRATEGIES = [
  { value: 'rsi', label: 'RSI Overbought/Oversold' },
  { value: 'sma_cross', label: 'SMA Crossover' },
  { value: 'macd_cross', label: 'MACD Signal Cross' },
]

export default function BacktesterView({ assets }) {
  const { t } = useTranslation()
  const prefs = useMemo(() => loadPrefs(), [])

  const [asset, setAsset] = useState(prefs.asset || 'EUR/USD')
  const [strategy, setStrategy] = useState(prefs.strategy || 'rsi')
  const [direction, setDirection] = useState(prefs.direction || 'call')
  const [duration, setDuration] = useState(prefs.duration || 5)
  const [amount, setAmount] = useState(prefs.amount || 100)
  const [payout, setPayout] = useState(prefs.payout || 82)

  // Strategy params
  const [rsiPeriod, setRsiPeriod] = useState(prefs.rsiPeriod || 14)
  const [rsiOversold, setRsiOversold] = useState(prefs.rsiOversold || 30)
  const [rsiOverbought, setRsiOverbought] = useState(prefs.rsiOverbought || 70)
  const [smaFast, setSmaFast] = useState(prefs.smaFast || 9)
  const [smaSlow, setSmaSlow] = useState(prefs.smaSlow || 21)
  const [macdFast, setMacdFast] = useState(prefs.macdFast || 12)
  const [macdSlow, setMacdSlow] = useState(prefs.macdSlow || 26)
  const [macdSignal, setMacdSignal] = useState(prefs.macdSignal || 9)

  const [result, setResult] = useState(null)

  // Persist all params on change
  useEffect(() => {
    savePrefs({ asset, strategy, direction, duration, amount, payout,
      rsiPeriod, rsiOversold, rsiOverbought, smaFast, smaSlow,
      macdFast, macdSlow, macdSignal })
  }, [asset, strategy, direction, duration, amount, payout,
      rsiPeriod, rsiOversold, rsiOverbought, smaFast, smaSlow,
      macdFast, macdSlow, macdSignal])

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

  const strategyLabels = {
    rsi: t('backtest.rsiOverbought'),
    sma_cross: t('backtest.smaCrossover'),
    macd_cross: t('backtest.macdSignalCross'),
  }

  return (
    <div style={{ gridColumn: '2 / 5', padding: 20, overflow: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 18, fontWeight: 700 }}>{t('backtest.title')}</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('backtest.subtitle')}</span>
      </div>

      {/* Config form */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
        gap: 10, marginBottom: 16, padding: 14,
        background: 'var(--bg-elevated)', borderRadius: 10,
        border: '1px solid var(--border-subtle)',
      }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>{t('backtest.asset')}</div>
          <select value={asset} onChange={e => setAsset(e.target.value)} style={{
            width: '100%', padding: '6px 8px', borderRadius: 5, fontSize: 12, fontWeight: 600,
            background: 'var(--bg-input)', border: '1px solid var(--border-default)',
            color: 'var(--text-primary)', outline: 'none', cursor: 'pointer',
          }}>
            {assets.map(a => <option key={a.name} value={a.name}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>{t('backtest.strategy')}</div>
          <select value={strategy} onChange={e => setStrategy(e.target.value)} style={{
            width: '100%', padding: '6px 8px', borderRadius: 5, fontSize: 12, fontWeight: 600,
            background: 'var(--bg-input)', border: '1px solid var(--border-default)',
            color: 'var(--text-primary)', outline: 'none', cursor: 'pointer',
          }}>
            {STRATEGIES.map(s => <option key={s.value} value={s.value}>{strategyLabels[s.value]}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>{t('backtest.direction')}</div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => setDirection('call')} style={{
              flex: 1, padding: '6px 0', borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: 'pointer',
              background: direction === 'call' ? 'var(--success)' : 'var(--bg-input)',
              border: direction === 'call' ? '1px solid var(--success)' : '1px solid var(--border-default)',
              color: direction === 'call' ? '#000' : 'var(--text-secondary)',
            }}>{t('common.call')}</button>
            <button onClick={() => setDirection('put')} style={{
              flex: 1, padding: '6px 0', borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: 'pointer',
              background: direction === 'put' ? 'var(--danger)' : 'var(--bg-input)',
              border: direction === 'put' ? '1px solid var(--danger)' : '1px solid var(--border-default)',
              color: direction === 'put' ? '#fff' : 'var(--text-secondary)',
            }}>{t('common.put')}</button>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>{t('backtest.durationCandles')}</div>
          <input type="number" value={duration} min={1} max={50} onChange={e => setDuration(parseInt(e.target.value) || 5)}
            style={{ width: '100%', padding: '6px 8px', borderRadius: 5, fontSize: 12, fontWeight: 600,
              background: 'var(--bg-input)', border: '1px solid var(--border-default)',
              color: 'var(--text-primary)', outline: 'none', textAlign: 'center' }} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>{t('backtest.amountDollar')}</div>
          <input type="number" value={amount} min={1} onChange={e => setAmount(parseInt(e.target.value) || 100)}
            style={{ width: '100%', padding: '6px 8px', borderRadius: 5, fontSize: 12, fontWeight: 600,
              background: 'var(--bg-input)', border: '1px solid var(--border-default)',
              color: 'var(--text-primary)', outline: 'none', textAlign: 'center' }} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>{t('backtest.payoutPercent')}</div>
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
            <span style={{ color: 'var(--text-muted)' }}>{t('backtest.period')}</span>
            <span style={{ color: 'var(--success)' }}>{t('backtest.oversold')}</span>
            <input type="number" value={rsiOversold} min={1} max={50} onChange={e => setRsiOversold(parseInt(e.target.value) || 30)}
              style={{ width: 45, padding: '2px 4px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                background: 'var(--bg-input)', border: '1px solid var(--border-default)',
                color: 'var(--text-primary)', outline: 'none', textAlign: 'center' }} />
            <span style={{ color: 'var(--danger)' }}>{t('backtest.overbought')}</span>
            <input type="number" value={rsiOverbought} min={50} max={99} onChange={e => setRsiOverbought(parseInt(e.target.value) || 70)}
              style={{ width: 45, padding: '2px 4px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                background: 'var(--bg-input)', border: '1px solid var(--border-default)',
                color: 'var(--text-primary)', outline: 'none', textAlign: 'center' }} />
          </>
        )}
        {strategy === 'sma_cross' && (
          <>
            <span style={{ color: 'var(--text-muted)' }}>{t('backtest.fastSma')}</span>
            <input type="number" value={smaFast} min={2} max={50} onChange={e => setSmaFast(parseInt(e.target.value) || 9)}
              style={{ width: 45, padding: '2px 4px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                background: 'var(--bg-input)', border: '1px solid var(--border-default)',
                color: 'var(--text-primary)', outline: 'none', textAlign: 'center' }} />
            <span style={{ color: 'var(--text-muted)' }}>{t('backtest.slowSma')}</span>
            <input type="number" value={smaSlow} min={5} max={200} onChange={e => setSmaSlow(parseInt(e.target.value) || 21)}
              style={{ width: 45, padding: '2px 4px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                background: 'var(--bg-input)', border: '1px solid var(--border-default)',
                color: 'var(--text-primary)', outline: 'none', textAlign: 'center' }} />
          </>
        )}
        {strategy === 'macd_cross' && (
          <>
            <span style={{ color: 'var(--text-muted)' }}>{t('backtest.fastSlowSignal')}</span>
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
      }}><Play size={16} /> {t('backtest.runButton')}</button>

      {/* Results */}
      {result && result.summary && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            {[
              [t('backtest.totalTrades'), s.totalTrades],
              [t('backtest.winRate'), `${s.winRate}%`],
              [t('backtest.totalPnL'), `${s.totalPnl >= 0 ? '+' : ''}$${s.totalPnl}`],
              [t('backtest.avgPnL'), `${s.avgPnl >= 0 ? '+' : ''}$${s.avgPnl}`],
              [t('backtest.maxDrawdown'), `-$${s.maxDrawdown}`],
              [t('backtest.profitFactor'), s.profitFactor.toFixed(2)],
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
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>{t('backtest.equityCurve')}</div>
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
              <span>{t('backtest.tradeLabel')} 1</span>
              <span>{t('backtest.tradeLabel')} {s.totalTrades}</span>
            </div>
          </div>
        </>
      )}

      {result && !result.summary && (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, marginTop: 20 }}>
          {t('backtest.noTrades')}
        </div>
      )}
    </div>
  )
}
