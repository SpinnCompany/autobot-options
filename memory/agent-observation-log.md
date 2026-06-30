---
name: agent-observation-log
description: Observations of agent-made changes during June 29-30, 2026 sessions
metadata:
  type: project
---

# Agent Observation Log — June 29–30, 2026

## Session 2: June 30, 2026 — Polish & Fixes

### Chart Live-Update Fix
**Root cause:** `syncCandlesToTab` in App.jsx passed the same array reference to React state. ChartArea's `useMemo([candleHistory])` saw same reference → returned cached `mappedCandles` → CanvasChart never redrew.

**Fix:** `candleHistory: [...candles]` spread creates new array reference each sync.

### Forex Flag Emojis
Added `CURRENCY_FLAGS` map (24 currencies → flag emojis) to `derivMapping.js`. Forex pairs now show 🇺🇸🇪🇺🇬🇧🇯🇵 etc. in the asset panel. Non-forex assets keep text badge icons.

### Settings Persistence (11 localStorage keys)
- `autobot_chart_prefs` — chart type, all indicator toggles/params, volume profile, VWAP, MTF, order book
- `autobot_trade_amount`, `autobot_trade_duration`, `autobot_trade_tp`, `autobot_trade_sl` — trade defaults
- `autobot_active_section`, `autobot_active_tab` — UI state
- Previously existing: sound, confirm trades, toast duration, alerts, martingale, compounding

### Chart Smoothness
- Tick interpolation: 80ms → 300ms (easeOutCubic)
- Slide transition (new candle): separate 450ms duration
- Price scale smoothing: lerp factor 0.10 toward target bounds
- Prevents jarring chart jumps when auto-scale adjusts

### Tab Open/Close → Reset Zoom
- `chartResetKey` counter in App.jsx increments on tab open/close
- CanvasChart `resetKey` effect resets zoom to ~80 recent candles, pan to 0, clears physics
- Chart always shows current price action on tab switch

### Noisy Seed Data Removed
- `seedDayHistory` now generates flat baseline (all OHLC = same price) instead of random noise
- Real Deriv OHLC arrives via `fetchCandles` within 1-2 seconds
- First-batch useEffect respects restored tab assets (doesn't overwrite)

### Clean Slate on Refresh
- Tabs init as `[]` — no default tab, no persisted tab metadata
- First Deriv asset auto-opens initial tab
- All tabs get data through same Deriv pipeline
- "Can't close last tab" guard removed

### Design System Alignment
Full token rename to `--pit-*` namespace per `rules/design-system.md`:
- Surface hierarchy: Level 0 (bg) → Level 1 (panels) → Level 2 (cards) → Level 3 (inputs)
- Sidebar: solid bg per §13.1 (never glass)
- Borders: `rgba(255,255,255,0.06)` internal, amber ONLY for interactive per §13.10
- Glass: blur 16px per spec
- MANDATORY reduced-motion media query
- Animation keyframes: fadeInUp, fadeInScale
- Font: Plus Jakarta Sans (single family)
- Minimum font size: 11px (all 9px/10px eliminated)

### Logo & Branding
- Copied `logo.png` + `plain_logo.png` from autobot-admin/src/assets/
- Sidebar uses plain_logo.png instead of Zap icon
- Favicon updated to plain_logo.png

### Trade Panel Sub-Containers
Unified `.tp-sub` pattern for all collapsible sections:
- `.tp-sub-hdr` — clickable header row with label + ON/OFF badge + chevron
- `.tp-sub-body` — expanded content with top border
- `.tp-sub-seg` — segmented Auto/Manual toggle
- `.tp-sub-input` — consistent number inputs
- `.tp-sub-steps` / `.tp-sub-chip` — step array chips
- `.tp-sub-actions` — Advance/Reset button row
- `.tp-sub-hint` — dimmed status text
- Active sub gets amber left-edge inset + border highlight

### UTC Clock
- Right-aligned in chart toolbar via `marginLeft: 'auto'`
- Amber-tinted pill badge with green live dot
- `YYYY-MM-DD HH:MM:SS UTC` format, updates every second

### Console Log Cleanup
- Removed tick-by-tick and stream-summary console.log from useMarketData.js
- No more `[Deriv tick #N]` or `[Deriv stream]` spam

## Session 1: June 29, 2026 — DemoEngine Extraction

**What changed:** App.jsx trading logic was extracted into `src/engine/DemoEngine.js` (529 lines).

**Before:** All trade execution, TP/SL checking, alert monitoring, balance management, and localStorage persistence lived inside App.jsx via inline `useCallback`/`useState`/`useEffect` blocks.

**After:** Pure JS `DemoEngine` class with React hook wrapper `useDemoEngine`. App.jsx now delegates all trading operations to the engine.

### Implications
- **App.jsx** much cleaner
- **Broker integration** unblocked — adapter interface matches DemoEngine's method signatures
- **DemoEngine.js** has no React imports in the class itself — pure JS, testable

## File State
- `src/engine/DemoEngine.js` — exists, builds clean
- `src/App.jsx` — refactored to use `useDemoEngine`
- All existing features (TP/SL, martingale, double up, alerts, sounds) preserved in engine

## Recommendations
1. Write unit tests for DemoEngine — it's pure JS, easy to test
2. Extract `BrokerAdapter` interface from DemoEngine's public methods
3. Add engine instance tracking for multi-account support

See also: [[broker-gap-audit]], [[broker-integration-architecture]]
