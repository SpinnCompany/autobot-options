import { useState, useCallback, useEffect, useRef } from 'react'
import { ChevronUp, ChevronDown, ChevronRight, Minus, Plus, X, Check, Divide, CornerDownLeft, Volume2, VolumeX } from 'lucide-react'
import { DURATIONS, AMOUNT_PRESETS, getAssetColor } from '../data/mockData'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import ConfirmModal from './ConfirmModal'
import AssetIcon from './AssetIcon'

function fmtTime(remaining) {
  const s = Math.max(0, Math.floor(remaining))
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function PositionCard({ pos, assets, onClose, onDoubleUp, onExtend, onSetNote, expanded, onToggle }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (pos.status !== 'open') return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [pos.status, pos.id])

  // Use expiresAt as the single source of truth — accurate even after extend
  const remaining = Math.max(0, (pos.expiresAt - now) / 1000)
  const elapsed = pos.duration - remaining
  const progress = Math.min(100, (elapsed / pos.duration) * 100)
  const asset = assets?.find(a => a.name === pos.asset)
  const payoutPercent = asset?.payout || 82
  const potentialPayout = pos.amount * (1 + payoutPercent / 100)
  const buyback = pos.amount * Math.max(0.15, remaining / pos.duration * 0.70)

  return (
    <div className="position-card" style={{
      padding: '8px 10px', marginBottom: 4,
      background: 'var(--bg-elevated)', borderRadius: 8,
      border: '1px solid var(--border-subtle)', fontSize: 11,
    }}>
      {/* Header row */}
      <div onClick={onToggle} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Circular countdown ring */}
          {pos.status === 'open' && (() => {
            const r = 10, circ = 2 * Math.PI * r
            const pct = Math.min(1, Math.max(0, remaining / pos.duration))
            const strokeColor = remaining < 10 ? 'var(--danger)' : pos.direction === 'call' ? 'var(--success)' : 'var(--danger)'
            return (
              <svg width={28} height={28} style={{ flexShrink: 0 }}>
                <circle cx={14} cy={14} r={r} fill="none" stroke="var(--bg-input)" strokeWidth="2" />
                <circle cx={14} cy={14} r={r} fill="none" stroke={strokeColor} strokeWidth="2.5"
                  strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)}
                  transform="rotate(-90 14 14)" style={{ transition: 'stroke-dashoffset 0.25s linear, stroke 0.3s' }} />
              </svg>
            )
          })()}
          <AssetIcon asset={asset} size={18} style={{ borderRadius: 4, background: (asset?.color || '#666') + '22', color: asset?.color || '#888', fontSize: 11 }} />
          <span style={{ fontWeight: 600, fontSize: 12 }}>{pos.asset}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
            background: pos.direction === 'call' ? 'rgba(0,200,83,0.15)' : 'rgba(255,23,68,0.15)',
            color: pos.direction === 'call' ? 'var(--success)' : 'var(--danger)',
          }}>{pos.direction.toUpperCase()}</span>
          <span style={{ fontWeight: 700, fontSize: 12, fontVariantNumeric: 'tabular-nums', color: remaining < 10 ? 'var(--danger)' : 'var(--text-primary)' }}>
            {pos.status === 'open' ? fmtTime(remaining) : '—'}
          </span>
          <span style={{
            color: 'var(--text-muted)', opacity: 0.5, transition: 'transform 0.15s',
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            display: 'flex', alignItems: 'center',
          }}>
            <ChevronRight size={14} />
          </span>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)' }}>ID</span>
            <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{pos.id.slice(0, 12)}…</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)' }}>Investment</span>
            <span style={{ fontWeight: 600 }}>${pos.amount.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)' }}>Payout</span>
            <span style={{ fontWeight: 600, color: 'var(--success)' }}>+${potentialPayout.toFixed(2)} ({payoutPercent}%)</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)' }}>Entry</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{pos.entryPrice?.toFixed(5)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-muted)' }}>Duration</span>
            <span>{pos.duration}s</span>
          </div>
          {pos.tp && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>TP</span>
              <span style={{ fontWeight: 600, color: 'var(--success)', fontVariantNumeric: 'tabular-nums' }}>{pos.tp.toFixed(5)}</span>
            </div>
          )}
          {pos.sl && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>SL</span>
              <span style={{ fontWeight: 600, color: 'var(--danger)', fontVariantNumeric: 'tabular-nums' }}>{pos.sl.toFixed(5)}</span>
            </div>
          )}
          {pos.status !== 'open' && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Exit</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{pos.exitPrice?.toFixed(5) || '—'}</span>
            </div>
          )}
          {/* Trade journal note */}
          <div style={{ marginTop: 4 }}>
            <input
              type="text"
              value={pos.note || ''}
              onChange={e => onSetNote?.(pos.id, e.target.value)}
              placeholder="Add note…"
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%', padding: '4px 6px', borderRadius: 4, fontSize: 11,
                background: 'var(--bg-input)', border: pos.note ? '1px solid var(--brand)' : '1px solid var(--border-default)',
                color: pos.note ? 'var(--text-primary)' : 'var(--text-muted)',
                outline: 'none', fontStyle: pos.note ? 'normal' : 'italic',
              }}
            />
          </div>
        </div>
      )}

      {/* Note indicator on collapsed card */}
      {!expanded && pos.note && (
        <div style={{ fontSize: 11, color: 'var(--brand)', opacity: 0.6, marginTop: 2 }}>
          <span style={{fontWeight:600,color:'var(--brand)',marginRight:2}}>Note:</span>{pos.note.slice(0, 40)}{pos.note.length > 40 ? '...' : ''}
        </div>
      )}

      {/* Sell now + Double Up buttons */}
      {pos.status === 'open' && (
        <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
          <button onClick={(e) => { e.stopPropagation(); onClose(pos.id) }} style={{
            flex: 1, padding: '4px 0', borderRadius: 6,
            background: 'var(--bg-input)', border: '1px solid var(--border-default)',
            color: 'var(--danger)', cursor: 'pointer', fontSize: 11, fontWeight: 600,
          }}>
            Sell — ${buyback.toFixed(2)}
          </button>
          {onDoubleUp && (
            <button onClick={(e) => { e.stopPropagation(); onDoubleUp(pos) }} style={{
              flex: 1, padding: '4px 0', borderRadius: 6,
              background: 'var(--bg-input)', border: '1px solid var(--border-default)',
              color: 'var(--brand)', cursor: 'pointer', fontSize: 11, fontWeight: 600,
            }}>
              Double Up
            </button>
          )}
          {onExtend && (
            <button onClick={(e) => { e.stopPropagation(); onExtend(pos.id, 60) }} title="Extend by 60s (fee: 10%)" style={{
              flex: 1, padding: '4px 0', borderRadius: 6,
              background: 'var(--bg-input)', border: '1px solid var(--border-default)',
              color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 11, fontWeight: 600,
            }}>
              +60s · ${(pos.amount * 0.10).toFixed(2)}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function TradePanel({ selectedAsset, assets, positions, balance, onPlaceTrade, onClosePosition, soundMuted, onToggleSound, dailyPnl = 0, confirmTrades = false, lastTradeResult, lastTradeProfit = 0, baseAmount = 100, onDoubleUp, onExtendPosition, onSetPositionNote, onResetAccount, mobileOpen, onCloseMobile, pendingOrders = [], onPlacePendingOrder, onCancelPendingOrder, dailyTradeCount = 0, dailyLossLimit = 0, maxPositionPct = 0, maxDailyTrades = 0, onSetDailyLossLimit, onSetMaxPositionPct, onSetMaxDailyTrades, minPayoutPct = 0, onSetMinPayoutPct, newsBlockEnabled = false, newsBlockLevels = { high: true, medium: true, low: false }, onSetNewsBlockEnabled, onSetNewsBlockLevels }) {
  // ── Persisted trade defaults ──
  const [amount, setAmount] = useState(() => {
    try { return localStorage.getItem('autobot_trade_amount') || '100' } catch { return '100' }
  })
  const [duration, setDuration] = useState(() => {
    try { return parseInt(localStorage.getItem('autobot_trade_duration')) || 60 } catch { return 60 }
  })
  const [takeProfit, setTakeProfit] = useState(() => {
    try { return localStorage.getItem('autobot_trade_tp') || '' } catch { return '' }
  })
  const [stopLoss, setStopLoss] = useState(() => {
    try { return localStorage.getItem('autobot_trade_sl') || '' } catch { return '' }
  })
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [expandedPos, setExpandedPos] = useState(null)
  const [confirming, setConfirming] = useState(null) // 'call' | 'put' | null
  const [showResetModal, setShowResetModal] = useState(false)
  const confirmTimerRef = useRef(null)

  // ── Martingale state (loss recovery) ──
  const [mgEnabled, setMgEnabled] = useState(() => {
    try { return localStorage.getItem('autobot_mg_enabled') === 'true' } catch { return false }
  })
  const [mgIsAuto, setMgIsAuto] = useState(() => {
    try { return localStorage.getItem('autobot_mg_auto') !== 'false' } catch { return true }
  })
  const [mgMultiplier, setMgMultiplier] = useState(() => {
    try { return parseFloat(localStorage.getItem('autobot_mg_mult')) || 2 } catch { return 2 }
  })
  const [mgMaxSteps, setMgMaxSteps] = useState(() => {
    try { return parseInt(localStorage.getItem('autobot_mg_maxsteps')) || 8 } catch { return 8 }
  })
  const [mgSteps, setMgSteps] = useState(() => {
    try { return JSON.parse(localStorage.getItem('autobot_mg_steps') || '[10,20,40,80,160,320,640,1280]') } catch { return [10,20,40,80,160,320,640,1280] }
  })
  const [mgStepsOn, setMgStepsOn] = useState(() => {
    try { return JSON.parse(localStorage.getItem('autobot_mg_steps_on') || '[true,true,true,true,true,true,true,true]') } catch { return [true,true,true,true,true,true,true,true] }
  })
  const [mgStepIndex, setMgStepIndex] = useState(() => {
    try { return parseInt(localStorage.getItem('autobot_mg_step_idx'), 10) || -1 } catch { return -1 }
  })

  // ── D'Alembert state (unit-based step strategy) ──
  const [daEnabled, setDaEnabled] = useState(() => {
    try { return localStorage.getItem('autobot_da_enabled') === 'true' } catch { return false }
  })
  const [daIsAuto, setDaIsAuto] = useState(() => {
    try { return localStorage.getItem('autobot_da_auto') !== 'false' } catch { return true }
  })
  const [daUnit, setDaUnit] = useState(() => {
    try { return parseFloat(localStorage.getItem('autobot_da_unit')) || 5 } catch { return 5 }
  })
  const [daInitialStake, setDaInitialStake] = useState(() => {
    try { return parseFloat(localStorage.getItem('autobot_da_init')) || 10 } catch { return 10 }
  })
  const [daTakeProfit, setDaTakeProfit] = useState(() => {
    try { return parseFloat(localStorage.getItem('autobot_da_tp')) || 100 } catch { return 100 }
  })
  const [daStopLoss, setDaStopLoss] = useState(() => {
    try { return parseFloat(localStorage.getItem('autobot_da_sl')) || 100 } catch { return 100 }
  })
  const [daMaxStake, setDaMaxStake] = useState(() => {
    try { return parseFloat(localStorage.getItem('autobot_da_max')) || 0 } catch { return 0 }
  })
  const [daMaxContracts, setDaMaxContracts] = useState(() => {
    try { return parseInt(localStorage.getItem('autobot_da_maxc')) || 0 } catch { return 0 }
  })
  const [daCurrentStake, setDaCurrentStake] = useState(() => {
    try { return parseFloat(localStorage.getItem('autobot_da_cur')) || 0 } catch { return 0 }
  })
  const [daCumulativePnl, setDaCumulativePnl] = useState(() => {
    try { return parseFloat(localStorage.getItem('autobot_da_pnl')) || 0 } catch { return 0 }
  })
  const [daStepCount, setDaStepCount] = useState(() => {
    try { return parseInt(localStorage.getItem('autobot_da_step')) || 0 } catch { return 0 }
  })

  // ── Compounding state (profit reinvestment) ──
  const [cpEnabled, setCpEnabled] = useState(() => {
    try { return localStorage.getItem('autobot_cp_enabled') === 'true' } catch { return false }
  })
  const [cpIsAuto, setCpIsAuto] = useState(() => {
    try { return localStorage.getItem('autobot_cp_auto') !== 'false' } catch { return true }
  })
  const [cpCompoundPct, setCpCompoundPct] = useState(() => {
    try { return parseInt(localStorage.getItem('autobot_cp_pct')) || 50 } catch { return 50 }
  })
  const [cpMaxSteps, setCpMaxSteps] = useState(() => {
    try { return parseInt(localStorage.getItem('autobot_cp_maxsteps')) || 5 } catch { return 5 }
  })
  const [cpSteps, setCpSteps] = useState(() => {
    try { return JSON.parse(localStorage.getItem('autobot_cp_steps') || '[10,20,40,80,160]') } catch { return [10,20,40,80,160] }
  })
  const [cpStepsOn, setCpStepsOn] = useState(() => {
    try { return JSON.parse(localStorage.getItem('autobot_cp_steps_on') || '[true,true,true,true,true]') } catch { return [true,true,true,true,true] }
  })
  const [cpStepIndex, setCpStepIndex] = useState(() => {
    try { return parseInt(localStorage.getItem('autobot_cp_step_idx'), 10) || -1 } catch { return -1 }
  })

  // ── Pending order state ──
  const [orderEntryPrice, setOrderEntryPrice] = useState(() => {
    try { return localStorage.getItem('autobot_order_entry') || '' } catch { return '' }
  })
  const [orderDirection, setOrderDirection] = useState(() => {
    try { return localStorage.getItem('autobot_order_dir') || 'call' } catch { return 'call' }
  })
  const [orderAmount, setOrderAmount] = useState(() => {
    try { return localStorage.getItem('autobot_order_amt') || '100' } catch { return '100' }
  })
  const [orderDuration, setOrderDuration] = useState(() => {
    try { return parseInt(localStorage.getItem('autobot_order_dur'), 10) || 60 } catch { return 60 }
  })
  const [orderTP, setOrderTP] = useState('')
  const [orderSL, setOrderSL] = useState('')
  const [showEntryOrder, setShowEntryOrder] = useState(false)
  const [showOrderForm, setShowOrderForm] = useState(false)
  const [showRisk, setShowRisk] = useState(false)

  // ── Persist step progress & entry order form ──
  useEffect(() => { try { localStorage.setItem('autobot_mg_step_idx', String(mgStepIndex)) } catch {} }, [mgStepIndex])
  useEffect(() => { try { localStorage.setItem('autobot_cp_step_idx', String(cpStepIndex)) } catch {} }, [cpStepIndex])
  useEffect(() => { try { localStorage.setItem('autobot_order_entry', orderEntryPrice) } catch {} }, [orderEntryPrice])
  useEffect(() => { try { localStorage.setItem('autobot_order_dir', orderDirection) } catch {} }, [orderDirection])
  useEffect(() => { try { localStorage.setItem('autobot_order_amt', orderAmount) } catch {} }, [orderAmount])
  useEffect(() => { try { localStorage.setItem('autobot_order_dur', String(orderDuration)) } catch {} }, [orderDuration])

  // Persist helpers — martingale
  const persistMg = (v) => { setMgEnabled(v); try { localStorage.setItem('autobot_mg_enabled', String(v)) } catch {} }
  const persistMgAuto = (v) => { setMgIsAuto(v); try { localStorage.setItem('autobot_mg_auto', String(v)) } catch {} }
  const persistMgMult = (v) => { setMgMultiplier(v); try { localStorage.setItem('autobot_mg_mult', String(v)) } catch {} }
  const persistMgMaxSteps = (v) => { setMgMaxSteps(v); try { localStorage.setItem('autobot_mg_maxsteps', String(v)) } catch {} }
  const persistMgSteps = (v) => { setMgSteps(v); try { localStorage.setItem('autobot_mg_steps', JSON.stringify(v)) } catch {} }
  const persistMgStepsOn = (v) => { setMgStepsOn(v); try { localStorage.setItem('autobot_mg_steps_on', JSON.stringify(v)) } catch {} }
  // Persist helpers — compounding
  const persistCp = (v) => { setCpEnabled(v); try { localStorage.setItem('autobot_cp_enabled', String(v)) } catch {} }
  const persistCpAuto = (v) => { setCpIsAuto(v); try { localStorage.setItem('autobot_cp_auto', String(v)) } catch {} }
  const persistCpPct = (v) => { setCpCompoundPct(v); try { localStorage.setItem('autobot_cp_pct', String(v)) } catch {} }
  const persistCpMaxSteps = (v) => { setCpMaxSteps(v); try { localStorage.setItem('autobot_cp_maxsteps', String(v)) } catch {} }
  const persistCpSteps = (v) => { setCpSteps(v); try { localStorage.setItem('autobot_cp_steps', JSON.stringify(v)) } catch {} }
  const persistCpStepsOn = (v) => { setCpStepsOn(v); try { localStorage.setItem('autobot_cp_steps_on', JSON.stringify(v)) } catch {} }
  // Persist helpers — D'Alembert
  const persistDa = (v) => { setDaEnabled(v); try { localStorage.setItem('autobot_da_enabled', String(v)) } catch {} }
  const persistDaAuto = (v) => { setDaIsAuto(v); try { localStorage.setItem('autobot_da_auto', String(v)) } catch {} }
  const persistDaUnit = (v) => { setDaUnit(v); try { localStorage.setItem('autobot_da_unit', String(v)) } catch {} }
  const persistDaInitial = (v) => { setDaInitialStake(v); try { localStorage.setItem('autobot_da_init', String(v)) } catch {} }
  const persistDaTP = (v) => { setDaTakeProfit(v); try { localStorage.setItem('autobot_da_tp', String(v)) } catch {} }
  const persistDaSL = (v) => { setDaStopLoss(v); try { localStorage.setItem('autobot_da_sl', String(v)) } catch {} }
  const persistDaMax = (v) => { setDaMaxStake(v); try { localStorage.setItem('autobot_da_max', String(v)) } catch {} }
  const persistDaMaxC = (v) => { setDaMaxContracts(v); try { localStorage.setItem('autobot_da_maxc', String(v)) } catch {} }

  // ── Persist trade defaults ──
  useEffect(() => { try { localStorage.setItem('autobot_trade_amount', amount) } catch {} }, [amount])
  useEffect(() => { try { localStorage.setItem('autobot_trade_duration', String(duration)) } catch {} }, [duration])
  useEffect(() => { try { localStorage.setItem('autobot_trade_tp', takeProfit) } catch {} }, [takeProfit])
  useEffect(() => { try { localStorage.setItem('autobot_trade_sl', stopLoss) } catch {} }, [stopLoss])

  // Reset indexes on mode toggle
  useEffect(() => { setMgStepIndex(-1) }, [mgEnabled, mgIsAuto])
  useEffect(() => { setCpStepIndex(-1) }, [cpEnabled, cpIsAuto])

  const currentAsset = assets.find(a => a.name === selectedAsset)
  const assetColor = getAssetColor(selectedAsset, assets)
  const payoutPercent = currentAsset?.payout || 82
  const openPositions = positions.filter(p => p.status === 'open')
  const closedPositions = positions.filter(p => p.status !== 'open')

  // Clear confirmation on timeout or external change
  useEffect(() => {
    if (confirming) {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current)
      confirmTimerRef.current = setTimeout(() => setConfirming(null), 3000)
      const onKey = (e) => { if (e.key === 'Escape') setConfirming(null) }
      window.addEventListener('keydown', onKey)
      return () => { window.removeEventListener('keydown', onKey); if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current) }
    }
    return () => { if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current) }
  }, [confirming])

  // Auto-stake — martingale (loss) + compounding (win), both independent
  useEffect(() => {
    if (!lastTradeResult) return

    // ── Martingale: triggers on loss, resets on win ──
    if (mgEnabled && mgIsAuto) {
      if (lastTradeResult === 'loss') {
        const currentAmount = parseFloat(amount) || baseAmount
        const stepNum = mgStepIndex + 2
        if (mgMaxSteps > 0 && stepNum > mgMaxSteps) { setMgStepIndex(mgMaxSteps - 1) }
        else {
          setMgStepIndex(prev => prev + 1)
          const nextAmount = mgStepIndex === -1
            ? (baseAmount || currentAmount) * mgMultiplier
            : currentAmount * mgMultiplier
          setAmount(String(Math.min(balance, parseFloat(nextAmount.toFixed(2)))))
        }
      } else if (lastTradeResult === 'win') {
        setMgStepIndex(-1)
      }
    }

    // ── D'Alembert: +unit on loss, -unit on win, never below initial ──
    if (daEnabled && daIsAuto) {
      const currentStake = daCurrentStake || daInitialStake
      const unit = daUnit || 5
      const maxStake = daMaxStake || 0
      const maxContracts = daMaxContracts || 0
      const pnl = daCumulativePnl + (lastTradeProfit || 0)
      setDaCumulativePnl(pnl)

      // Stop conditions
      if (daTakeProfit > 0 && pnl >= daTakeProfit) {
        setDaEnabled(false)
        addToast(`D'Alembert TP hit: +$${pnl.toFixed(2)}`, 'success')
      } else if (daStopLoss > 0 && pnl <= -daStopLoss) {
        setDaEnabled(false)
        addToast(`D'Alembert SL hit: -$${Math.abs(pnl).toFixed(2)}`, 'error')
      } else if (maxContracts > 0 && daStepCount + 1 >= maxContracts) {
        setDaEnabled(false)
        addToast(`D'Alembert max contracts (${maxContracts}) reached`, 'error')
      } else if (lastTradeResult === 'loss') {
        const next = currentStake + unit
        if (maxStake > 0 && next > maxStake) {
          // Exceeded max — reset to initial
          setDaCurrentStake(daInitialStake)
          setAmount(String(Math.min(balance, daInitialStake)))
        } else {
          setDaCurrentStake(next)
          setAmount(String(Math.min(balance, parseFloat(next.toFixed(2)))))
        }
        setDaStepCount(prev => prev + 1)
      } else if (lastTradeResult === 'win') {
        const next = Math.max(daInitialStake, currentStake - unit)
        setDaCurrentStake(next)
        setAmount(String(Math.min(balance, parseFloat(next.toFixed(2)))))
        setDaStepCount(prev => prev + 1)
      }
    }

    // ── Compounding: triggers on win, resets on loss ──
    if (cpEnabled && cpIsAuto) {
      if (lastTradeResult === 'win') {
        const stepNum = cpStepIndex + 2
        if (cpMaxSteps > 0 && stepNum > cpMaxSteps) { setCpStepIndex(cpMaxSteps - 1) }
        else {
          setCpStepIndex(prev => prev + 1)
          const profitToReinvest = Math.abs(lastTradeProfit) * (cpCompoundPct / 100)
          setAmount(prev => {
            const next = (parseFloat(prev) || baseAmount) + profitToReinvest
            return String(Math.min(balance, parseFloat(next.toFixed(2))))
          })
        }
      } else if (lastTradeResult === 'loss') {
        setCpStepIndex(-1)
      }
    }
  }, [lastTradeResult])

  // ── Manual controls ──
  const mgAdvance = () => {
    // Find next enabled step
    let nextIdx = mgStepIndex + 1
    while (nextIdx < mgSteps.length && !mgStepsOn[nextIdx]) nextIdx++
    if (nextIdx >= mgSteps.length) return // no more enabled steps
    setMgStepIndex(nextIdx)
    setAmount(String(mgSteps[nextIdx]))
  }
  const mgReset = () => { setMgStepIndex(-1); setAmount(String(baseAmount || 100)) }

  const cpAdvance = () => {
    let nextIdx = cpStepIndex + 1
    while (nextIdx < cpSteps.length && !cpStepsOn[nextIdx]) nextIdx++
    if (nextIdx >= cpSteps.length) return
    setCpStepIndex(nextIdx)
    setAmount(prev => {
      const next = (parseFloat(prev) || baseAmount) + (cpSteps[nextIdx] || 0)
      return String(Math.min(balance, parseFloat(next.toFixed(2))))
    })
  }
  const cpReset = () => { setCpStepIndex(-1); setAmount(String(baseAmount || 100)) }

  const daReset = () => {
    setDaCurrentStake(daInitialStake)
    setDaCumulativePnl(0)
    setDaStepCount(0)
    setAmount(String(daInitialStake))
  }

  // Initialize D'Alembert state when enabled
  useEffect(() => {
    if (daEnabled && daCurrentStake === 0) {
      setDaCurrentStake(daInitialStake)
      setAmount(String(daInitialStake))
    }
  }, [daEnabled])
  useEffect(() => { setDaStepCount(0); setDaCumulativePnl(0) }, [daEnabled])
  useEffect(() => { try { localStorage.setItem('autobot_da_cur', String(daCurrentStake)) } catch {} }, [daCurrentStake])
  useEffect(() => { try { localStorage.setItem('autobot_da_pnl', String(daCumulativePnl)) } catch {} }, [daCumulativePnl])
  useEffect(() => { try { localStorage.setItem('autobot_da_step', String(daStepCount)) } catch {} }, [daStepCount])

  const handleTrade = useCallback((direction) => {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) return
    if (amt > balance) return
    const tp = parseFloat(takeProfit) || 0
    const sl = parseFloat(stopLoss) || 0
    if (confirmTrades) {
      if (confirming === direction) {
        setConfirming(null)
        onPlaceTrade(direction, amt, duration, tp, sl)
      } else {
        setConfirming(direction)
      }
    } else {
      onPlaceTrade(direction, amt, duration, tp, sl)
    }
  }, [amount, balance, duration, takeProfit, stopLoss, onPlaceTrade, confirmTrades, confirming])

  const payout = (parseFloat(amount) || 0) * (1 + payoutPercent / 100)

  const adjustAmount = useCallback((delta) => {
    setAmount(prev => String(Math.max(1, Math.min(balance, (parseFloat(prev) || 0) + delta))))
  }, [balance])

  // Quick multipliers: 2x and ÷2
  const doubleAmount = useCallback(() => {
    setAmount(prev => String(Math.min(balance, (parseFloat(prev) || 0) * 2)))
  }, [balance])

  const halveAmount = useCallback(() => {
    setAmount(prev => String(Math.max(1, Math.floor((parseFloat(prev) || 0) / 2))))
  }, [])

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onCall: () => handleTrade('call'),
    onPut: () => handleTrade('put'),
    amount,
    setAmount,
    balance,
    enabled: true,
  })

  const durationMs = duration >= 60 ? `${duration / 60}m` : `${duration}s`

  return (
    <aside className={`trade-panel ${mobileOpen ? 'mobile-open' : ''}`}>
      {/* Header */}
      <div className="trade-panel-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <AssetIcon asset={currentAsset} size={22} style={{ borderRadius: 5, background: (assetColor + '22'), color: assetColor, fontSize: 11 }} />
          <h2 style={{ fontSize: 13 }}>{selectedAsset}</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          <button
            onClick={onToggleSound}
            title={soundMuted ? 'Unmute sounds' : 'Mute sounds'}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: soundMuted ? 'var(--text-muted)' : 'var(--text-secondary)',
              display: 'flex', alignItems: 'center', padding: 2,
            }}
          >
            {soundMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
          <span style={{
            fontSize: 11, fontWeight: 700,
            background: 'rgba(0,200,83,0.12)', color: 'var(--success)',
            padding: '2px 8px', borderRadius: 4,
          }}>{payoutPercent}%</span>
          {onCloseMobile && (
            <button onClick={onCloseMobile} style={{
              background: 'none', border: 'none', color: 'var(--text-muted)',
              cursor: 'pointer', display: 'flex', padding: 2,
            }}>
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Duration */}
      <div style={{ padding: '0 10px' }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 4, marginTop: 6 }}>
          Duration · {durationMs}
        </div>
        <div className="duration-buttons">
          {DURATIONS.map(d => (
            <button
              key={d.value}
              className={`duration-btn ${duration === d.value ? 'active' : ''}`}
              onClick={() => setDuration(d.value)}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Amount with +/- stepper */}
      <div style={{ padding: '0 10px', marginTop: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: 4 }}>
          Investment
        </div>
        <div style={{ display: 'flex', gap: 0, alignItems: 'stretch' }}>
          <button
            onClick={() => adjustAmount(-1)}
            style={{
              width: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--bg-input)', border: '1px solid var(--border-default)',
              borderRadius: '8px 0 0 8px', color: 'var(--text-secondary)', cursor: 'pointer',
            }}
          ><Minus size={14} /></button>
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            style={{
              flex: 1, textAlign: 'center', background: 'var(--bg-input)',
              border: '1px solid var(--border-default)', borderLeft: 'none', borderRight: 'none',
              color: 'var(--text-primary)', fontSize: 15, fontWeight: 700, outline: 'none',
              padding: '8px 0', fontVariantNumeric: 'tabular-nums',
            }}
            min="1" max={balance}
          />
          <button
            onClick={() => adjustAmount(1)}
            style={{
              width: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--bg-input)', border: '1px solid var(--border-default)',
              borderRadius: '0 8px 8px 0', color: 'var(--text-secondary)', cursor: 'pointer',
            }}
          ><Plus size={14} /></button>
        </div>
        <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
          <button onClick={halveAmount} title="Halve amount"
            style={{
              flex: 1, padding: '3px 0', borderRadius: 5, fontSize: 11, fontWeight: 600,
              color: 'var(--text-muted)', background: 'var(--bg-input)',
              border: '1px solid var(--border-default)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}><Divide size={14} /></button>
          <button onClick={doubleAmount} title="Double amount"
            style={{
              flex: 1, padding: '3px 0', borderRadius: 5, fontSize: 11, fontWeight: 600,
              color: 'var(--text-muted)', background: 'var(--bg-input)',
              border: '1px solid var(--border-default)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}><X size={14} /></button>
          {AMOUNT_PRESETS.map(preset => (
            <button key={preset} onClick={() => setAmount(String(preset))} style={{
              flex: 1, padding: '3px 2px', borderRadius: 5, fontSize: 11, fontWeight: 600,
              color: amount === String(preset) ? '#000' : 'var(--text-secondary)',
              background: amount === String(preset) ? 'var(--brand)' : 'var(--bg-input)',
              border: amount === String(preset) ? '1px solid var(--brand)' : '1px solid var(--border-default)',
              cursor: 'pointer',
            }}>${preset}</button>
          ))}
        </div>
      </div>

      {/* Payout */}
      <div style={{ padding: '0 10px', marginTop: 10 }}>
        <div className="payout-display" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Payout</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--success)' }}>
            +${payout.toFixed(2)}
          </span>
        </div>
      </div>

      {/* ── TP / SL ── */}
      <div className={`tp-sub ${showAdvanced ? 'active' : ''}`} style={{ margin: '6px 10px' }}>
        <div className="tp-sub-hdr" onClick={() => setShowAdvanced(prev => !prev)}>
          <span className="tp-sub-hdr-label">TP / SL</span>
          {(takeProfit || stopLoss) && (
            <span className="tp-sub-badge on-success" style={{ fontSize: 11 }}>
              {[takeProfit && 'TP', stopLoss && 'SL'].filter(Boolean).join(' · ')}
            </span>
          )}
          {showAdvanced ? <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />}
        </div>
        {showAdvanced && (
          <div className="tp-sub-body">
            {/* Current price reference */}
            {currentAsset && (
              <div style={{
                fontSize: 11, color: 'var(--text-secondary)', textAlign: 'center', marginTop: 2,
                fontVariantNumeric: 'tabular-nums',
              }}>
                Current: <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                  {currentAsset.price.toFixed(5)}
                </span>
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--success)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                  Take Profit
                  {parseFloat(takeProfit) > 0 && <Check size={10} style={{ opacity: 0.7 }} />}
                </div>
                <input type="number" value={takeProfit} onChange={e => setTakeProfit(e.target.value)}
                  placeholder="Price level"
                  style={{
                    width: '100%', padding: '6px 8px', borderRadius: 5, fontSize: 12, fontWeight: 600,
                    background: 'var(--bg-input)', border: parseFloat(takeProfit) > 0 ? '1px solid var(--success)' : '1px solid var(--border-default)',
                    color: 'var(--success)', outline: 'none', fontVariantNumeric: 'tabular-nums',
                  }} />
                {/* Quick-set TP pct buttons */}
                {currentAsset && (
                  <div style={{ display: 'flex', gap: 3, marginTop: 3 }}>
                    {[1, 2, 5].map(pct => {
                      const tpPrice = (currentAsset.price * (1 + pct / 100)).toFixed(5)
                      return (
                        <button key={pct} onClick={() => setTakeProfit(tpPrice)} style={{
                          flex: 1, padding: '2px 0', borderRadius: 4, fontSize: 11, fontWeight: 600,
                          background: takeProfit === tpPrice ? 'var(--success)' : 'var(--bg-input)',
                          border: '1px solid var(--border-default)',
                          color: takeProfit === tpPrice ? '#000' : 'var(--text-muted)',
                          cursor: 'pointer',
                        }}>+{pct}%</button>
                      )
                    })}
                  </div>
                )}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--danger)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                  Stop Loss
                  {parseFloat(stopLoss) > 0 && <Check size={10} style={{ opacity: 0.7 }} />}
                </div>
                <input type="number" value={stopLoss} onChange={e => setStopLoss(e.target.value)}
                  placeholder="Price level"
                  style={{
                    width: '100%', padding: '6px 8px', borderRadius: 5, fontSize: 12, fontWeight: 600,
                    background: 'var(--bg-input)', border: parseFloat(stopLoss) > 0 ? '1px solid var(--danger)' : '1px solid var(--border-default)',
                    color: 'var(--danger)', outline: 'none', fontVariantNumeric: 'tabular-nums',
                  }} />
                {/* Quick-set SL pct buttons */}
                {currentAsset && (
                  <div style={{ display: 'flex', gap: 3, marginTop: 3 }}>
                    {[1, 2, 5].map(pct => {
                      const slPrice = (currentAsset.price * (1 - pct / 100)).toFixed(5)
                      return (
                        <button key={pct} onClick={() => setStopLoss(slPrice)} style={{
                          flex: 1, padding: '2px 0', borderRadius: 4, fontSize: 11, fontWeight: 600,
                          background: stopLoss === slPrice ? 'var(--danger)' : 'var(--bg-input)',
                          border: '1px solid var(--border-default)',
                          color: stopLoss === slPrice ? '#fff' : 'var(--text-muted)',
                          cursor: 'pointer',
                        }}>-{pct}%</button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
            {/* Hint text */}
            {(parseFloat(takeProfit) > 0 || parseFloat(stopLoss) > 0) && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, textAlign: 'center' }}>
                TP/SL trigger on next price tick · positions auto-close
              </div>
            )}
            {/* ── Martingale (Loss Recovery) ── */}
            <div className={`tp-sub ${mgEnabled ? 'active' : ''}`}>
              <div className="tp-sub-hdr" onClick={() => persistMg(!mgEnabled)}>
                <span className="tp-sub-hdr-label">Martingale</span>
                <button className={`tp-sub-badge ${mgEnabled ? 'on-danger' : 'off'}`}
                  onClick={e => { e.stopPropagation(); persistMg(!mgEnabled) }}>
                  {mgEnabled ? 'ON' : 'OFF'}
                </button>
                {showAdvanced ? <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />}
              </div>
              {mgEnabled && (
                <div className="tp-sub-body">
                  <div className="tp-sub-seg">
                    <button className={mgIsAuto ? 'on' : ''} onClick={() => persistMgAuto(true)}>Auto</button>
                    <button className={!mgIsAuto ? 'on' : ''} onClick={() => persistMgAuto(false)}>Manual</button>
                  </div>
                  {mgIsAuto ? (
                    <div className="tp-sub-field">
                      <label>×</label>
                      <input type="number" className="tp-sub-input" style={{ width: 56 }} value={mgMultiplier} min="1.1" max="10" step="0.1" onChange={e => persistMgMult(parseFloat(e.target.value) || 2)} />
                      <label>Max</label>
                      <input type="number" className="tp-sub-input" style={{ width: 44 }} value={mgMaxSteps} min="1" max="20" onChange={e => persistMgMaxSteps(parseInt(e.target.value) || 8)} />
                      <label>steps</label>
                    </div>
                  ) : (
                    <>
                      <div className="tp-sub-steps">
                        {mgSteps.map((step, idx) => (
                          <div key={idx} className={`tp-sub-chip ${mgStepIndex === idx ? 'active' : ''}`}>
                            <button className="chip-step" style={{ background: mgStepsOn[idx] ? 'var(--pit-red)' : undefined, borderColor: mgStepsOn[idx] ? 'var(--pit-red)' : undefined }}
                              onClick={() => { const n = [...mgStepsOn]; n[idx] = !n[idx]; persistMgStepsOn(n) }}
                            >{mgStepsOn[idx] ? <Check size={10} color="#fff" /> : null}</button>
                            <input type="number" className="tp-sub-input" style={{ width: 40, border: 'none', background: 'transparent', color: mgStepIndex === idx ? 'var(--pit-red)' : 'var(--pit-text-primary)', opacity: mgStepsOn[idx] ? 1 : 0.3 }} value={step} min="1" onChange={e => { const n = [...mgSteps]; n[idx] = parseFloat(e.target.value) || 1; persistMgSteps(n) }} />
                            {mgSteps.length > 1 && <button onClick={() => { persistMgSteps(mgSteps.filter((_, i) => i !== idx)); persistMgStepsOn(mgStepsOn.filter((_, i) => i !== idx)) }} style={{ background: 'none', border: 'none', color: 'var(--pit-text-muted)', cursor: 'pointer', padding: 0 }}><X size={11} /></button>}
                          </div>
                        ))}
                        {mgSteps.length < 12 && <button onClick={() => { persistMgSteps([...mgSteps, (mgSteps[mgSteps.length - 1] || 10) * 2]); persistMgStepsOn([...mgStepsOn, true]) }} style={{ padding: '3px 8px', borderRadius: 5, background: 'var(--pit-surface-input)', border: '1px dashed var(--pit-border)', color: 'var(--pit-text-muted)', cursor: 'pointer', fontSize: 11 }}><Plus size={12} /></button>}
                      </div>
                      <div className="tp-sub-actions">
                        <button onClick={mgAdvance}>Advance after loss</button>
                        <button onClick={mgReset}>Reset</button>
                      </div>
                    </>
                  )}
                  <div className="tp-sub-hint">
                    {mgStepIndex === -1 ? `Base: $${baseAmount || 100} · waiting for loss`
                      : mgIsAuto ? `Loss ${mgStepIndex + 1}/${mgMaxSteps} · Next: $${((parseFloat(amount) || baseAmount) * mgMultiplier).toFixed(2)}`
                      : `Loss ${mgStepIndex + 1}/${mgSteps.length} · Current: $${mgSteps[mgStepIndex]}`}
                  </div>
                </div>
              )}
            </div>

            {/* ── D'Alembert (Unit Step Strategy) ── */}
            <div className={`tp-sub ${daEnabled ? 'active' : ''}`}>
              <div className="tp-sub-hdr" onClick={() => persistDa(!daEnabled)}>
                <span className="tp-sub-hdr-label">D'Alembert</span>
                <button className={`tp-sub-badge ${daEnabled ? 'on-danger' : 'off'}`}
                  onClick={e => { e.stopPropagation(); persistDa(!daEnabled) }}>
                  {daEnabled ? 'ON' : 'OFF'}
                </button>
                {showAdvanced ? <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />}
              </div>
              {daEnabled && (
                <div className="tp-sub-body">
                  <div className="tp-sub-seg">
                    <button className={daIsAuto ? 'on' : ''} onClick={() => persistDaAuto(true)}>Auto</button>
                    <button className={!daIsAuto ? 'on' : ''} onClick={() => persistDaAuto(false)}>Manual</button>
                  </div>
                  <div className="tp-sub-field" style={{ flexWrap: 'wrap', gap: 4 }}>
                    <label>Unit</label>
                    <input type="number" className="tp-sub-input" style={{ width: 56 }} value={daUnit} min="1" max="1000" step="1" onChange={e => persistDaUnit(parseFloat(e.target.value) || 5)} />
                    <label>Init</label>
                    <input type="number" className="tp-sub-input" style={{ width: 56 }} value={daInitialStake} min="1" max="10000" step="1" onChange={e => persistDaInitial(parseFloat(e.target.value) || 10)} />
                    <label>TP</label>
                    <input type="number" className="tp-sub-input" style={{ width: 56 }} value={daTakeProfit} min="0" max="100000" step="10" onChange={e => persistDaTP(parseFloat(e.target.value) || 100)} />
                    <label>SL</label>
                    <input type="number" className="tp-sub-input" style={{ width: 56 }} value={daStopLoss} min="0" max="100000" step="10" onChange={e => persistDaSL(parseFloat(e.target.value) || 100)} />
                  </div>
                  <div className="tp-sub-field" style={{ flexWrap: 'wrap', gap: 4 }}>
                    <label>Max stake</label>
                    <input type="number" className="tp-sub-input" style={{ width: 56 }} value={daMaxStake || ''} min="0" max="100000" step="10" placeholder="Off" onChange={e => persistDaMax(parseFloat(e.target.value) || 0)} />
                    <label>Max contracts</label>
                    <input type="number" className="tp-sub-input" style={{ width: 44 }} value={daMaxContracts || ''} min="0" max="100" step="1" placeholder="Off" onChange={e => persistDaMaxC(parseInt(e.target.value) || 0)} />
                    <button onClick={daReset} style={{ padding: '4px 10px', borderRadius: 5, background: 'var(--bg-input)', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 11, marginLeft: 'auto' }}>Reset</button>
                  </div>
                  <div className="tp-sub-hint">
                    {daIsAuto
                      ? `Stake: $${(daCurrentStake || daInitialStake).toFixed(2)} · ${daStepCount} trades · P&L: ${daCumulativePnl >= 0 ? '+' : ''}$${daCumulativePnl.toFixed(2)}`
                      : `Unit: $${daUnit.toFixed(2)} · Init: $${daInitialStake.toFixed(2)} · Stake: $${(daCurrentStake || daInitialStake).toFixed(2)}`}
                  </div>
                </div>
              )}
            </div>

            {/* ── Compounding (Profit Reinvestment) ── */}
            <div className={`tp-sub ${cpEnabled ? 'active' : ''}`}>
              <div className="tp-sub-hdr" onClick={() => persistCp(!cpEnabled)}>
                <span className="tp-sub-hdr-label">Compounding</span>
                <button className={`tp-sub-badge ${cpEnabled ? 'on-success' : 'off'}`}
                  onClick={e => { e.stopPropagation(); persistCp(!cpEnabled) }}>
                  {cpEnabled ? 'ON' : 'OFF'}
                </button>
                {showAdvanced ? <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />}
              </div>
              {cpEnabled && (
                <div className="tp-sub-body">
                  <div className="tp-sub-seg">
                    <button className={cpIsAuto ? 'on' : ''} onClick={() => persistCpAuto(true)}>Auto</button>
                    <button className={!cpIsAuto ? 'on' : ''} onClick={() => persistCpAuto(false)}>Manual</button>
                  </div>
                  {cpIsAuto ? (
                    <div className="tp-sub-field">
                      <label>+</label>
                      <input type="number" className="tp-sub-input" style={{ width: 56 }} value={cpCompoundPct} min="5" max="200" step="5" onChange={e => persistCpPct(parseInt(e.target.value) || 50)} />
                      <label>% profit</label>
                      <label>Max</label>
                      <input type="number" className="tp-sub-input" style={{ width: 44 }} value={cpMaxSteps} min="1" max="20" onChange={e => persistCpMaxSteps(parseInt(e.target.value) || 5)} />
                      <label>steps</label>
                    </div>
                  ) : (
                    <>
                      <div className="tp-sub-steps">
                        {cpSteps.map((step, idx) => (
                          <div key={idx} className={`tp-sub-chip ${cpStepIndex === idx ? 'active' : ''}`}>
                            <button className="chip-step" style={{ background: cpStepsOn[idx] ? 'var(--pit-green)' : undefined, borderColor: cpStepsOn[idx] ? 'var(--pit-green)' : undefined }}
                              onClick={() => { const n = [...cpStepsOn]; n[idx] = !n[idx]; persistCpStepsOn(n) }}
                            >{cpStepsOn[idx] ? <Check size={10} color="#000" /> : null}</button>
                            <input type="number" className="tp-sub-input" style={{ width: 40, border: 'none', background: 'transparent', color: cpStepIndex === idx ? 'var(--pit-green)' : 'var(--pit-text-primary)', opacity: cpStepsOn[idx] ? 1 : 0.3 }} value={step} min="1" onChange={e => { const n = [...cpSteps]; n[idx] = parseFloat(e.target.value) || 1; persistCpSteps(n) }} />
                            {cpSteps.length > 1 && <button onClick={() => { persistCpSteps(cpSteps.filter((_, i) => i !== idx)); persistCpStepsOn(cpStepsOn.filter((_, i) => i !== idx)) }} style={{ background: 'none', border: 'none', color: 'var(--pit-text-muted)', cursor: 'pointer', padding: 0 }}><X size={11} /></button>}
                          </div>
                        ))}
                        {cpSteps.length < 12 && <button onClick={() => { persistCpSteps([...cpSteps, (cpSteps[cpSteps.length - 1] || 10) * 2]); persistCpStepsOn([...cpStepsOn, true]) }} style={{ padding: '3px 8px', borderRadius: 5, background: 'var(--pit-surface-input)', border: '1px dashed var(--pit-border)', color: 'var(--pit-text-muted)', cursor: 'pointer', fontSize: 11 }}><Plus size={12} /></button>}
                      </div>
                      <div className="tp-sub-actions">
                        <button onClick={cpAdvance}>Add after win</button>
                        <button onClick={cpReset}>Reset</button>
                      </div>
                    </>
                  )}
                  <div className="tp-sub-hint">
                    {cpStepIndex === -1 ? `Base: $${baseAmount || 100} · waiting for win`
                      : cpIsAuto ? `Win ${cpStepIndex + 1}/${cpMaxSteps} · Reinvesting ${cpCompoundPct}% of profit`
                      : `Win ${cpStepIndex + 1}/${cpSteps.length} · Adding $${cpSteps[cpStepIndex]} to stake`}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Risk Management ── */}
      <div className={`tp-sub ${showRisk ? 'active' : ''}`} style={{ margin: '6px 10px' }}>
        <div className="tp-sub-hdr" onClick={() => setShowRisk(prev => !prev)}>
          <span className="tp-sub-hdr-label">Risk Management</span>
          <button className={`tp-sub-badge ${dailyLossLimit > 0 || maxPositionPct > 0 || maxDailyTrades > 0 ? 'on-danger' : 'off'}`}>
            {dailyLossLimit > 0 || maxPositionPct > 0 || maxDailyTrades > 0 ? 'ON' : 'OFF'}
          </button>
          {showRisk ? <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />}
        </div>

        {showRisk && (
          <div className="tp-sub-body">
            {/* Status row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)' }}>
              <span>Today: {dailyTradeCount} trades</span>
              <span style={{ color: dailyPnl >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                {dailyPnl >= 0 ? '+' : ''}${dailyPnl.toFixed(2)}
              </span>
            </div>

            {/* Daily loss limit */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>Daily loss limit</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>$</span>
                <input type="number" value={dailyLossLimit} min="0" step="100" onChange={e => onSetDailyLossLimit?.(parseInt(e.target.value) || 0)}
                  style={{ width: 60, padding: '4px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                    background: 'var(--bg-input)', border: dailyLossLimit > 0 ? '1px solid var(--danger)' : '1px solid var(--border-default)',
                    color: dailyLossLimit > 0 ? 'var(--danger)' : 'var(--text-primary)', outline: 'none', textAlign: 'center' }} />
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{dailyLossLimit === 0 ? 'off' : 'on'}</span>
              </div>
            </div>

            {/* Max position % of balance */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>Max position %</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="number" value={maxPositionPct} min="0" max="100" step="5" onChange={e => onSetMaxPositionPct?.(parseInt(e.target.value) || 0)}
                  style={{ width: 50, padding: '4px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                    background: 'var(--bg-input)', border: maxPositionPct > 0 ? '1px solid var(--brand)' : '1px solid var(--border-default)',
                    color: maxPositionPct > 0 ? 'var(--brand)' : 'var(--text-primary)', outline: 'none', textAlign: 'center' }} />
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>%</span>
                {maxPositionPct > 0 && (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· max ${(balance * maxPositionPct / 100).toFixed(0)}</span>
                )}
              </div>
            </div>

            {/* Max daily trades */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>Max daily trades</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="number" value={maxDailyTrades} min="0" max="500" step="5" onChange={e => onSetMaxDailyTrades?.(parseInt(e.target.value) || 0)}
                  style={{ width: 50, padding: '4px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                    background: 'var(--bg-input)', border: maxDailyTrades > 0 ? '1px solid var(--brand)' : '1px solid var(--border-default)',
                    color: maxDailyTrades > 0 ? 'var(--brand)' : 'var(--text-primary)', outline: 'none', textAlign: 'center' }} />
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{maxDailyTrades === 0 ? 'off' : `/${maxDailyTrades}`}</span>
              </div>
            </div>

            {/* Min payout % */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>Min payout %</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="number" value={minPayoutPct} min="0" max="100" step="1" onChange={e => onSetMinPayoutPct?.(parseInt(e.target.value) || 0)}
                  style={{ width: 50, padding: '4px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                    background: 'var(--bg-input)', border: minPayoutPct > 0 ? '1px solid var(--success)' : '1px solid var(--border-default)',
                    color: minPayoutPct > 0 ? 'var(--success)' : 'var(--text-primary)', outline: 'none', textAlign: 'center' }} />
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>%</span>
                {minPayoutPct > 0 && (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· reject below</span>
                )}
              </div>
            </div>

            {/* News event blocker */}
            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>News event blocker</span>
                <button onClick={() => onSetNewsBlockEnabled?.(!newsBlockEnabled)} style={{
                  padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                  background: newsBlockEnabled ? 'var(--danger)' : 'var(--bg-input)',
                  border: '1px solid var(--border-default)',
                  color: newsBlockEnabled ? '#fff' : 'var(--text-muted)',
                  cursor: 'pointer',
                }}>{newsBlockEnabled ? 'ON' : 'OFF'}</button>
              </div>
              {newsBlockEnabled && (
                <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                  {[
                    { key: 'high', label: 'High', color: 'var(--danger)' },
                    { key: 'medium', label: 'Med', color: '#ffc107' },
                    { key: 'low', label: 'Low', color: 'var(--text-muted)' },
                  ].map(({ key, label, color }) => (
                    <button key={key} onClick={() => onSetNewsBlockLevels?.({ ...newsBlockLevels, [key]: !newsBlockLevels[key] })} style={{
                      flex: 1, padding: '3px 0', borderRadius: 4, fontSize: 11, fontWeight: 600,
                      background: newsBlockLevels[key] ? color : 'var(--bg-input)',
                      border: newsBlockLevels[key] ? `1px solid ${color}` : '1px solid var(--border-default)',
                      color: newsBlockLevels[key] ? '#000' : 'var(--text-muted)',
                      cursor: 'pointer',
                    }}>{label}</button>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 8, color: 'var(--text-muted)', marginTop: 3, textAlign: 'center' }}>
                Blocks trades during active economic events · calendar integration pending
              </div>
            </div>

            <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
              Set to 0 to disable · resets daily
            </div>
          </div>
        )}
      </div>

      {/* ── Entry Orders ── */}
      <div className={`tp-sub ${showEntryOrder ? 'active' : ''}`} style={{ margin: '6px 10px' }}>
        <div className="tp-sub-hdr" onClick={() => setShowEntryOrder(prev => !prev)}>
          <span className="tp-sub-hdr-label">Entry Orders</span>
          {pendingOrders.length > 0 && (
            <span className="tp-sub-badge on-success" style={{ fontSize: 11 }}>{pendingOrders.length} active</span>
          )}
          {showEntryOrder ? <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />}
        </div>

        {showEntryOrder && (
          <div className="tp-sub-body">
            {/* Toggle order form */}
            <button onClick={() => setShowOrderForm(prev => !prev)} style={{
              padding: '6px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
              background: showOrderForm ? 'var(--bg-elevated)' : 'var(--bg-input)',
              border: '1px solid var(--border-default)',
              color: showOrderForm ? 'var(--brand)' : 'var(--text-secondary)',
              cursor: 'pointer', textAlign: 'center',
            }}>
              {showOrderForm ? 'Cancel' : '+ New Entry Order'}
            </button>

            {/* Order form */}
            {showOrderForm && (
              <div style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {/* Direction toggle */}
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => setOrderDirection('call')} style={{
                    flex: 1, padding: '6px 0', borderRadius: 5, fontSize: 11, fontWeight: 700,
                    background: orderDirection === 'call' ? 'var(--success)' : 'var(--bg-input)',
                    border: orderDirection === 'call' ? '1px solid var(--success)' : '1px solid var(--border-default)',
                    color: orderDirection === 'call' ? '#000' : 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}>CALL</button>
                  <button onClick={() => setOrderDirection('put')} style={{
                    flex: 1, padding: '6px 0', borderRadius: 5, fontSize: 11, fontWeight: 700,
                    background: orderDirection === 'put' ? 'var(--danger)' : 'var(--bg-input)',
                    border: orderDirection === 'put' ? '1px solid var(--danger)' : '1px solid var(--border-default)',
                    color: orderDirection === 'put' ? '#fff' : 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}>PUT</button>
                </div>

                {/* Entry price */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 2 }}>
                    Entry Price · Current: {currentAsset?.price?.toFixed(5) || '—'}
                  </div>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <input type="number" value={orderEntryPrice} onChange={e => setOrderEntryPrice(e.target.value)}
                      placeholder="Trigger price"
                      style={{
                        flex: 1, padding: '6px 8px', borderRadius: 5, fontSize: 12, fontWeight: 600,
                        background: 'var(--bg-input)', border: '1px solid var(--border-default)',
                        color: orderDirection === 'call' ? 'var(--success)' : 'var(--danger)',
                        outline: 'none', fontVariantNumeric: 'tabular-nums',
                      }} />
                    {currentAsset && (
                      <button onClick={() => {
                        const p = currentAsset.price
                        setOrderEntryPrice((orderDirection === 'call' ? p * 1.002 : p * 0.998).toFixed(5))
                      }} style={{
                        padding: '6px 10px', borderRadius: 5, fontSize: 11, fontWeight: 600,
                        background: 'var(--bg-input)', border: '1px solid var(--border-default)',
                        color: 'var(--brand)', cursor: 'pointer', whiteSpace: 'nowrap',
                      }}>±0.2%</button>
                    )}
                  </div>
                </div>

                {/* Amount + Duration */}
                <div style={{ display: 'flex', gap: 6 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Amount</div>
                    <input type="number" value={orderAmount} onChange={e => setOrderAmount(e.target.value)} min="1"
                      style={{ width: '100%', padding: '6px 6px', borderRadius: 5, fontSize: 12, fontWeight: 600,
                        background: 'var(--bg-input)', border: '1px solid var(--border-default)',
                        color: 'var(--text-primary)', outline: 'none', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Duration (s)</div>
                    <input type="number" value={orderDuration} onChange={e => setOrderDuration(parseInt(e.target.value) || 60)} min="30"
                      style={{ width: '100%', padding: '6px 6px', borderRadius: 5, fontSize: 12, fontWeight: 600,
                        background: 'var(--bg-input)', border: '1px solid var(--border-default)',
                        color: 'var(--text-primary)', outline: 'none', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }} />
                  </div>
                </div>

                {/* Optional TP/SL */}
                <div style={{ display: 'flex', gap: 6 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>TP (optional)</div>
                    <input type="number" value={orderTP} onChange={e => setOrderTP(e.target.value)} placeholder="Take profit"
                      style={{ width: '100%', padding: '5px 6px', borderRadius: 5, fontSize: 11, fontWeight: 600,
                        background: 'var(--bg-input)', border: '1px solid var(--border-default)',
                        color: 'var(--success)', outline: 'none', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>SL (optional)</div>
                    <input type="number" value={orderSL} onChange={e => setOrderSL(e.target.value)} placeholder="Stop loss"
                      style={{ width: '100%', padding: '5px 6px', borderRadius: 5, fontSize: 11, fontWeight: 600,
                        background: 'var(--bg-input)', border: '1px solid var(--border-default)',
                        color: 'var(--danger)', outline: 'none', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }} />
                  </div>
                </div>

                {/* Place order button */}
                <button onClick={() => {
                  const result = onPlacePendingOrder?.({
                    asset: selectedAsset,
                    direction: orderDirection,
                    amount: orderAmount,
                    duration: orderDuration,
                    entryPrice: orderEntryPrice,
                    tp: orderTP,
                    sl: orderSL,
                    payoutPercent,
                  })
                  if (result !== false) {
                    setShowOrderForm(false)
                    setOrderEntryPrice('')
                    setOrderTP('')
                    setOrderSL('')
                  }
                }} disabled={!orderEntryPrice || parseFloat(orderAmount) <= 0} style={{
                  width: '100%', padding: '8px 0', borderRadius: 6, fontSize: 12, fontWeight: 700,
                  background: (!orderEntryPrice || parseFloat(orderAmount) <= 0) ? 'var(--bg-input)' : 'var(--brand)',
                  border: '1px solid var(--border-default)',
                  color: (!orderEntryPrice || parseFloat(orderAmount) <= 0) ? 'var(--text-muted)' : '#000',
                  cursor: (!orderEntryPrice || parseFloat(orderAmount) <= 0) ? 'not-allowed' : 'pointer',
                  opacity: (!orderEntryPrice || parseFloat(orderAmount) <= 0) ? 0.5 : 1,
                }}>
                  Place {orderDirection.toUpperCase()} Order @ {orderEntryPrice ? parseFloat(orderEntryPrice).toFixed(5) : '…'}
                </button>
              </div>
            )}

            {/* Pending orders list */}
            {pendingOrders.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {pendingOrders.map(order => (
                  <div key={order.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '6px 8px', borderRadius: 6, background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)', fontSize: 11,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '1px 4px', borderRadius: 3,
                        background: order.direction === 'call' ? 'rgba(0,200,83,0.12)' : 'rgba(255,23,68,0.12)',
                        color: order.direction === 'call' ? 'var(--success)' : 'var(--danger)',
                      }}>{order.direction.toUpperCase()}</span>
                      <span style={{ fontWeight: 600 }}>{order.asset}</span>
                      <span style={{ color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>@ {order.entryPrice.toFixed(5)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 600 }}>${order.amount}</span>
                      <button onClick={() => onCancelPendingOrder?.(order.id)} style={{
                        background: 'none', border: 'none', color: 'var(--text-muted)',
                        cursor: 'pointer', padding: 0, display: 'flex',
                      }}><X size={12} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Hint */}
            {pendingOrders.length === 0 && !showOrderForm && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>No pending orders</div>
            )}
          </div>
        )}
      </div>

      {/* CALL / PUT */}
      <div style={{ padding: '0 10px', marginTop: 10 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => handleTrade('call')}
            style={{
              flex: 1, padding: '14px 0', borderRadius: 10, border: 'none',
              background: confirming === 'call' ? 'var(--brand)' : 'var(--success)',
              color: '#000', cursor: 'pointer', fontSize: 14, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'all 0.15s', letterSpacing: 0.3,
              animation: confirming === 'call' ? 'pulse-brand 0.6s ease-in-out infinite' : undefined,
            }}
          >
            <ChevronUp size={20} strokeWidth={2.5} />
            {confirming === 'call' ? 'Confirm' : 'CALL'}
            {!confirmTrades && <CornerDownLeft size={12} style={{ opacity: 0.5 }} />}
          </button>
          <button
            onClick={() => handleTrade('put')}
            style={{
              flex: 1, padding: '14px 0', borderRadius: 10, border: 'none',
              background: confirming === 'put' ? 'var(--brand)' : 'var(--danger)',
              color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: 'all 0.15s', letterSpacing: 0.3,
              animation: confirming === 'put' ? 'pulse-brand 0.6s ease-in-out infinite' : undefined,
            }}
          >
            <ChevronDown size={20} strokeWidth={2.5} />
            {confirming === 'put' ? 'Confirm' : 'PUT'}
            {!confirmTrades && <CornerDownLeft size={12} style={{ opacity: 0.5 }} />}
          </button>
        </div>
        {confirmTrades && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 6 }}>
            {confirming ? 'Click again to confirm or press Esc' : 'Confirmation required — click to arm'}
          </div>
        )}
      </div>

      {/* Open Positions */}
      <div className="positions-panel" style={{ padding: '0 10px', marginTop: 12 }}>
        <div className="tp-section-header" style={{ paddingLeft: 0 }}>Open positions<span style={{ marginLeft: 'auto', fontWeight: 400, color: 'var(--text-muted)' }}>{openPositions.length}</span></div>

        {openPositions.map(pos => (
          <PositionCard
            key={pos.id}
            pos={pos}
            assets={assets}
            onClose={onClosePosition}
            onDoubleUp={onDoubleUp}
            onExtend={onExtendPosition}
            onSetNote={onSetPositionNote}
            expanded={expandedPos === pos.id}
            onToggle={() => setExpandedPos(prev => prev === pos.id ? null : pos.id)}
          />
        ))}

        {openPositions.length === 0 && (
          <div style={{ padding: 16, textAlign: 'center', fontSize: 11, color: 'var(--text-muted)' }}>No open positions</div>
        )}

        {/* Closed results */}
        {closedPositions.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '10px 0 6px' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Recent results</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{closedPositions.length}</span>
            </div>
            {closedPositions.slice(0, 10).map(pos => (
              <div key={pos.id}>
                <div onClick={() => setExpandedPos(prev => prev === pos.id + '-h' ? null : pos.id + '-h')} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px 10px', borderRadius: 6, marginBottom: 2,
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', fontSize: 11,
                  cursor: 'pointer',
                }}>
                  <span style={{ fontWeight: 600, fontSize: 12 }}>{pos.asset}</span>
                  {pos.note && <span style={{ fontSize: 11, color: 'var(--brand)', opacity: 0.7 }}>N</span>}
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                    background: pos.direction === 'call' ? 'rgba(0,200,83,0.12)' : 'rgba(255,23,68,0.12)',
                    color: pos.direction === 'call' ? 'var(--success)' : 'var(--danger)',
                  }}>{pos.direction.toUpperCase()}</span>
                  <span style={{ fontWeight: 700, color: pos.status === 'win' ? 'var(--success)' : 'var(--danger)' }}>
                    {pos.status === 'win' ? '+$' : '-$'}{Math.abs(pos.pnl || pos.amount).toFixed(2)}
                  </span>
                  <span style={{
                    color: 'var(--text-muted)', opacity: 0.4, transition: 'transform 0.15s',
                    transform: expandedPos === pos.id + '-h' ? 'rotate(90deg)' : 'rotate(0deg)',
                    display: 'flex',
                  }}><ChevronRight size={12} /></span>
                </div>
                {expandedPos === pos.id + '-h' && (
                  <div style={{
                    marginBottom: 2, padding: '6px 10px', borderRadius: 6,
                    background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                    fontSize: 11, display: 'flex', flexDirection: 'column', gap: 3,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Entry</span>
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{pos.entryPrice?.toFixed(5) || '—'}</span>
                    </div>
                    {pos.exitPrice && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Exit</span>
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{pos.exitPrice.toFixed(5)}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Duration</span>
                      <span>{pos.duration}s</span>
                    </div>
                    <input type="text" value={pos.note || ''} onChange={e => onSetPositionNote?.(pos.id, e.target.value)}
                      placeholder="Add note…" onClick={e => e.stopPropagation()}
                      style={{
                        width: '100%', padding: '3px 6px', borderRadius: 4, fontSize: 11,
                        background: 'var(--bg-input)', border: pos.note ? '1px solid var(--brand)' : '1px solid var(--border-default)',
                        color: pos.note ? 'var(--text-primary)' : 'var(--text-muted)',
                        outline: 'none', fontStyle: pos.note ? 'normal' : 'italic',
                      }} />
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </div>

      {/* Account bar */}
      <div className="account-bar">
        <div>
          <div className="account-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            Balance
            {onResetAccount && (
              <button
                onClick={() => setShowResetModal(true)}
                title="Reset demo account"
                style={{
                  background: 'none', border: '1px solid var(--border-default)', borderRadius: 3,
                  color: 'var(--text-muted)', cursor: 'pointer', fontSize: 8, fontWeight: 700,
                  padding: '1px 4px', opacity: 0.5,
                }}
              >RESET</button>
            )}
          </div>
          <div className="account-balance">${balance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div className="account-label">Today</div>
          <div className="account-balance" style={{ color: dailyPnl >= 0 ? 'var(--success)' : 'var(--danger)', fontSize: 13 }}>
            {dailyPnl >= 0 ? '+' : ''}${dailyPnl.toFixed(2)}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="account-label">Total P&L</div>
          <div className="account-balance" style={{ color: balance >= 10000 ? 'var(--success)' : 'var(--danger)' }}>
            {balance >= 10000 ? '+' : ''}${(balance - 10000).toFixed(2)}
          </div>
        </div>
      </div>

      <ConfirmModal
        open={showResetModal}
        title="Reset demo account?"
        message="This closes all open positions and resets your balance to $10,000. Trade history is preserved."
        confirmLabel="Reset"
        danger
        onConfirm={() => { onResetAccount(); setShowResetModal(false) }}
        onCancel={() => setShowResetModal(false)}
      />
    </aside>
  )
}
