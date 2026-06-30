---
name: trading-charts-study
description: Analysis of adrianmanchev/trading-charts d3.js chart — patterns borrowed for CanvasChart first-render fix
metadata:
  type: reference
---

# trading-charts Study — Patterns Borrowed

**Repo:** github.com/adrianmanchev/trading-charts (MIT, Vue.js + d3.js + Binance WS)

## Architecture

```
Detail.vue → Chart.vue → chart.js (d3 helper)
```

### Data Flow
```
mounted() → loading=true → binance.klines() → onSuccess(data)
  → $nextTick → chart(completeData) → loading=false
  → WebSocket tick → watch: tick → fn.update(price)
```

**Critical: chart is CREATED only after ALL historical data is loaded.** Ticks are silently dropped during loading.

## Key Patterns Borrowed

### 1. Enter vs Update — Separate Paths
d3's `.join(enter, update)` cleanly separates:
- **Enter (first render):** `.append('path').attr(...)` — NO transition, instant paint
- **Update (subsequent data):** `.transition().duration(230)` — smooth animation

Our equivalent: `firstRenderRef` in CanvasChart. First frame renders instantly (no interpolation, no smooth bounds lerp, no zoom animation). Subsequent frames use existing 300ms tick interpolation.

### 2. Loading State
trading-charts shows a CSS placeholder glow while `loading=true`. The chart is not created until data arrives.

Our equivalent: CanvasChart shows "Waiting for market data…" when candle array is empty. Combined with `historyReadyRef` in App.jsx (which prevents tick-built candles from rendering), the chart stays on "Waiting…" until fetchCandles returns full history.

### 3. Single `update()` Function
chart.js exposes `{ update: (tick) => {...} }`. The parent calls this with each WebSocket tick. Inside:
- Updates the data array (shift + push, or replace last)
- Re-initializes scales
- Transitions all elements

Our equivalent: `detectDataChanges()` in CanvasChart's rAF loop. Runs at 60fps, independently of React render ticks. Detects changes by comparing `candlesRef.current` against `dataSnapshotRef`.

### 4. Dynamic Duration
```js
duration = (window.PageVisibility || {}).hidden ? 0 : chartDuration
```
When tab is hidden, skip transitions. We could add this to CanvasChart.

### 5. External Data Management
chart.js receives data — it doesn't fetch or manage it. Parent handles WebSocket/REST. Our architecture already follows this pattern (App.jsx manages data, CanvasChart renders it).

## What We Changed

### App.jsx
- `historyReadyRef` — gates React state syncs until real candle history arrives
- Ticks accumulate silently in `candleStoreRef` until `fetchCandles` marks tab as ready
- `onDerivCandles` marks tab+tf ready, then syncs full history

### CanvasChart.jsx
- `firstRenderRef` — when true, ALL animation paths are skipped:
  - `getInterpolatedCandles` returns raw data (no interp)
  - `smoothBoundsRef` takes direct path (no lerp)
  - `physicsStep` zoom animation has zero velocity (no zoom bounce)
- Cleared after first frame renders, reset on data resets and empty data
- `detectDataChanges` moved into rAF loop (60fps, independent of React ticks)

## Result
Chart goes from "Waiting for market data…" → fully populated in ONE frame.
No visible tick-by-tick buildup. No interpolation on first render. Subsequent
ticks use smooth 300ms interpolation.
