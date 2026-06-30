import { useState } from 'react'
import { X, TrendingUp, CandlestickChart, BarChart3, Plus } from 'lucide-react'
import { TIMEFRAMES, TF_MAP } from '../data/mockData'

const TABS = [
  { id: 'chart', label: 'Chart' },
  { id: 'overlays', label: 'Overlays' },
  { id: 'alerts', label: 'Alerts' },
]

function ToggleBtn({ label, on, onClick, color, style }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', padding: '7px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
      background: on ? (color || 'rgba(245,123,0,0.10)') : 'var(--bg-input)',
      border: on ? `1px solid ${color || 'rgba(245,123,0,0.25)'}` : '1px solid var(--border-default)',
      color: on ? 'var(--text-primary)' : 'var(--text-secondary)',
      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      ...style,
    }}>
      <span>{label}</span>
      <span style={{ fontSize: 11, opacity: 0.7 }}>{on ? 'ON' : 'OFF'}</span>
    </button>
  )
}

export default function SettingsModal({
  // Chart
  chartType, setChartType, drawingMode, setDrawingMode,
  timeframe, onTimeframeChange,
  // Indicators
  showIndicators, setShowIndicators,
  showSMA, setShowSMA, smaPeriod, setSmaPeriod,
  showRSI, setShowRSI, rsiPeriod, setRsiPeriod,
  showMACD, setShowMACD, macdFast, setMacdFast, macdSlow, setMacdSlow, macdSignal, setMacdSignal,
  showVWAP, setShowVWAP,
  showMTF, setShowMTF, mtfTimeframe, setMtfTimeframe,
  showOrderBook, setShowOrderBook,
  showVolumeProfile, setShowVolumeProfile, vpBins, setVpBins,
  customIndicators, setCustomIndicators,
  // Alerts
  alerts, selectedAsset, assets, onAddAlert, onRemoveAlert,
  toastDuration, onToastDurationChange,
  confirmTrades, onToggleConfirmTrades,
  pushEnabled, pushPermission, onTogglePush,
  // Misc
  assetColor, onClose,
}) {
  const [tab, setTab] = useState('chart')

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
    }}>
      <div style={{
        background: 'var(--bg-surface)', borderRadius: 14, padding: 20,
        width: 380, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        border: '1px solid var(--border-default)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexShrink: 0 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Chart Settings</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, marginBottom: 14, flexShrink: 0 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: tab === t.id ? 'var(--bg-elevated)' : 'transparent',
              border: tab === t.id ? '1px solid var(--border-default)' : '1px solid transparent',
              color: tab === t.id ? 'var(--text-primary)' : 'var(--text-muted)',
              transition: 'all 0.15s',
            }}>{t.label}</button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {tab === 'chart' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Chart Type */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Type</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[
                    { type: 'area', icon: <TrendingUp size={16} />, label: 'Area' },
                    { type: 'candlestick', icon: <CandlestickChart size={16} />, label: 'Candles' },
                    { type: 'bar', icon: <BarChart3 size={16} />, label: 'Bar' },
                  ].map(opt => (
                    <button key={opt.type} onClick={() => setChartType(opt.type)} style={{
                      flex: 1, padding: '10px 6px', borderRadius: 8,
                      background: chartType === opt.type ? 'var(--brand)' : 'var(--bg-input)',
                      border: chartType === opt.type ? '1px solid var(--brand-light)' : '1px solid var(--border-default)',
                      color: chartType === opt.type ? '#000' : 'var(--text-secondary)',
                      cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                      fontSize: 11, fontWeight: 600, transition: 'all 0.15s',
                    }}>{opt.icon}{opt.label}</button>
                  ))}
                </div>
              </div>

              {/* Timeframe */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Timeframe</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {TIMEFRAMES.map(tf => (
                    <button key={tf.value} onClick={() => onTimeframeChange(tf.value)} style={{
                      flex: 1, padding: '7px 2px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      background: timeframe === tf.value ? 'var(--brand)' : 'var(--bg-input)',
                      border: timeframe === tf.value ? '1px solid var(--brand-light)' : '1px solid var(--border-default)',
                      color: timeframe === tf.value ? '#000' : 'var(--text-secondary)',
                    }}>{tf.label}</button>
                  ))}
                </div>
              </div>

              {/* Drawing Tools */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Drawing Tools</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[
                    { mode: 'off', label: 'Cursor', key: 'Esc' },
                    { mode: 'horizontal', label: 'H Line', key: 'H' },
                    { mode: 'trendline', label: 'Trend', key: 'T' },
                    { mode: 'fibonacci', label: 'Fib', key: 'F' },
                  ].map(({ mode, label, key }) => (
                    <button key={mode} onClick={() => { setDrawingMode(mode); window.dispatchEvent(new CustomEvent('pit-clear-anchor')) }} style={{
                      flex: 1, padding: '7px 4px', borderRadius: 7, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      background: drawingMode === mode ? 'var(--brand)' : 'var(--bg-input)',
                      border: drawingMode === mode ? '1px solid var(--brand-light)' : '1px solid var(--border-default)',
                      color: drawingMode === mode ? '#000' : 'var(--text-secondary)',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                    }}><span>{label}</span><span style={{ fontSize: 7, opacity: 0.5 }}>{key}</span></button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'overlays' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <ToggleBtn label="EMA (9) + Bollinger (20,2)" on={showIndicators} onClick={() => setShowIndicators(prev => !prev)} color="rgba(59,130,246,0.12)" />

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ToggleBtn label="SMA" on={showSMA} onClick={() => setShowSMA(prev => !prev)} color="rgba(250,204,21,0.12)" style={{ flex: 1 }} />
                {showSMA && <input type="number" value={smaPeriod} min={2} max={200} onChange={e => setSmaPeriod(parseInt(e.target.value) || 20)} style={numStyle} title="Period" />}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ToggleBtn label="RSI" on={showRSI} onClick={() => setShowRSI(prev => !prev)} color="rgba(239,68,68,0.10)" style={{ flex: 1 }} />
                {showRSI && <input type="number" value={rsiPeriod} min={2} max={100} onChange={e => setRsiPeriod(parseInt(e.target.value) || 14)} style={numStyle} title="Period" />}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <ToggleBtn label="MACD" on={showMACD} onClick={() => setShowMACD(prev => !prev)} color="rgba(168,85,247,0.10)" style={{ flex: 1 }} />
                {showMACD && <>
                  <input type="number" value={macdFast} min={2} max={50} onChange={e => setMacdFast(parseInt(e.target.value) || 12)} style={{ ...numStyle, width: 28 }} title="Fast" />
                  <input type="number" value={macdSlow} min={2} max={100} onChange={e => setMacdSlow(parseInt(e.target.value) || 26)} style={{ ...numStyle, width: 28 }} title="Slow" />
                  <input type="number" value={macdSignal} min={2} max={50} onChange={e => setMacdSignal(parseInt(e.target.value) || 9)} style={{ ...numStyle, width: 28 }} title="Signal" />
                </>}
              </div>

              <ToggleBtn label="VWAP" on={showVWAP} onClick={() => setShowVWAP(prev => !prev)} color="rgba(255,193,7,0.10)" />

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ToggleBtn label={`MTF Overlay${showMTF ? ' ' + mtfTimeframe : ''}`} on={showMTF} onClick={() => setShowMTF(prev => !prev)} color="rgba(245,123,0,0.08)" style={{ flex: 1 }} />
                {showMTF && (
                  <select value={mtfTimeframe} onChange={e => setMtfTimeframe(e.target.value)} style={{
                    ...numStyle, width: 48, cursor: 'pointer', textAlign: 'center',
                  }}>
                    {TIMEFRAMES.filter(tf => TF_MAP[tf.value] > (TF_MAP[timeframe] || 60000)).map(tf => (
                      <option key={tf.value} value={tf.value}>{tf.label}</option>
                    ))}
                  </select>
                )}
              </div>

              <ToggleBtn label="Order Book (DOM)" on={showOrderBook} onClick={() => setShowOrderBook(prev => !prev)} color="rgba(41,121,255,0.08)" />

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ToggleBtn label="Volume Profile" on={showVolumeProfile} onClick={() => setShowVolumeProfile(prev => !prev)} color="rgba(41,121,255,0.10)" style={{ flex: 1 }} />
                {showVolumeProfile && <input type="number" value={vpBins} min={10} max={60} step={5} onChange={e => setVpBins(parseInt(e.target.value) || 30)} style={numStyle} title="Bins" />}
              </div>

              {/* Custom Indicators */}
              <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 8, marginTop: 4 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Custom</div>
                {customIndicators.map((ci, idx) => (
                  <div key={idx} style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px', marginBottom: 2,
                    borderRadius: 5, background: 'var(--bg-input)', fontSize: 11,
                    border: '1px solid var(--border-default)',
                  }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: ci.color, flexShrink: 0 }} />
                    <span style={{ fontWeight: 600, flex: 1 }}>{ci.type.toUpperCase()}({ci.source}, {ci.period})</span>
                    <button onClick={() => {
                      const next = customIndicators.filter((_, i) => i !== idx)
                      setCustomIndicators(next)
                      try { localStorage.setItem('autobot_custom_inds', JSON.stringify(next)) } catch {}
                    }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, padding: 0 }}>×</button>
                  </div>
                ))}
                <button onClick={() => {
                  const next = [...customIndicators, {
                    type: 'sma', source: 'close', period: 20,
                    color: ['#3b82f6', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6'][customIndicators.length % 5],
                  }]
                  setCustomIndicators(next)
                  try { localStorage.setItem('autobot_custom_inds', JSON.stringify(next)) } catch {}
                }} style={{
                  width: '100%', padding: '4px 0', borderRadius: 5, fontSize: 11, fontWeight: 600,
                  background: 'var(--bg-input)', border: '1px dashed var(--border-default)',
                  color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                }}><Plus size={12} /> Add</button>
              </div>
            </div>
          )}

          {tab === 'alerts' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Price Alerts */}
              {onAddAlert && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Price Alerts</div>
                  {alerts.filter(a => a.asset === selectedAsset).map(a => (
                    <div key={a.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '4px 8px', marginBottom: 3, borderRadius: 5, fontSize: 11,
                      background: a.triggered ? 'var(--bg-input)' : 'rgba(245,123,0,0.06)',
                      border: '1px solid var(--border-subtle)', opacity: a.triggered ? 0.5 : 1,
                    }}>
                      <span>{a.asset} {a.direction === 'above' ? '>' : '<'} {a.price.toFixed(5)}</span>
                      <button onClick={() => onRemoveAlert(a.id)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, padding: 0 }}>×</button>
                    </div>
                  ))}
                  {(() => {
                    const asset = assets?.find(a => a.name === selectedAsset)
                    if (!asset) return null
                    const p = asset.price
                    return (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => onAddAlert(selectedAsset, parseFloat((p * 1.002).toFixed(5)), 'above')} style={alertBtnStyle('var(--success)')}>Above {(p * 1.002).toFixed(5)}</button>
                        <button onClick={() => onAddAlert(selectedAsset, parseFloat((p * 0.998).toFixed(5)), 'below')} style={alertBtnStyle('var(--danger)')}>Below {(p * 0.998).toFixed(5)}</button>
                      </div>
                    )
                  })()}
                </div>
              )}

              {/* Toast duration */}
              {onToastDurationChange && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Toast Duration</div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[{ l: '3s', v: 3000 }, { l: '5s', v: 5000 }, { l: '10s', v: 10000 }, { l: 'Stay', v: 0 }].map(o => (
                      <button key={o.v} onClick={() => onToastDurationChange(o.v)} style={{
                        flex: 1, padding: '6px 2px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        background: toastDuration === o.v ? 'var(--brand)' : 'var(--bg-input)',
                        border: toastDuration === o.v ? '1px solid var(--brand-light)' : '1px solid var(--border-default)',
                        color: toastDuration === o.v ? '#000' : 'var(--text-secondary)',
                      }}>{o.l}</button>
                    ))}
                  </div>
                </div>
              )}

              {/* Trade Safety */}
              {onToggleConfirmTrades && (
                <ToggleBtn label="Require trade confirmation" on={confirmTrades} onClick={onToggleConfirmTrades} />
              )}

              {/* Push */}
              {onTogglePush && (
                <ToggleBtn
                  label={`Push Notifications${pushPermission === 'denied' ? ' (blocked)' : ''}`}
                  on={pushEnabled} onClick={onTogglePush}
                  color="rgba(245,123,0,0.10)"
                />
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', marginTop: 12,
          background: 'var(--bg-elevated)', borderRadius: 8, border: '1px solid var(--border-subtle)',
          flexShrink: 0,
        }}>
          <div style={{ width: 10, height: 10, borderRadius: 3, background: assetColor }} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{selectedAsset}</span>
        </div>
      </div>
    </div>
  )
}

const numStyle = {
  width: 36, padding: '4px 2px', borderRadius: 4, fontSize: 11, fontWeight: 600,
  background: 'var(--bg-input)', border: '1px solid var(--border-default)',
  color: 'var(--text-primary)', outline: 'none', textAlign: 'center',
}

const alertBtnStyle = (color) => ({
  flex: 1, padding: '5px 4px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
  background: 'var(--bg-input)', border: '1px solid var(--border-default)',
  color, fontVariantNumeric: 'tabular-nums',
})