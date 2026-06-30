import { useState, useMemo, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { TrendingUp, TrendingDown, BarChart3, CandlestickChart, Wifi, WifiOff, Settings, X, Shuffle, Zap, ArrowLeftRight, Square, Columns2, Grid2X2, Play, Pause, StopCircle } from 'lucide-react'
import { TIMEFRAMES, TF_MAP, getAssetColor, computeEMA, computeBollingerBands, computeSMA, computeRSI, computeMACD, computeVolumeProfile, computeVWAP, generateCandleHistory, generateOrderBook } from '../data/mockData'
import { CanvasChart } from './CanvasChart'
import AssetIcon from './AssetIcon'
import SettingsModal from './SettingsModal'

// ── Chart prefs persistence ──
const CHART_PREFS_KEY = 'autobot_chart_prefs'
function loadChartPrefs() {
  try { return JSON.parse(localStorage.getItem(CHART_PREFS_KEY)) || {} } catch { return {} }
}
function saveChartPrefs(patch) {
  try {
    const cur = loadChartPrefs()
    localStorage.setItem(CHART_PREFS_KEY, JSON.stringify({ ...cur, ...patch }))
  } catch { /* noop */ }
}

export default function ChartArea({ selectedAsset, assets, tabs = [], activeTabId, onSelectTab, chartLayout = 'single', onSetChartLayout, timeframe, onTimeframeChange, priceHistory, candleHistory, connected, isLive = false, chartResetKey = 0, toastDuration, onToastDurationChange, confirmTrades, onToggleConfirmTrades, positions = [], alerts = [], onAddAlert, onRemoveAlert, priceMode = 'random', trendDir = 'up', onSetPriceMode, onSetTrendDir, isReplaying = false, replaySpeed = 5, replayProgress = 0, onStartReplay, onStopReplay, onToggleReplayPause, onSetReplaySpeed, pushEnabled = false, pushPermission = 'default', onTogglePush }) {
  const { t } = useTranslation()
  const prefs = useRef(loadChartPrefs())
  const [chartType, setChartType] = useState(() => prefs.current.chartType || 'candlestick')
  const [showIndicators, setShowIndicators] = useState(() => prefs.current.showIndicators || false)
  const [showSMA, setShowSMA] = useState(() => prefs.current.showSMA || false)
  const [showRSI, setShowRSI] = useState(() => prefs.current.showRSI || false)
  const [showMACD, setShowMACD] = useState(() => prefs.current.showMACD || false)
  const [smaPeriod, setSmaPeriod] = useState(() => prefs.current.smaPeriod || 20)
  const [rsiPeriod, setRsiPeriod] = useState(() => prefs.current.rsiPeriod || 14)
  const [macdFast, setMacdFast] = useState(() => prefs.current.macdFast || 12)
  const [macdSlow, setMacdSlow] = useState(() => prefs.current.macdSlow || 26)
  const [macdSignal, setMacdSignal] = useState(() => prefs.current.macdSignal || 9)
  const [drawingMode, setDrawingMode] = useState('off')
  const [showVolumeProfile, setShowVolumeProfile] = useState(() => prefs.current.showVolumeProfile || false)
  const [vpBins, setVpBins] = useState(() => prefs.current.vpBins || 30)
  const [showVWAP, setShowVWAP] = useState(() => prefs.current.showVWAP || false)
  const [showMTF, setShowMTF] = useState(() => prefs.current.showMTF || false)
  const [mtfTimeframe, setMtfTimeframe] = useState(() => prefs.current.mtfTimeframe || '5m')
  const [showOrderBook, setShowOrderBook] = useState(() => prefs.current.showOrderBook || false)
  const [showModal, setShowModal] = useState(false)
  const [customIndicators, setCustomIndicators] = useState(() => {
    try { return JSON.parse(localStorage.getItem('autobot_custom_inds') || '[]') } catch { return [] }
  })
  const [now, setNow] = useState(Date.now())

  // ── Persist chart preferences on change ──
  useEffect(() => { saveChartPrefs({ chartType }) }, [chartType])
  useEffect(() => { saveChartPrefs({ showIndicators }) }, [showIndicators])
  useEffect(() => { saveChartPrefs({ showSMA }) }, [showSMA])
  useEffect(() => { saveChartPrefs({ showRSI }) }, [showRSI])
  useEffect(() => { saveChartPrefs({ showMACD }) }, [showMACD])
  useEffect(() => { saveChartPrefs({ smaPeriod }) }, [smaPeriod])
  useEffect(() => { saveChartPrefs({ rsiPeriod }) }, [rsiPeriod])
  useEffect(() => { saveChartPrefs({ macdFast }) }, [macdFast])
  useEffect(() => { saveChartPrefs({ macdSlow }) }, [macdSlow])
  useEffect(() => { saveChartPrefs({ macdSignal }) }, [macdSignal])
  useEffect(() => { saveChartPrefs({ showVolumeProfile }) }, [showVolumeProfile])
  useEffect(() => { saveChartPrefs({ vpBins }) }, [vpBins])
  useEffect(() => { saveChartPrefs({ showVWAP }) }, [showVWAP])
  useEffect(() => { saveChartPrefs({ showMTF }) }, [showMTF])
  useEffect(() => { saveChartPrefs({ mtfTimeframe }) }, [mtfTimeframe])
  useEffect(() => { saveChartPrefs({ showOrderBook }) }, [showOrderBook])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // Keyboard shortcuts for drawing tools
  useEffect(() => {
    const onKey = (e) => {
      // Don't capture when typing in inputs
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      switch (e.key.toLowerCase()) {
        case 'h': setDrawingMode('horizontal'); window.dispatchEvent(new CustomEvent('pit-clear-anchor')); break;
        case 't': setDrawingMode('trendline'); window.dispatchEvent(new CustomEvent('pit-clear-anchor')); break;
        case 'f': setDrawingMode('fibonacci'); window.dispatchEvent(new CustomEvent('pit-clear-anchor')); break;
        case 'escape': setDrawingMode('off'); window.dispatchEvent(new CustomEvent('pit-clear-anchor')); break;
      }
    };
    // Listen for drawing-mode changes from CanvasChart (Escape key)
    const onMode = (e) => setDrawingMode(e.detail || 'off');
    window.addEventListener('keydown', onKey);
    window.addEventListener('pit-drawing-mode', onMode);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pit-drawing-mode', onMode);
    };
  }, []);

  const chartContainerRef = useRef(null)

  const assetColor = useMemo(() => getAssetColor(selectedAsset, assets), [selectedAsset, assets])
  const currentAsset = useMemo(() => assets.find(a => a.name === selectedAsset), [assets, selectedAsset])
  const latestPrice = priceHistory?.[priceHistory.length - 1]?.price || 0
  const prevPrice = priceHistory?.[priceHistory.length - 2]?.price || latestPrice
  const priceChange = latestPrice - prevPrice
  const isUp = priceChange >= 0

  // Map our candle format → CanvasChart format {t, o, h, l, c, v}
  const mappedCandles = useMemo(() => {
    if (!candleHistory) return []
    return candleHistory.map(c => ({
      t: c.time > 1e12 ? c.time : (Date.now() - (candleHistory.length - 1 - c.time) * TF_MAP[timeframe]),
      o: c.open, h: c.high, l: c.low, c: c.close, v: c.v || 0,
    }))
  }, [candleHistory, timeframe])

  // Compute indicator overlays
  const indicators = useMemo(() => {
    if (!candleHistory || candleHistory.length < 20) return null
    const result = {}
    if (showIndicators) {
      result.ema = computeEMA(candleHistory, 9)
      result.bollinger = computeBollingerBands(candleHistory, 20, 2)
    }
    if (showSMA) {
      result.sma = computeSMA(candleHistory, smaPeriod)
    }
    if (showRSI) {
      result.rsi = computeRSI(candleHistory, rsiPeriod)
    }
    if (showMACD) {
      result.macd = computeMACD(candleHistory, macdFast, macdSlow, macdSignal)
    }
    if (showVWAP) {
      result.vwap = computeVWAP(candleHistory)
    }
    return Object.keys(result).length > 0 ? result : null
  }, [candleHistory, showIndicators, showSMA, showRSI, showMACD, showVWAP, smaPeriod, rsiPeriod, macdFast, macdSlow, macdSignal])

  // Compute trade markers: open positions + recent closed for selected asset
  const tradeMarkers = useMemo(() => {
    return positions
      .filter(p => p.asset === selectedAsset && (p.status === 'open' || p.status === 'win' || p.status === 'loss'))
      .map(p => ({
        id: p.id,
        entry: p.entryPrice,
        sl: p.sl,
        tp: p.tp,
        direction: p.direction,
        openTime: p.openTime,
        amount: p.amount,
        pnl: p.pnl,
        status: p.status,
        exitPrice: p.exitPrice,
        closedAt: p.closedAt,
        payoutPercent: p.payoutPercent || 82,
        duration: p.duration,
        closeReason: p.closeReason,
        note: p.note,
      }))
  }, [positions, selectedAsset])

  // Volume Profile
  const volumeProfile = useMemo(() => {
    if (!showVolumeProfile || !mappedCandles || mappedCandles.length < 2) return null
    return computeVolumeProfile(mappedCandles, vpBins)
  }, [showVolumeProfile, mappedCandles, vpBins])

  // VWAP
  const vwapData = useMemo(() => {
    if (!showVWAP || !mappedCandles || mappedCandles.length < 2) return null
    return computeVWAP(mappedCandles)
  }, [showVWAP, mappedCandles])

  // Order Book
  const orderBook = useMemo(() => {
    if (!showOrderBook || !currentAsset) return null
    return generateOrderBook(currentAsset.price, 14)
  }, [showOrderBook, currentAsset?.price])

  // Custom indicators
  const customIndData = useMemo(() => {
    if (!customIndicators.length || !candleHistory || candleHistory.length < 5) return []
    return customIndicators.map(ci => {
      const source = candleHistory.map(c => c[ci.source] || c.close)
      const sourceData = source.map((v, i) => ({ ...candleHistory[i], close: v }))
      let data = null
      if (ci.type === 'sma') data = computeSMA(sourceData, ci.period)
      else if (ci.type === 'ema') data = computeEMA(sourceData, ci.period)
      else if (ci.type === 'rsi') data = computeRSI(sourceData, ci.period)
      return { ...ci, data }
    })
  }, [customIndicators, candleHistory])

  // MTF overlay candles
  const mtfCandles = useMemo(() => {
    if (!showMTF || !candleHistory || candleHistory.length < 2) return null
    const currentTfMs = TF_MAP[timeframe] || 60000
    const mtfMs = TF_MAP[mtfTimeframe] || 300000
    if (mtfMs <= currentTfMs) return null
    const ratio = Math.round(mtfMs / currentTfMs)
    const basePrice = currentAsset?.price || candleHistory[candleHistory.length - 1]?.close || 1
    const mtfCount = Math.max(4, Math.floor(candleHistory.length / ratio))
    const raw = generateCandleHistory(mtfCount, basePrice)
    // Map to canvas format with timestamps that align to MTF boundaries
    const now = Date.now()
    return raw.map((c, i) => ({
      t: now - (mtfCount - i) * mtfMs,
      o: c.open, h: c.high, l: c.low, c: c.close,
    }))
  }, [showMTF, mtfTimeframe, timeframe, candleHistory, currentAsset])

  const canvasChartType = chartType === 'candlestick' ? 'candles' : chartType === 'bar' ? 'ohlc' : chartType

  const cursorClass = 'crosshair'

  return (
    <main className="chart-area">
      <div className="chart-toolbar">
        {/* Left: candle countdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
            color: 'var(--brand)', background: 'rgba(245,123,0,0.1)',
            padding: '2px 8px', borderRadius: 4,
          }}>
            {(() => {
              const tfMs = TF_MAP[timeframe] || 60000
              const remaining = tfMs - (now % tfMs)
              const s = Math.ceil(remaining / 1000)
              if (s >= 60) return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
              return `0:${String(s).padStart(2, '0')}`
            })()}
          </span>

          {/* Price feed mode selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <button
              onClick={() => onSetPriceMode?.('random')}
              title={t('chart.randomWalk')}
              style={{
                width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 6, cursor: 'pointer', padding: 0,
                background: priceMode === 'random' ? 'var(--bg-elevated)' : 'transparent',
                border: priceMode === 'random' ? '1px solid var(--border-default)' : '1px solid transparent',
                color: priceMode === 'random' ? 'var(--text-secondary)' : 'var(--text-muted)',
                transition: 'all 0.15s',
              }}
            ><Shuffle size={14} /></button>
            <button
              onClick={() => {
                if (priceMode === 'trending') {
                  onSetTrendDir?.(trendDir === 'up' ? 'down' : 'up')
                } else {
                  onSetPriceMode?.('trending')
                }
              }}
              title={`${t('chart.trending')} ${trendDir === 'up' ? 'up' : 'down'} — ${t('chart.trendingToggle')}`}
              style={{
                width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 6, cursor: 'pointer', padding: 0,
                background: priceMode === 'trending' ? 'var(--bg-elevated)' : 'transparent',
                border: priceMode === 'trending' ? '1px solid var(--brand)' : '1px solid transparent',
                color: priceMode === 'trending' ? 'var(--brand)' : 'var(--text-muted)',
                transition: 'all 0.15s',
              }}
            >{trendDir === 'up' ? <TrendingUp size={14} /> : <TrendingDown size={14} />}</button>
            <button
              onClick={() => onSetPriceMode?.('volatile')}
              title={t('chart.volatile')}
              style={{
                width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 6, cursor: 'pointer', padding: 0,
                background: priceMode === 'volatile' ? 'var(--bg-elevated)' : 'transparent',
                border: priceMode === 'volatile' ? '1px solid var(--danger)' : '1px solid transparent',
                color: priceMode === 'volatile' ? 'var(--danger)' : 'var(--text-muted)',
                transition: 'all 0.15s',
              }}
            ><Zap size={14} /></button>
            <button
              onClick={() => onSetPriceMode?.('sideways')}
              title={t('chart.sideways')}
              style={{
                width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 6, cursor: 'pointer', padding: 0,
                background: priceMode === 'sideways' ? 'var(--bg-elevated)' : 'transparent',
                border: priceMode === 'sideways' ? '1px solid #ffc107' : '1px solid transparent',
                color: priceMode === 'sideways' ? '#ffc107' : 'var(--text-muted)',
                transition: 'all 0.15s',
              }}
            ><ArrowLeftRight size={14} /></button>
          </div>

          {/* Chart layout toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 4, borderLeft: '1px solid var(--border-subtle)', paddingLeft: 8 }}>
            <button onClick={() => onSetChartLayout?.('single')} title={t('chart.single')}
              style={{
                width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 6, cursor: 'pointer', padding: 0,
                background: chartLayout === 'single' ? 'var(--bg-elevated)' : 'transparent',
                border: chartLayout === 'single' ? '1px solid var(--border-default)' : '1px solid transparent',
                color: chartLayout === 'single' ? 'var(--text-secondary)' : 'var(--text-muted)',
                transition: 'all 0.15s',
              }}
            ><Square size={14} /></button>
            <button onClick={() => onSetChartLayout?.('2up')} title={t('chart.twoUp')}
              style={{
                width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 6, cursor: 'pointer', padding: 0,
                background: chartLayout === '2up' ? 'var(--bg-elevated)' : 'transparent',
                border: chartLayout === '2up' ? '1px solid var(--brand)' : '1px solid transparent',
                color: chartLayout === '2up' ? 'var(--brand)' : 'var(--text-muted)',
                transition: 'all 0.15s',
              }}
            ><Columns2 size={14} /></button>
            <button onClick={() => onSetChartLayout?.('4up')} title={t('chart.fourUp')}
              style={{
                width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 6, cursor: 'pointer', padding: 0,
                background: chartLayout === '4up' ? 'var(--bg-elevated)' : 'transparent',
                border: chartLayout === '4up' ? '1px solid var(--brand)' : '1px solid transparent',
                color: chartLayout === '4up' ? 'var(--brand)' : 'var(--text-muted)',
                transition: 'all 0.15s',
              }}
            ><Grid2X2 size={14} /></button>
          </div>

          {/* Market Replay */}
          {onStartReplay && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4, borderLeft: '1px solid var(--border-subtle)', paddingLeft: 8 }}>
              {!isReplaying ? (
                <button onClick={onStartReplay} title={t('chart.startReplay')}
                  style={{
                    padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    background: 'var(--bg-input)', border: '1px solid var(--border-default)',
                    color: 'var(--brand)', display: 'flex', alignItems: 'center', gap: 4,
                  }}>
                  <Play size={14} /> {t('chart.replay')}
                </button>
              ) : (
                <>
                  <button onClick={onToggleReplayPause} title={t('chart.pauseReplay')}
                    style={{
                      width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
                      color: 'var(--brand)', fontSize: 11,
                    }}><Pause size={12} /></button>
                  <select value={replaySpeed} onChange={e => onSetReplaySpeed?.(parseInt(e.target.value))}
                    style={{
                      padding: '2px 4px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                      background: 'var(--bg-input)', border: '1px solid var(--border-default)',
                      color: 'var(--text-primary)', outline: 'none', cursor: 'pointer',
                    }}>
                    <option value={2}>{t('chart.speed2x')}</option>
                    <option value={5}>{t('chart.speed5x')}</option>
                    <option value={10}>{t('chart.speed10x')}</option>
                  </select>
                  {/* Mini progress bar */}
                  <div style={{
                    width: 40, height: 4, borderRadius: 2, background: 'var(--bg-input)',
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      width: `${replayProgress}%`, height: '100%', borderRadius: 2,
                      background: 'var(--brand)', transition: 'width 0.2s',
                    }} />
                  </div>
                  <button onClick={onStopReplay} title={t('chart.stopReplay')}
                    style={{
                      width: 26, height: 26, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', background: 'var(--danger)', border: 'none',
                      color: '#fff', fontSize: 11, fontWeight: 700,
                    }}><StopCircle size={12} /></button>
                </>
              )}
            </div>
          )}

          <button onClick={() => setShowModal(true)} title={t('chart.chartSettings')}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 4 }}>
            <Settings size={16} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {connected ? <Wifi size={14} color="var(--success)" /> : <WifiOff size={14} color="var(--danger)" />}
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '3px 10px', borderRadius: 6,
            background: 'rgba(245,123,0,0.06)',
            border: '1px solid rgba(245,123,0,0.12)',
            marginLeft: 'auto',
          }}>
            <span style={{
              width: 5, height: 5, borderRadius: '50%',
              background: 'var(--success)',
              flexShrink: 0,
            }} />
            <span style={{
              fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
              color: 'var(--text-secondary)', letterSpacing: '0.03em',
            }}>{new Date(now).toISOString().replace('T', ' ').slice(0, 19)}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--brand)' }}>{t('chart.utc')}</span>
          </div>
        </div>
      </div>

      {chartLayout === 'single' ? (
        <div className="chart-container" ref={chartContainerRef} style={{
          position: 'relative',
          cursor: drawingMode !== 'off' ? 'crosshair' : cursorClass,
          overflow: 'hidden',
        }}>
          {mappedCandles.length > 0 ? (
            <>
              {/* Asset info overlay — top-left of chart */}
              <div style={{
                position: 'absolute', top: 8, left: 12, zIndex: 10, pointerEvents: 'none',
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <AssetIcon asset={currentAsset} size={32} style={{ borderRadius: 6, background: `linear-gradient(135deg, ${assetColor}, ${assetColor}dd)` }} />
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                    {selectedAsset}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                      {latestPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 })}
                    </span>
                    <span style={{
                      fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                      color: isUp ? 'var(--success)' : 'var(--danger)',
                    }}>
                      {isUp ? '+' : ''}{priceChange.toFixed(5)}
                    </span>
                  </div>
                </div>
              </div>
              <CanvasChart
                key={`${selectedAsset}|${chartResetKey}`}
                candles={mappedCandles}
                decimals={5}
                chartType={canvasChartType}
                persistKey={`${selectedAsset}|${timeframe}`}
                resetKey={chartResetKey}
                tfMs={TF_MAP[timeframe] || 60000}
                showGrid={true}
                marketOpen={true}
                indicators={indicators}
                drawingMode={drawingMode}
                tradeMarkers={tradeMarkers}
                volumeProfile={volumeProfile}
                mtfCandles={mtfCandles}
                orderBook={orderBook}
                customIndicators={customIndData}
              />
            </>
          ) : (
            /* Loading placeholder — matches trading-charts v-else placeholder-glow pattern.
               CanvasChart is NOT mounted until data arrives, so there is no
               empty→populated transition. The chart appears fully formed. */
            <div style={{
              position: 'absolute', inset: 0, display: 'flex',
              flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              background: 'var(--chart-bg, #0d0f14)',
            }}>
              <div style={{
                width: 60, height: 60, borderRadius: '50%',
                border: '2px solid var(--border-default, rgba(255,255,255,0.08))',
                borderTopColor: 'var(--brand, #f57b00)',
                animation: 'spin 0.8s linear infinite',
                marginBottom: 16,
              }} />
              <span style={{
                fontSize: 13, fontWeight: 500,
                color: 'var(--text-secondary, #8b8fa8)',
              }}>{t('chart.loading')}</span>
              <span style={{
                fontSize: 11, fontWeight: 400,
                color: 'var(--text-muted, #5a5e72)',
                marginTop: 4,
              }}>{t('chart.loadingSub')}</span>
            </div>
          )}
        </div>
      ) : (
        /* Multi-chart grid */
        <div style={{
          flex: 1, display: 'grid',
          gridTemplateColumns: chartLayout === '4up' ? '1fr 1fr' : '1fr 1fr',
          gridTemplateRows: chartLayout === '4up' ? '1fr 1fr' : '1fr',
          gap: 2, padding: 2, overflow: 'hidden',
        }}>
          {tabs.slice(0, chartLayout === '4up' ? 4 : 2).map(tab => {
            const isActive = tab.id === activeTabId
            const tabCandles = (tab.candleHistory || []).map(c => ({
              t: c.time > 1e12 ? c.time : (Date.now() - (tab.candleHistory.length - 1 - c.time) * (TF_MAP[tab.timeframe] || 60000)),
              o: c.open, h: c.high, l: c.low, c: c.close, v: c.v || 0,
            }))
            const tabLatest = tab.priceHistory?.[tab.priceHistory.length - 1]?.price
            const tabPrev = tab.priceHistory?.[tab.priceHistory.length - 2]?.price || tabLatest
            const tabUp = tabLatest >= tabPrev
            const tabColor = getAssetColor(tab.asset, assets)
            // Compute indicators for this tab
            const tabIndicators = (() => {
              if (!tab.candleHistory || tab.candleHistory.length < 20) return null
              const r = {}
              if (showIndicators) {
                r.ema = computeEMA(tab.candleHistory, 9)
                r.bollinger = computeBollingerBands(tab.candleHistory, 20, 2)
              }
              if (showSMA) r.sma = computeSMA(tab.candleHistory, smaPeriod)
              if (showRSI) r.rsi = computeRSI(tab.candleHistory, rsiPeriod)
              if (showMACD) r.macd = computeMACD(tab.candleHistory, macdFast, macdSlow, macdSignal)
              return Object.keys(r).length > 0 ? r : null
            })()
            const tabMarkers = positions
              .filter(p => p.asset === tab.asset && (p.status === 'open' || p.status === 'win' || p.status === 'loss'))
              .map(p => ({
                id: p.id, entry: p.entryPrice, sl: p.sl, tp: p.tp,
                direction: p.direction, openTime: p.openTime, amount: p.amount,
                pnl: p.pnl, status: p.status, exitPrice: p.exitPrice, closedAt: p.closedAt,
              }))

            return (
              <div key={tab.id}
                onClick={() => onSelectTab?.(tab.id)}
                style={{
                  position: 'relative', cursor: 'pointer', overflow: 'hidden',
                  borderRadius: 8,
                  border: isActive ? '2px solid var(--brand)' : '1px solid var(--border-subtle)',
                  background: 'var(--chart-bg, #0d0f14)',
                  transition: 'border 0.15s',
                }}
              >
                {/* Mini header */}
                <div style={{
                  position: 'absolute', top: 4, left: 8, right: 8, zIndex: 2,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  pointerEvents: 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <AssetIcon asset={assets.find(a => a.name === tab.asset)} size={14} style={{ borderRadius: 3, background: tabColor + '22', color: tabColor, fontSize: 8 }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)' }}>{tab.asset}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: tabUp ? 'var(--success)' : 'var(--danger)' }}>
                      {tabLatest?.toFixed(5)}
                    </span>
                    <span style={{ fontSize: 8, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', padding: '1px 4px', borderRadius: 3 }}>
                      {tab.timeframe}
                    </span>
                  </div>
                </div>
                <CanvasChart
                  candles={tabCandles}
                  decimals={5}
                  chartType={canvasChartType}
                  persistKey={`${tab.asset}|${tab.timeframe}|mini`}
                  resetKey={chartResetKey}
                  tfMs={TF_MAP[tab.timeframe] || 60000}
                  showGrid={false}
                  marketOpen={true}
                  indicators={tabIndicators}
                  drawingMode={drawingMode}
                  tradeMarkers={tabMarkers}
                />
              </div>
            )
          })}
        </div>
      )}

      {showModal && (
        <SettingsModal
          selectedAsset={selectedAsset} assets={assets} assetColor={assetColor}
          chartType={chartType} setChartType={setChartType}
          drawingMode={drawingMode} setDrawingMode={setDrawingMode}
          timeframe={timeframe} onTimeframeChange={onTimeframeChange}
          showIndicators={showIndicators} setShowIndicators={setShowIndicators}
          showSMA={showSMA} setShowSMA={setShowSMA} smaPeriod={smaPeriod} setSmaPeriod={setSmaPeriod}
          showRSI={showRSI} setShowRSI={setShowRSI} rsiPeriod={rsiPeriod} setRsiPeriod={setRsiPeriod}
          showMACD={showMACD} setShowMACD={setShowMACD}
          macdFast={macdFast} setMacdFast={setMacdFast} macdSlow={macdSlow} setMacdSlow={setMacdSlow} macdSignal={macdSignal} setMacdSignal={setMacdSignal}
          showVWAP={showVWAP} setShowVWAP={setShowVWAP}
          showMTF={showMTF} setShowMTF={setShowMTF} mtfTimeframe={mtfTimeframe} setMtfTimeframe={setMtfTimeframe}
          showOrderBook={showOrderBook} setShowOrderBook={setShowOrderBook}
          showVolumeProfile={showVolumeProfile} setShowVolumeProfile={setShowVolumeProfile} vpBins={vpBins} setVpBins={setVpBins}
          customIndicators={customIndicators} setCustomIndicators={setCustomIndicators}
          alerts={alerts} onAddAlert={onAddAlert} onRemoveAlert={onRemoveAlert}
          toastDuration={toastDuration} onToastDurationChange={onToastDurationChange}
          confirmTrades={confirmTrades} onToggleConfirmTrades={onToggleConfirmTrades}
          pushEnabled={pushEnabled} pushPermission={pushPermission} onTogglePush={onTogglePush}
          onClose={() => setShowModal(false)}
        />
      )}
    </main>
  )
}
