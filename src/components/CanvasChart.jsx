/* CanvasChart.tsx — Physics-grade chart engine with:
   - Momentum-based zoom inertia (velocity tracking + easeOutCubic decay)
   - Inertial panning with friction + boundary soft-clamp + spring-back
   - Dual-layer rendering: static history layer + interpolated live candle
   - requestAnimationFrame scheduler (single render loop, frame-synchronized)
   - Viewport-culled batch rendering
   - Zero React state for render-critical physics (refs-only, no re-renders)
   - Smooth tick animation (easeOutCubic interpolation on every price change)
   - Persistent zoom per symbol+timeframe (only reset by user)
   - Crosshair with right-scale price label (DeriveChart-style)
   - Right margin padding so candles don't touch price scale */

import React, { useRef, useEffect, useCallback, useState } from "react";
import { useTranslation } from 'react-i18next';
import { ZoomIn, ZoomOut } from 'lucide-react';









/* ── Colors — PIT-TERMINAL design system ── */
const GREEN = "#10b981";           const RED = "#ef4444";
const GREEN_DIM = "rgba(16,185,129,0.45)";     const RED_DIM = "rgba(239,68,68,0.45)";
const BLUE = "#2979ff";
const GRID = "rgba(255,255,255,0.035)";
const TEXT = "#5a5e72";             const TEXT_BRIGHT = "#e8eaf0";
const BG = "#0d0f14";
const BORDER = "rgba(255,255,255,0.06)";
const XHAIR = "rgba(255,255,255,0.06)";
const TOOLTIP_BG = "rgba(17,19,24,0.97)";
const CLOSED_OVERLAY = "rgba(10,11,15,0.85)";
const LINE_COL = "rgba(245,123,0,0.50)";     /* Brand line */
const BADGE_BORDER = "rgba(245,123,0,0.55)";

/* ── Helpers ── */
function safeN(v, d = 0) { return Number.isFinite(v) ? v : d; }
function fmtTime(ts) {
  const d = new Date(ts);
  return d.getHours().toString().padStart(2,"0") + ":" + d.getMinutes().toString().padStart(2,"0") + ":" + d.getSeconds().toString().padStart(2,"0");
}
function lerp(a, b, t) { return a + (b - a) * t; }
function easeOutCubic(t) { return 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3); }
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r); ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r); ctx.lineTo(x + r, y + h);
  ctx.arcTo(x + r, y + h, x, y + h - r, r); ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
}

let idCounter = 1;

/* ── Zoom physics constants ── */
const ZOOM_VELOCITY_SCALE = 0.00015;
const ZOOM_FRICTION = 0.88;
const ZOOM_MIN_VELOCITY = 0.001;
const MIN_ZOOM_BARS = 3;
const MAX_ZOOM_BARS = 5000;
const ZOOM_STEP_BASE = 0.06;
const ZOOM_SNAP_THRESHOLD = 0.5;

/* ── Pan physics constants ── */
const PAN_FRICTION = 0.91;
const PAN_MIN_VELOCITY = 0.15;
const PAN_OVERSCROLL_RESISTANCE = 0.35;
const PAN_SPRING_BACK = 0.08;
const PAN_OVERSHOOT_LIMIT = 60;

/* ── Live candle interpolation ── */
const TICK_INTERP_DURATION = 300;   // smooth 300ms OHLC transition between ticks
const SLIDE_INTERP_DURATION = 450;  // slower for new-candle slide-in
const PRICE_SCALE_SMOOTH = 0.10;    // lerp factor for auto-scale bounds (lower = smoother)

/* ── Zoom persistence ── */
const ZOOM_STORAGE_KEY = "pit_zoom_v2";


const EMPTY_LAYOUT = {
  margin:{top:30,right:65,bottom:30,left:10},canvasW:0,chartW:0,chartH:0,priceMin:0,priceMax:0,
  candleW:2,barSpacing:10,toPxY:()=>0,toPxX:()=>0,toIdx:()=>0,
};

export const CanvasChart = ({
  candles, decimals = 5, marketOpen = true,
  chartType = "candles", candleWidthMode = "responsive",
  showGrid = true, persistKey = "", resetKey = 0, tfMs = 0, noSmooth = false,
  tradeMarkers = [],
  volumeProfile = null,
  mtfCandles = null,
  orderBook = null,
  customIndicators = [],
  indicators = null,
  drawingMode = 'off',
}) => {
  const { t } = useTranslation();
  const tRef = useRef(t);
  tRef.current = t; // Keep t fresh for canvas fillText calls (non-reactive)
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  /* ── Zoom persistence helper ── */
  const getStoredZoom = useCallback(() => {
    if (!persistKey) return 0;
    try {
      const raw = localStorage.getItem(ZOOM_STORAGE_KEY);
      if (!raw) return 0;
      const data = JSON.parse(raw);
      return data[persistKey] || 0;
    } catch { return 0; }
  }, [persistKey]);

  const setStoredZoom = useCallback((z) => {
    if (!persistKey) return;
    try {
      const raw = localStorage.getItem(ZOOM_STORAGE_KEY) || "{}";
      const data = JSON.parse(raw);
      data[persistKey] = z;
      localStorage.setItem(ZOOM_STORAGE_KEY, JSON.stringify(data));
    } catch { /* noop */ }
  }, [persistKey]);

  /* ── Physics refs (pure refs for performance, never trigger re-render) ── */
  // Start showing ~80 recent candles instead of max zoom-out, or restore persisted zoom
  const getInitialZoom = useCallback(() => {
    const stored = getStoredZoom();
    if (stored > 0) return stored;
    return Math.min(80, candles.length || 80);
  }, [getStoredZoom, candles.length]);
  // CanvasChart now only mounts when data is already loaded (trading-charts pattern).
  // Initialize zoom immediately — no useEffect delay that causes a visible jump.
  const zoomTarget = useRef((function () {
    try {
      if (persistKey) {
        const raw = localStorage.getItem(ZOOM_STORAGE_KEY);
        if (raw) { const data = JSON.parse(raw); const v = data[persistKey]; if (v > 0) return v; }
      }
    } catch { /* noop */ }
    return Math.min(80, candles.length || 80);
  })());
  const zoomVelocity = useRef(0);
  const panOffset = useRef(0);
  const panVelocity = useRef(0);
  const isDragging = useRef(false);
  const dragLastX = useRef(0);
  const dragLastTime = useRef(0);

  /* ── UI-only React state ── */
  const [tooltip, setTooltip] = useState(null);
  const [mouse, setMouse] = useState(null);
  const [isDraggingUI, setIsDraggingUI] = useState(false);
  const [drawingLines, setDrawingLines] = useState(() => {
    try { return JSON.parse(localStorage.getItem("blg_drawing_lines") || "[]"); } catch { return []; }
  });

  /* ── Drawing interaction refs ── */
  const mouseRef = useRef({ x: 0, y: 0 });        // latest mouse pos for drawFrame preview
  const drawingAnchor = useRef(null);              // {x, y, time, price} | null — first click anchor

  /* ── Layout: ref for hot-path reads, state mirror for JSX crosshair ── */
  const layoutRef = useRef(EMPTY_LAYOUT);
  const prevLayoutRef = useRef(null);
  const [layoutSnap, setLayoutSnap] = useState(EMPTY_LAYOUT);

  /* ── Live candle interpolation refs ── */
  const lastCandleRef = useRef(null);
  const interpRef = useRef(null);
  // Smooth candle bar slide: interpolate ALL visible candles, not just last
  const prevCandlesRef = useRef([]);
  const candlesTransitionRef = useRef(null);
  // rAF-driven change detection — compares latest data against snapshot
  const prevCandlesKey = useRef("");
  const dataSnapshotRef = useRef({ key: '', length: 0, lastT: 0 });

  /* ── Smoothed price bounds — prevents jarring auto-scale jumps ── */
  const smoothBoundsRef = useRef(null); // { pMin, pMax } or null on first frame

  /* ── Frame scheduler ── */
  const rafId = useRef(0);
  const needsRedraw = useRef(true);
  const frameFnRef = useRef(() => {});
  // First-render gate: skip ALL animation on initial data arrival AND the first
  // tick update after mount. Only the third data change onward uses interpolation.
  // This matches trading-charts where chart() creates instantly, then update()
  // adds transitions — but our ticks arrive faster so we skip one extra frame.
  const skipAnimRef = useRef(2); // countdown: 2 → 1 → 0 (then interpolation enabled)

  /* ── candlesRef — stable ref for hot-path reads, avoids re-creating callbacks every tick ── */
  const candlesRef = useRef(candles);
  candlesRef.current = candles;

  /* ── Drawing lines persist ── */
  useEffect(() => {
    try { localStorage.setItem("blg_drawing_lines", JSON.stringify(drawingLines)); } catch { /* noop */ }
  }, [drawingLines]);

  /* ── Compute visible candles from refs (stable — reads candles from ref, not prop) ── */
  const getVisibleCandles = useCallback(() => {
    const c = candlesRef.current;
    const len = c.length;
    if (len === 0) return [];
    const maxBars = zoomTarget.current > 0 ? Math.round(zoomTarget.current) : len;
    const effectiveMax = Math.max(MIN_ZOOM_BARS, Math.min(len, maxBars));
    const rawStart = len - effectiveMax - panOffset.current;
    const start = Math.max(0, Math.min(len - 1, Math.round(rawStart)));
    return c.slice(start, Math.min(len, start + effectiveMax + 5));
  }, []);

  /* ── Interpolated candles: smooth slide + OHLC transition (skipped on first render) ── */
  const getInterpolatedCandles = useCallback((visible) => {
    if (noSmooth || skipAnimRef.current > 0) return visible;
    // Full-set slide transition (new candle formed)
    const ct = candlesTransitionRef.current;
    if (ct) {
      const elapsed = Date.now() - ct.startTime;
      const t = easeOutCubic(Math.min(1, elapsed / SLIDE_INTERP_DURATION));
      if (t < 1 && ct.from.length > 0 && ct.to.length > 0) {
        const result = [];
        for (let i = 0; i < visible.length; i++) {
          const v = visible[i];
          // Interpolate the last candle in the new array
          if (v.t === ct.to[ct.to.length - 1]?.t) {
            const fromC = ct.from[ct.from.length - 1];
            if (fromC) {
              result.push({ t: v.t, o: lerp(fromC.o, v.o, t), h: lerp(fromC.h, v.h, t), l: lerp(fromC.l, v.l, t), c: lerp(fromC.c, v.c, t) });
              continue;
            }
          }
          result.push(v);
        }
        return result;
      }
    }
    // Last-candle-only tick interpolation (live OHLC updates)
    const ip = interpRef.current;
    if (ip) {
      const elapsed = Date.now() - ip.startTime;
      const t = easeOutCubic(Math.min(1, elapsed / TICK_INTERP_DURATION));
      if (t < 1 && visible.length > 0) {
        const interpLast = {
          t: ip.to.t, o: lerp(ip.from.o, ip.to.o, t), h: lerp(ip.from.h, ip.to.h, t), l: lerp(ip.from.l, ip.to.l, t), c: lerp(ip.from.c, ip.to.c, t),
        };
        return visible.map((c, i) => i === visible.length - 1 ? interpLast : c);
      }
    }

    return visible;
  }, []);

  /* ═══════════════ DRAW FUNCTION ═══════════════ */
  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.floor(rect.width), h = Math.floor(rect.height);
    if (w <= 0 || h <= 0) return;
    canvas.width = w * dpr; canvas.height = h * dpr; ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = BG; ctx.fillRect(0, 0, w, h);

    const data = getVisibleCandles();
    if (data.length === 0) {
      ctx.fillStyle = "#8b8fa8"; ctx.font = "11px Inter, system-ui, sans-serif"; ctx.textAlign = "center";
      ctx.fillText(tRef.current('chart.waiting'), w/2, h/2);
      return;
    }

    const displayData = getInterpolatedCandles(data);

    // Oscillator sub-panel heights (reserved at bottom of canvas)
    let oscHeight = 0
    let rsiH = 0, macdH = 0
    const hasRSI = indicators?.rsi && indicators.rsi.length > 0
    const hasMACD = indicators?.macd && indicators.macd.macdLine?.length > 0
    if (hasRSI && hasMACD) { rsiH = 75; macdH = 50; oscHeight = rsiH + macdH + 4 }
    else if (hasRSI) { rsiH = 80; oscHeight = rsiH }
    else if (hasMACD) { macdH = 65; oscHeight = macdH }

    const m = { top: 30, right: 65, bottom: 30, left: 10 };
    const cw = w - m.left - m.right;
    const ch = h - m.top - m.bottom - oscHeight;
    const prices = displayData.flatMap((c) => [c.h, c.l, c.o, c.c].map(v => safeN(v)));
    if (!prices.length) return;
    let rawMin = Math.min(...prices), rawMax = Math.max(...prices);
    const rawRange = rawMax - rawMin || 1;
    const targetMin = rawMin - rawRange * 0.05;
    const targetMax = rawMax + rawRange * 0.05;

    // Smooth price scale — lerp toward target bounds to avoid jarring jumps
    let pMin, pMax;
    if (smoothBoundsRef.current) {
      pMin = lerp(smoothBoundsRef.current.pMin, targetMin, PRICE_SCALE_SMOOTH);
      pMax = lerp(smoothBoundsRef.current.pMax, targetMax, PRICE_SCALE_SMOOTH);
      // Snap if close enough to avoid eternal micro-adjustments
      if (Math.abs(pMin - targetMin) < rawRange * 0.0005) pMin = targetMin;
      if (Math.abs(pMax - targetMax) < rawRange * 0.0005) pMax = targetMax;
    } else {
      pMin = targetMin;
      pMax = targetMax;
    }
    smoothBoundsRef.current = { pMin, pMax };

    // Candle spacing — proportional, no cap (always fill chart width)
    const sp = cw / Math.max(displayData.length, 1);
    const cWid = candleWidthMode === "fixed" ? 6 : Math.max(2, Math.min(35, sp * 0.75));

    const py = (pr) => m.top + ch - ((pr - pMin) / (pMax - pMin + 1e-8)) * ch;
    const px = (i) => m.left + i * sp + sp / 2;
    const pi = (x) => Math.min(displayData.length - 1, Math.max(0, Math.round((x - m.left - sp / 2) / sp)));

    // Oscillator Y converters
    const rsiTop = m.top + ch + 2
    const rsiY = (val) => rsiTop + rsiH - ((val - 0) / 100) * rsiH  // 0 at bottom, 100 at top
    const macdTop = rsiTop + rsiH + 4
    const macdAbsMax = 1  // computed dynamically when rendering MACD
    const macdY = (val, absMax) => macdTop + macdH / 2 - (val / (absMax || 1)) * (macdH / 2 - 2)

    layoutRef.current = { margin: m, canvasW: w, chartW: cw, chartH: ch, priceMin: pMin, priceMax: pMax, candleW: cWid, barSpacing: sp, toPxY: py, toPxX: px, toIdx: pi };

    /* Grid — horizontal only (clean, no vertical clutter) */
    if (showGrid) {
      ctx.strokeStyle = GRID; ctx.lineWidth = 0.4;
      for (let i = 0; i <= 5; i++) {
        const y = m.top + (ch / 5) * i;
        ctx.beginPath(); ctx.moveTo(m.left + 2, y); ctx.lineTo(m.left + cw, y); ctx.stroke();
      }
    }

    /* Price labels — right-aligned with subtle backdrop */
    ctx.textAlign = "right"
    for (let i = 0; i <= 5; i++) {
      const y = m.top + (ch / 5) * i
      const label = (pMax - ((pMax - pMin) / 5) * i).toFixed(decimals)
      // Subtle backer to prevent wick overlap
      ctx.fillStyle = "rgba(13,15,20,0.6)"
      const lw = ctx.measureText(label).width
      ctx.fillRect(w - lw - 10, y - 8, lw + 8, 14)
      // Label
      ctx.fillStyle = "#5a5e72"; ctx.font = "11px inherit"
      ctx.fillText(label, w - 4, y + 3)
    }

    /* Time labels — bottom */
    ctx.fillStyle = "#5a5e72"; ctx.font = "11px inherit"; ctx.textAlign = "center"
    const ts = Math.max(1, Math.floor(displayData.length / 5));
    for (let i = 0; i < displayData.length; i += ts) {
      ctx.fillText(fmtTime(displayData[i].t), px(i), h - 6);
    }

    /* ── MTF Overlay candles (higher timeframe behind main chart) ── */
    if (mtfCandles && mtfCandles.length > 1) {
      for (let i = 0; i < mtfCandles.length; i++) {
        const mc = mtfCandles[i];
        const nextT = i < mtfCandles.length - 1 ? mtfCandles[i + 1].t : mc.t + (mc.t - (mtfCandles[i - 1]?.t || mc.t - 60000));
        const c1 = displayData[0]?.t, cN = displayData[displayData.length - 1]?.t;
        if (mc.t > cN || nextT < c1) continue; // out of visible range

        // Find x positions from timestamps
        let x1 = m.left, x2 = m.left + cw;
        for (let j = 0; j < displayData.length; j++) {
          if (displayData[j].t >= mc.t) { x1 = px(j); break; }
        }
        for (let j = 0; j < displayData.length; j++) {
          if (displayData[j].t >= nextT) { x2 = px(j); break; }
        }

        const isUp = mc.c >= mc.o;
        const w = Math.max(1, x2 - x1 - 1);
        const topY = py(Math.max(mc.o, mc.c));
        const botY = py(Math.min(mc.o, mc.c));
        // Wick
        ctx.strokeStyle = isUp ? 'rgba(0,200,83,0.18)' : 'rgba(255,23,68,0.18)';
        ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(x1 + w / 2, py(mc.h)); ctx.lineTo(x1 + w / 2, py(mc.l)); ctx.stroke();
        // Body
        ctx.fillStyle = isUp ? 'rgba(0,200,83,0.10)' : 'rgba(255,23,68,0.10)';
        ctx.fillRect(x1 + 1, topY, Math.max(1, w - 2), Math.max(1, botY - topY));
      }
    }

    /* Chart body */
    if (chartType === "line") {
      ctx.strokeStyle = LINE_COL; ctx.lineWidth = 2; ctx.beginPath();
      for (let i = 0; i < displayData.length; i++) {
        const x = px(i);
        if (i === 0) ctx.moveTo(x, py(safeN(displayData[i].c)));
        else ctx.lineTo(x, py(safeN(displayData[i].c)));
      }
      ctx.stroke();
    } else if (chartType === "area") {
      // Basic area chart — amber gradient fill to chart bottom
      ctx.beginPath();
      for (let i = 0; i < displayData.length; i++) {
        const x = px(i);
        if (i === 0) ctx.moveTo(x, py(safeN(displayData[i].c)));
        else ctx.lineTo(x, py(safeN(displayData[i].c)));
      }
      ctx.lineTo(px(displayData.length - 1), m.top + ch); ctx.lineTo(px(0), m.top + ch); ctx.closePath();
      // Gradient fill — amber from top to transparent at bottom
      const areaGrad = ctx.createLinearGradient(0, m.top, 0, m.top + ch);
      areaGrad.addColorStop(0, "rgba(245,123,0,0.15)");
      areaGrad.addColorStop(0.4, "rgba(245,123,0,0.06)");
      areaGrad.addColorStop(1, "rgba(245,123,0,0.0)");
      ctx.fillStyle = areaGrad; ctx.fill();
      // Line stroke on top
      ctx.strokeStyle = LINE_COL; ctx.lineWidth = 2; ctx.beginPath();
      for (let i = 0; i < displayData.length; i++) {
        const x = px(i);
        if (i === 0) ctx.moveTo(x, py(safeN(displayData[i].c)));
        else ctx.lineTo(x, py(safeN(displayData[i].c)));
      }
      ctx.stroke();
    } else if (chartType === "area-split") {
      // Split-color area chart — trading-charts style: green/red gradient split at first-price baseline
      // Area fills from price line down to baseline (not chart bottom)
      const baselinePrice = safeN(displayData[0].c);
      const baselineY = py(baselinePrice);
      const chartTop = m.top;
      const chartBot = m.top + ch;

      ctx.save();
      // Clip to chart area so fill doesn't bleed into margins
      ctx.beginPath(); ctx.rect(m.left, chartTop, cw, ch); ctx.clip();

      // ── Area fill: from price line down to baseline ──
      ctx.beginPath();
      for (let i = 0; i < displayData.length; i++) {
        const x = px(i), y = py(safeN(displayData[i].c));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      // Close path along baseline back to first point
      ctx.lineTo(px(displayData.length - 1), baselineY);
      ctx.lineTo(px(0), baselineY);
      ctx.closePath();

      // Gradient: green (top) → transparent at baseline → red (bottom)
      // Matches trading-charts UPDATE_AREA_COLORS with gradientUnits: userSpaceOnUse
      const baselineRatio = Math.max(0, Math.min(1, (baselineY - chartTop) / ch)); // clamp [0,1]
      const areaGrad = ctx.createLinearGradient(0, chartTop, 0, chartBot);
      areaGrad.addColorStop(0, 'rgba(16,185,129,0.22)');
      areaGrad.addColorStop(Math.max(0.005, baselineRatio - 0.03), 'rgba(16,185,129,0.07)');
      areaGrad.addColorStop(baselineRatio, 'rgba(128,128,128,0.0)');
      areaGrad.addColorStop(Math.min(0.995, baselineRatio + 0.03), 'rgba(239,68,68,0.07)');
      areaGrad.addColorStop(1, 'rgba(239,68,68,0.22)');
      ctx.fillStyle = areaGrad;
      ctx.fill();

      // ── Line stroke: directional coloring per segment ──
      // Matches trading-charts linearGradient stroke: green above baseline, red below
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      for (let i = 1; i < displayData.length; i++) {
        const prevX = px(i - 1), prevY = py(safeN(displayData[i - 1].c));
        const curX = px(i), curY = py(safeN(displayData[i].c));
        const curPrice = safeN(displayData[i].c);
        const prevPrice = safeN(displayData[i - 1].c);
        // Color segment based on current price vs baseline
        // If crossing baseline, split segment at intersection for sharp color change
        if ((prevPrice >= baselinePrice && curPrice >= baselinePrice) ||
            (prevPrice < baselinePrice && curPrice < baselinePrice)) {
          // Entire segment on one side — single color
          ctx.strokeStyle = curPrice >= baselinePrice
            ? 'rgba(16,185,129,0.90)' : 'rgba(239,68,68,0.90)';
          ctx.beginPath(); ctx.moveTo(prevX, prevY); ctx.lineTo(curX, curY); ctx.stroke();
        } else {
          // Segment crosses baseline — split at intersection
          const t = (baselinePrice - prevPrice) / (curPrice - prevPrice);
          const crossX = prevX + (curX - prevX) * t;
          const crossY = baselineY;
          // First half
          ctx.strokeStyle = prevPrice >= baselinePrice
            ? 'rgba(16,185,129,0.90)' : 'rgba(239,68,68,0.90)';
          ctx.beginPath(); ctx.moveTo(prevX, prevY); ctx.lineTo(crossX, crossY); ctx.stroke();
          // Second half
          ctx.strokeStyle = curPrice >= baselinePrice
            ? 'rgba(16,185,129,0.90)' : 'rgba(239,68,68,0.90)';
          ctx.beginPath(); ctx.moveTo(crossX, crossY); ctx.lineTo(curX, curY); ctx.stroke();
        }
      }
      ctx.restore();
    } else if (chartType === "ohlc") {
      // OHLC bars — creative tick styling with round caps
      const leftEdge = m.left - cWid;
      const rightEdge = m.left + cw + cWid;
      for (let i = 0; i < displayData.length; i++) {
        const x = px(i);
        if (x < leftEdge || x > rightEdge) continue;
        const c = displayData[i];
        const o = safeN(c.o), cl = safeN(c.c), hi = safeN(c.h), lo = safeN(c.l);
        const bullish = cl >= o;
        // Wick — dimmed for landing-quality aesthetic
        ctx.strokeStyle = bullish ? GREEN_DIM : RED_DIM; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(x, py(hi)); ctx.lineTo(x, py(lo)); ctx.stroke();
        // Left tick (open) & right tick (close)
        ctx.lineWidth = 0.8;
        const openY = py(o), closeY = py(cl);
        ctx.beginPath(); ctx.moveTo(x - cWid * 0.4, openY); ctx.lineTo(x, openY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, closeY); ctx.lineTo(x + cWid * 0.4, closeY); ctx.stroke();
      }
    } else {
      // Candles / Hollow — clean broker-style with border-radius bodies
      const isHollow = chartType === "hollow";
      const lastIdx = displayData.length - 1;
      const leftEdge = m.left - cWid;
      const rightEdge = m.left + cw + cWid;
      for (let i = 0; i < displayData.length; i++) {
        const x = px(i);
        if (x < leftEdge || x > rightEdge) continue;
        const c = displayData[i];
        const o = safeN(c.o), cl = safeN(c.c), hi = safeN(c.h), lo = safeN(c.l);
        const bullish = cl >= o;
        const isFlat = hi === lo && o === cl;
        const bodyTop = Math.min(py(o), py(cl));
        const bodyH = Math.max(isFlat ? 3 : 1, Math.abs(py(cl) - py(o)));
        const bw = Math.max(1.5, cWid * 0.6);
        const bx = x - bw / 2;
        const radius = Math.min(2, bw * 0.3);

        // Wick — skip for flat candles (zero-length point is invisible)
        if (!isFlat) {
          ctx.strokeStyle = bullish ? GREEN : RED;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x, py(hi)); ctx.lineTo(x, py(lo)); ctx.stroke();
        }

        // Body
        if (isHollow && bullish) {
          ctx.fillStyle = "rgba(0,200,83,0.15)";
          roundRect(ctx, bx, bodyTop, bw, bodyH, radius); ctx.fill();
          ctx.strokeStyle = GREEN; ctx.lineWidth = 1;
          roundRect(ctx, bx, bodyTop, bw, bodyH, radius); ctx.stroke();
        } else if (isHollow && !bullish) {
          ctx.fillStyle = "rgba(255,23,68,0.15)";
          roundRect(ctx, bx, bodyTop, bw, bodyH, radius); ctx.fill();
          ctx.strokeStyle = RED; ctx.lineWidth = 1;
          roundRect(ctx, bx, bodyTop, bw, bodyH, radius); ctx.stroke();
        } else {
          // Solid filled candle
          ctx.fillStyle = bullish ? GREEN : RED;
          ctx.fillRect(bx, bodyTop, bw, Math.max(1, bodyH));
          // Subtle border for definition
          ctx.strokeStyle = bullish ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.4)";
          ctx.lineWidth = 0.5;
          ctx.strokeRect(bx, bodyTop, bw, Math.max(1, bodyH));
        }
      }
    }

    /* ── Indicator overlays ── */
    // Compute actual start index matching getVisibleCandles clamping
    const cLen = candlesRef.current.length
    const maxBars = zoomTarget.current > 0 ? Math.round(zoomTarget.current) : cLen
    const effectiveMax = Math.max(MIN_ZOOM_BARS, Math.min(cLen, maxBars))
    const rawStart = cLen - effectiveMax - panOffset.current
    const visStart = Math.max(0, Math.min(cLen - 1, Math.round(rawStart)))
    const iStart = Math.max(0, visStart)
    if (indicators && displayData.length > 0) {

      // EMA line
      if (indicators.ema && indicators.ema.length > 0) {
        ctx.strokeStyle = "rgba(59,130,246,0.7)"; ctx.lineWidth = 1.2; ctx.setLineDash([])
        ctx.beginPath()
        let started = false
        for (let i = 0; i < displayData.length; i++) {
          const srcIdx = iStart + i
          if (srcIdx < 0 || srcIdx >= indicators.ema.length) continue
          const val = indicators.ema[srcIdx]
          if (val == null) continue
          const x = px(i), y = py(val)
          if (!started) { ctx.moveTo(x, y); started = true }
          else ctx.lineTo(x, y)
        }
        ctx.stroke()
        // Label
        if (started) {
          ctx.fillStyle = "rgba(59,130,246,0.9)"; ctx.font = "11px inherit"; ctx.textAlign = "left"
          ctx.fillText(tRef.current('chart.ema'), m.left + 4, m.top + 12)
        }
      }

      // SMA line (overlay)
      if (indicators.sma && indicators.sma.length > 0) {
        ctx.strokeStyle = "rgba(250,204,21,0.7)"; ctx.lineWidth = 1.2; ctx.setLineDash([])
        ctx.beginPath()
        let started = false
        for (let i = 0; i < displayData.length; i++) {
          const srcIdx = iStart + i
          if (srcIdx < 0 || srcIdx >= indicators.sma.length) continue
          const val = indicators.sma[srcIdx]
          if (val == null) continue
          const x = px(i), y = py(val)
          if (!started) { ctx.moveTo(x, y); started = true }
          else ctx.lineTo(x, y)
        }
        ctx.stroke()
        if (started) {
          ctx.fillStyle = "rgba(250,204,21,0.9)"; ctx.font = "11px inherit"; ctx.textAlign = "left"
          const lblY = indicators.ema ? m.top + 26 : m.top + 12
          ctx.fillText(tRef.current('chart.sma'), m.left + 4, lblY)
        }
      }

      // Bollinger Bands
      if (indicators.bollinger) {
        const bb = indicators.bollinger
        // Upper band
        if (bb.upper && bb.upper.length > 0) {
          ctx.strokeStyle = "rgba(168,85,247,0.4)"; ctx.lineWidth = 0.8; ctx.setLineDash([4, 4])
          ctx.beginPath()
          let started = false
          for (let i = 0; i < displayData.length; i++) {
            const srcIdx = iStart + i
            if (srcIdx < 0 || srcIdx >= bb.upper.length) continue
            const val = bb.upper[srcIdx]
            if (val == null) continue
            const x = px(i), y = py(val)
            if (!started) { ctx.moveTo(x, y); started = true }
            else ctx.lineTo(x, y)
          }
          ctx.stroke()
          // Label
          if (started) {
            ctx.fillStyle = "rgba(168,85,247,0.6)"; ctx.font = "11px inherit"; ctx.textAlign = "left"
            ctx.fillText(tRef.current('chart.bb'), m.left + 4, m.top + 26)
          }
        }
        // Lower band
        if (bb.lower && bb.lower.length > 0) {
          ctx.strokeStyle = "rgba(168,85,247,0.4)"; ctx.lineWidth = 0.8; ctx.setLineDash([4, 4])
          ctx.beginPath()
          let started = false
          for (let i = 0; i < displayData.length; i++) {
            const srcIdx = iStart + i
            if (srcIdx < 0 || srcIdx >= bb.lower.length) continue
            const val = bb.lower[srcIdx]
            if (val == null) continue
            const x = px(i), y = py(val)
            if (!started) { ctx.moveTo(x, y); started = true }
            else ctx.lineTo(x, y)
          }
          ctx.stroke()
          ctx.setLineDash([])
        }
      }

      // ── VWAP line (overlay on main chart) ──
      if (indicators.vwap && indicators.vwap.length > 0) {
        ctx.strokeStyle = '#ffc107'; ctx.lineWidth = 1.2;
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < displayData.length; i++) {
          const srcIdx = iStart + i;
          if (srcIdx < 0 || srcIdx >= indicators.vwap.length) continue;
          const val = indicators.vwap[srcIdx];
          if (val == null) { started = false; continue; }
          const x = px(i), y = py(val);
          if (!started) { ctx.moveTo(x, y); started = true; }
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        // VWAP label
        ctx.fillStyle = '#ffc107'; ctx.font = 'bold 9px Inter, system-ui, sans-serif'; ctx.textAlign = 'left';
        ctx.fillText(tRef.current('chart.vwap'), m.left + 4, m.top + 14);
      }

      // ── Custom indicators ──
      for (const ci of customIndicators) {
        if (!ci.data || ci.data.length === 0) continue;
        ctx.strokeStyle = ci.color; ctx.lineWidth = 1.1; ctx.setLineDash([]);
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < displayData.length; i++) {
          const srcIdx = iStart + i;
          if (srcIdx < 0 || srcIdx >= ci.data.length) continue;
          const val = ci.data[srcIdx];
          if (val == null) { started = false; continue; }
          const x = px(i), y = py(val);
          if (!started) { ctx.moveTo(x, y); started = true; }
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }

    // ── Divider between chart and oscillator panels ──
    if (hasRSI || hasMACD) {
      ctx.strokeStyle = "rgba(255,255,255,0.08)"; ctx.lineWidth = 0.5
      ctx.beginPath(); ctx.moveTo(m.left, m.top + ch); ctx.lineTo(m.left + cw, m.top + ch); ctx.stroke()
    }

    // ── RSI sub-panel ──
    if (hasRSI) {
      // Overbought / oversold zone backgrounds
      ctx.fillStyle = "rgba(239,68,68,0.04)"
      ctx.fillRect(m.left, rsiY(70), cw, rsiY(30) - rsiY(70))
      ctx.fillStyle = "rgba(0,200,83,0.04)"
      ctx.fillRect(m.left, rsiY(30), cw, rsiY(0) - rsiY(30))

      // 30 / 50 / 70 reference lines
      ctx.setLineDash([3, 5])
      ctx.lineWidth = 0.5
      for (const level of [30, 50, 70]) {
        const ly = rsiY(level)
        ctx.strokeStyle = level === 50 ? "rgba(255,255,255,0.10)" : level === 70 ? "rgba(255,23,68,0.15)" : "rgba(0,200,83,0.18)"
        ctx.beginPath(); ctx.moveTo(m.left, ly); ctx.lineTo(m.left + cw, ly); ctx.stroke()
      }
      ctx.setLineDash([])

      // RSI line
      ctx.strokeStyle = "rgba(255,23,68,0.75)"; ctx.lineWidth = 1.2
      ctx.beginPath()
      let rsiStarted = false
      for (let i = 0; i < displayData.length; i++) {
        const srcIdx = iStart + i
        if (srcIdx < 0 || srcIdx >= indicators.rsi.length) continue
        const val = indicators.rsi[srcIdx]
        if (val == null) continue
        const x = px(i), y = rsiY(Math.max(0, Math.min(100, val)))
        if (!rsiStarted) { ctx.moveTo(x, y); rsiStarted = true }
        else ctx.lineTo(x, y)
      }
      ctx.stroke()

      // Labels
      ctx.fillStyle = "rgba(255,23,68,0.75)"; ctx.font = "11px inherit"; ctx.textAlign = "left"
      ctx.fillText(tRef.current('chart.rsi14'), m.left + 4, rsiTop + 10)
      ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.textAlign = "right"
      ctx.fillText("70", w - m.right + 2, rsiY(70) + 3)
      ctx.fillText("30", w - m.right + 2, rsiY(30) + 3)
    }

    // ── MACD sub-panel ──
    if (hasMACD) {
      // Compute actual abs max from visible data
      let absMax = 0.0001
      for (let i = 0; i < displayData.length; i++) {
        const srcIdx = iStart + i
        if (srcIdx < 0 || srcIdx >= indicators.macd.macdLine.length) continue
        const v = indicators.macd.macdLine[srcIdx]
        if (v != null && Math.abs(v) > absMax) absMax = Math.abs(v)
      }

      // Zero line
      const zeroY = macdY(0, absMax)
      ctx.strokeStyle = "rgba(255,255,255,0.10)"; ctx.lineWidth = 0.5; ctx.setLineDash([2, 4])
      ctx.beginPath(); ctx.moveTo(m.left, zeroY); ctx.lineTo(m.left + cw, zeroY); ctx.stroke()
      ctx.setLineDash([])

      // MACD histogram bars
      for (let i = 0; i < displayData.length; i++) {
        const srcIdx = iStart + i
        if (srcIdx < 0 || srcIdx >= indicators.macd.histogram.length) continue
        const val = indicators.macd.histogram[srcIdx]
        if (val == null) continue
        const x = px(i), barW = Math.max(1, sp * 0.55)
        const barY = macdY(val, absMax)
        const barH = Math.max(1, Math.abs(barY - zeroY))
        ctx.fillStyle = val >= 0 ? "rgba(0,200,83,0.65)" : "rgba(255,23,68,0.65)"
        ctx.fillRect(x - barW / 2, Math.min(barY, zeroY), barW, barH)
      }

      // Signal line
      ctx.strokeStyle = "rgba(250,204,21,0.65)"; ctx.lineWidth = 1.0
      ctx.beginPath()
      let sigStarted = false
      for (let i = 0; i < displayData.length; i++) {
        const srcIdx = iStart + i
        if (srcIdx < 0 || srcIdx >= indicators.macd.signalLine.length) continue
        const val = indicators.macd.signalLine[srcIdx]
        if (val == null) continue
        const x = px(i), y = macdY(val, absMax)
        if (!sigStarted) { ctx.moveTo(x, y); sigStarted = true }
        else ctx.lineTo(x, y)
      }
      ctx.stroke()

      // MACD line
      ctx.strokeStyle = "rgba(168,85,247,0.6)"; ctx.lineWidth = 1.0
      ctx.beginPath()
      let macdStarted = false
      for (let i = 0; i < displayData.length; i++) {
        const srcIdx = iStart + i
        if (srcIdx < 0 || srcIdx >= indicators.macd.macdLine.length) continue
        const val = indicators.macd.macdLine[srcIdx]
        if (val == null) continue
        const x = px(i), y = macdY(val, absMax)
        if (!macdStarted) { ctx.moveTo(x, y); macdStarted = true }
        else ctx.lineTo(x, y)
      }
      ctx.stroke()

      // Label
      ctx.fillStyle = "rgba(168,85,247,0.7)"; ctx.font = "11px inherit"; ctx.textAlign = "left"
      ctx.fillText(tRef.current('chart.macd'), m.left + 4, macdTop + 10)
    }

    /* ── Drawing preview (mid-placement) ── */
    if (drawingAnchor.current && (drawingMode === 'trendline' || drawingMode === 'fibonacci')) {
      const ax = drawingAnchor.current.x;
      const ay = drawingAnchor.current.y;
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      const previewColor = drawingMode === 'trendline' ? '#3b82f6' : '#a855f7';

      if (drawingMode === 'trendline') {
        // Dashed preview line from anchor to cursor
        ctx.strokeStyle = previewColor; ctx.lineWidth = 1.2; ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(mx, my); ctx.stroke(); ctx.setLineDash([]);
        // Anchor dot
        ctx.fillStyle = previewColor; ctx.beginPath(); ctx.arc(ax, ay, 3, 0, Math.PI * 2); ctx.fill();
      } else {
        // Fibonacci preview — levels between anchor and cursor
        const anchorPrice = drawingAnchor.current.price;
        const cursorPrice = pMax - ((my - m.top) / ch) * (pMax - pMin);
        const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
        FIB_LEVELS.forEach(level => {
          const price = anchorPrice + (cursorPrice - anchorPrice) * level;
          const y = py(price);
          if (y < m.top || y > m.top + ch) return;
          ctx.strokeStyle = previewColor; ctx.lineWidth = 0.8; ctx.setLineDash([4, 6]);
          ctx.beginPath(); ctx.moveTo(m.left, y); ctx.lineTo(m.left + cw, y); ctx.stroke();
          ctx.fillStyle = previewColor; ctx.font = '10px inherit'; ctx.textAlign = 'right';
          ctx.fillText(`${(level * 100).toFixed(1)}% ${price.toFixed(decimals)}`, m.left + cw - 4, y - 2);
        });
        ctx.setLineDash([]);
        ctx.fillStyle = previewColor; ctx.beginPath(); ctx.arc(ax, ay, 3, 0, Math.PI * 2); ctx.fill();
      }
    }

    /* ── Drawing lines ── */
    drawingLines.forEach((dl) => {
      if (dl.type === 'horizontal') {
        const y = py(dl.value);
        if (y < m.top || y > m.top + ch) return;
        ctx.strokeStyle = BLUE; ctx.lineWidth = 1; ctx.setLineDash([6, 3]);
        ctx.beginPath(); ctx.moveTo(m.left, y); ctx.lineTo(m.left + cw, y); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = BLUE; ctx.font = '11px inherit';
        ctx.fillText(dl.value.toFixed(decimals), m.left + 4, y - 4);
      } else if (dl.type === 'trendline') {
        const x1 = px(displayData.findIndex(c => c.t >= dl.x1));
        const y1 = py(dl.y1);
        const x2 = px(displayData.findIndex(c => c.t >= dl.x2));
        const y2 = py(dl.y2);
        // Solid line between anchors
        ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 1.2; ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        // Dashed ray extensions
        ctx.setLineDash([3, 6]);
        const dx = x2 - x1; const dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const ux = dx / len; const uy = dy / len;
        ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 + ux * 2000, y2 + uy * 2000); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - ux * 2000, y1 - uy * 2000); ctx.stroke();
        ctx.setLineDash([]);
        // Anchor dots
        ctx.fillStyle = '#3b82f6'; ctx.beginPath(); ctx.arc(x1, y1, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x2, y2, 2.5, 0, Math.PI * 2); ctx.fill();
      } else if (dl.type === 'fibonacci') {
        const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
        const priceRange = dl.y1 - dl.y2;
        // Tinted zone between 0% and 100%
        const y0 = py(dl.y1); const y100 = py(dl.y2);
        const zoneTop = Math.min(y0, y100); const zoneH = Math.abs(y100 - y0);
        ctx.fillStyle = 'rgba(168,85,247,0.04)';
        ctx.fillRect(m.left, zoneTop, cw, zoneH);
        // Level lines
        FIB_LEVELS.forEach(level => {
          const price = dl.y2 + priceRange * (1 - level);
          const y = py(price);
          if (y < m.top || y > m.top + ch) return;
          // Highlight 0% and 100% slightly thicker
          const isMajor = level === 0 || level === 1 || level === 0.5;
          ctx.strokeStyle = 'rgba(168,85,247,0.55)'; ctx.lineWidth = isMajor ? 1 : 0.6;
          ctx.setLineDash(isMajor ? [8, 3] : [4, 6]);
          ctx.beginPath(); ctx.moveTo(m.left, y); ctx.lineTo(m.left + cw, y); ctx.stroke();
          ctx.fillStyle = 'rgba(168,85,247,0.8)'; ctx.font = '10px inherit';
          ctx.textAlign = level > 0.5 ? 'left' : 'right';
          const labelX = level > 0.5 ? m.left + 4 : m.left + cw - 4;
          ctx.fillText(`${(level * 100).toFixed(1)}% ${price.toFixed(decimals)}`, labelX, y - 2);
        });
        ctx.setLineDash([]);
        // Anchor dots
        const fx1 = px(displayData.findIndex(c => c.t >= dl.x1));
        const fy1 = py(dl.y1); const fy2 = py(dl.y2);
        ctx.fillStyle = '#a855f7'; ctx.beginPath(); ctx.arc(fx1, fy1, 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(fx1, fy2, 2.5, 0, Math.PI * 2); ctx.fill();
      } else {
        // Vertical line (legacy — by timestamp index)
        const x = px(dl.value);
        if (x < m.left || x > m.left + cw) return;
        ctx.strokeStyle = BLUE; ctx.lineWidth = 1; ctx.setLineDash([6, 3]);
        ctx.beginPath(); ctx.moveTo(x, m.top); ctx.lineTo(x, m.top + ch); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = BLUE; ctx.font = '11px inherit'; ctx.textAlign = 'center';
        ctx.fillText(fmtTime(dl.value), x, m.top - 4);
      }
    });

    /* ── Order Book (DOM) ── */
    if (orderBook && orderBook.bids) {
      const obWidth = 66;
      const obLeft = m.left + 4;
      const midY = py((orderBook.bids[0]?.price + orderBook.asks[0]?.price) / 2 || displayData[displayData.length - 1]?.c || 1);

      // Mid-price line
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(obLeft, midY); ctx.lineTo(obLeft + obWidth, midY); ctx.stroke();

      // Ask levels (red, above mid)
      for (const a of orderBook.asks) {
        const y = py(a.price);
        if (y < m.top || y > m.top + ch) continue;
        const w = Math.max(1, a.pct * obWidth);
        ctx.fillStyle = 'rgba(255,23,68,0.22)';
        ctx.fillRect(obLeft, y - 1, w, 2);
      }

      // Bid levels (green, below mid)
      for (const b of orderBook.bids) {
        const y = py(b.price);
        if (y < m.top || y > m.top + ch) continue;
        const w = Math.max(1, b.pct * obWidth);
        ctx.fillStyle = 'rgba(0,200,83,0.22)';
        ctx.fillRect(obLeft, y - 1, w, 2);
      }

      // DOM label
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.font = 'bold 8px Inter, system-ui, sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(tRef.current('chart.dom'), obLeft, m.top + 10);
    }

    /* ── Volume Profile ── */
    if (volumeProfile && volumeProfile.length > 0) {
      const vpWidth = 72;  // max bar width in px
      const vpRight = m.left + cw - 6;  // anchored to right side
      const barH = Math.max(1, (ch / volumeProfile.length) - 1);

      for (let i = 0; i < volumeProfile.length; i++) {
        const bin = volumeProfile[i];
        const y = py(bin.price);
        if (y < m.top || y > m.top + ch) continue;

        const w = Math.max(1, bin.pct * vpWidth);

        // Bar fill
        ctx.fillStyle = 'rgba(41,121,255,0.18)';
        ctx.fillRect(vpRight - w, y - barH / 2, w, barH);

        // Bar border (right edge only)
        ctx.fillStyle = 'rgba(41,121,255,0.35)';
        ctx.fillRect(vpRight - 1, y - barH / 2, 1, barH);

        // POC (Point of Control) — highest volume level highlighted
        if (bin.pct > 0.85) {
          ctx.fillStyle = 'rgba(41,121,255,0.30)';
          ctx.fillRect(vpRight - w, y - barH / 2, w, barH);
        }
      }

      // VP right-edge separator line
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(vpRight + 2, m.top); ctx.lineTo(vpRight + 2, m.top + ch); ctx.stroke();
    }

    /* ── Trade markers — entry/exit dots + info badges + TP/SL lines ── */
    if (tradeMarkers.length > 0) {
      for (const tm of tradeMarkers) {
        const isCall = tm.direction === 'call';
        const isOpen = tm.status === 'open';
        const isWin = tm.status === 'win';

        const statusColor = isOpen ? '#f57b00' : isWin ? GREEN : RED;
        const statusGlow = isOpen ? 'rgba(245,123,0,0.30)' : isWin ? 'rgba(0,200,83,0.28)' : 'rgba(255,23,68,0.28)';
        const statusBg = isOpen ? 'rgba(245,123,0,0.10)' : isWin ? 'rgba(0,200,83,0.08)' : 'rgba(255,23,68,0.08)';

        // Find entry point x position
        let entryIdx
        if (isOpen) {
          entryIdx = displayData.length - 1
        } else {
          const openTimeSec = tm.openTime > 1e12 ? Math.floor(tm.openTime / 1000) : tm.openTime
          let bestIdx = -1, bestDiff = Infinity
          for (let i = 0; i < displayData.length; i++) {
            const ct = displayData[i].t > 1e12 ? Math.floor(displayData[i].t / 1000) : displayData[i].t
            const diff = Math.abs(ct - openTimeSec)
            if (diff < bestDiff) { bestDiff = diff; bestIdx = i }
          }
          entryIdx = bestDiff < 300 ? bestIdx : -1
        }
        if (entryIdx < 0) continue

        const ex = px(entryIdx);
        const ey = py(tm.entry);
        const inView = ey >= m.top && ey <= m.top + ch;

        // ── Entry dot ──
        if (ex != null && inView) {
          // Subtle glow
          ctx.fillStyle = statusGlow;
          ctx.beginPath(); ctx.arc(ex, ey, 7, 0, Math.PI * 2); ctx.fill();
          // Solid center
          ctx.fillStyle = statusColor;
          ctx.beginPath(); ctx.arc(ex, ey, 4, 0, Math.PI * 2); ctx.fill();
          // White border ring
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(ex, ey, 4, 0, Math.PI * 2); ctx.stroke();

          // ── Floating label (text only, no background shape) ──
          const dirLabel = isCall ? tRef.current('common.call') : tRef.current('common.put');

          // Build result line based on status
          let infoLine, infoColor
          if (isOpen) {
            infoLine = `$${tm.amount}  ${tm.entry.toFixed(decimals)}`;
            infoColor = TEXT;
          } else if (isWin) {
            const pct = tm.payoutPercent || 82;
            infoLine = `$${tm.amount}  +$${Math.abs(tm.pnl || 0).toFixed(2)} (${pct}%)`;
            infoColor = GREEN;
          } else {
            infoLine = `$${tm.amount}  -$${Math.abs(tm.pnl || tm.amount).toFixed(2)}`;
            infoColor = RED;
          }

          ctx.font = 'bold 10px Inter, system-ui, sans-serif';
          const dirW = ctx.measureText(dirLabel).width;
          ctx.font = '10px Inter, system-ui, sans-serif';
          const infoW = ctx.measureText(infoLine).width;

          // Place text to the right of the dot, vertically centered on it
          const textX = ex + 9;
          const textY = ey + 4;

          ctx.textAlign = 'left';
          // Direction label in status color
          ctx.font = 'bold 10px Inter, system-ui, sans-serif';
          ctx.fillStyle = statusColor;
          ctx.fillText(dirLabel, textX, textY);
          // Info line in muted/result color
          ctx.font = '10px Inter, system-ui, sans-serif';
          ctx.fillStyle = infoColor;
          ctx.fillText(infoLine, textX + dirW + 6, textY);
        }

        // ── TP / SL lines (open positions only) ──
        if (isOpen) {
          if (tm.tp && tm.tp > 0) {
            const tpy = py(tm.tp);
            if (tpy >= m.top && tpy <= m.top + ch) {
              // TP line
              ctx.strokeStyle = GREEN; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
              ctx.beginPath(); ctx.moveTo(m.left, tpy); ctx.lineTo(m.left + cw, tpy); ctx.stroke(); ctx.setLineDash([]);
              // TP label pill
              const tpLabel = `TP ${tm.tp.toFixed(decimals)}`;
              ctx.font = 'bold 9px Inter, system-ui, sans-serif';
              const tpw = ctx.measureText(tpLabel).width + 10;
              ctx.fillStyle = 'rgba(10,11,15,0.9)';
              roundRect(ctx, m.left + cw - tpw - 4, tpy - 9, tpw, 16, 4); ctx.fill();
              ctx.strokeStyle = GREEN; ctx.lineWidth = 0.7;
              roundRect(ctx, m.left + cw - tpw - 4, tpy - 9, tpw, 16, 4); ctx.stroke();
              ctx.fillStyle = GREEN; ctx.textAlign = 'center';
              ctx.fillText(tpLabel, m.left + cw - tpw / 2 - 4, tpy + 3);
            }
          }
          if (tm.sl && tm.sl > 0) {
            const sly = py(tm.sl);
            if (sly >= m.top && sly <= m.top + ch) {
              // SL line
              ctx.strokeStyle = RED; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
              ctx.beginPath(); ctx.moveTo(m.left, sly); ctx.lineTo(m.left + cw, sly); ctx.stroke(); ctx.setLineDash([]);
              // SL label pill
              const slLabel = `SL ${tm.sl.toFixed(decimals)}`;
              ctx.font = 'bold 9px Inter, system-ui, sans-serif';
              const slw = ctx.measureText(slLabel).width + 10;
              ctx.fillStyle = 'rgba(10,11,15,0.9)';
              roundRect(ctx, m.left + cw - slw - 4, sly - 9, slw, 16, 4); ctx.fill();
              ctx.strokeStyle = RED; ctx.lineWidth = 0.7;
              roundRect(ctx, m.left + cw - slw - 4, sly - 9, slw, 16, 4); ctx.stroke();
              ctx.fillStyle = RED; ctx.textAlign = 'center';
              ctx.fillText(slLabel, m.left + cw - slw / 2 - 4, sly + 3);
            }
          }
          // Entry price label right-aligned (subtle)
          if (inView) {
            ctx.font = '9px Inter, system-ui, sans-serif';
            ctx.fillStyle = 'rgba(245,123,0,0.35)';
            ctx.textAlign = 'right';
            ctx.fillText(tm.entry.toFixed(decimals), m.left + cw - 4, ey + 3);
          }
        }

        // ── Closed position: exit marker + connector ──
        if (!isOpen && tm.exitPrice && tm.closedAt) {
          const closedSec = tm.closedAt > 1e12 ? Math.floor(tm.closedAt / 1000) : tm.closedAt;
          const exitIdx = displayData.findIndex(c => {
            const ct = c.t > 1e12 ? Math.floor(c.t / 1000) : c.t;
            return ct >= closedSec;
          });
          if (exitIdx >= 0) {
            const xx = px(exitIdx);
            const xy = py(tm.exitPrice);
            if (xy >= m.top && xy <= m.top + ch) {
              // Dashed connector from entry to exit
              if (ex != null) {
                ctx.strokeStyle = isWin ? 'rgba(0,200,83,0.30)' : 'rgba(255,23,68,0.30)';
                ctx.lineWidth = 0.8; ctx.setLineDash([3, 5]);
                ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(xx, xy); ctx.stroke(); ctx.setLineDash([]);
              }
              // Exit dot
              ctx.fillStyle = isWin ? GREEN : RED;
              ctx.beginPath(); ctx.arc(xx, xy, 3, 0, Math.PI * 2); ctx.fill();
              ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.8;
              ctx.beginPath(); ctx.arc(xx, xy, 3, 0, Math.PI * 2); ctx.stroke();
              // Close reason badge (tiny)
              const reasonMap = { tp: tRef.current('common.tp'), sl: tRef.current('common.sl'), early_close: tRef.current('common.closed'), expired: tRef.current('common.expired') };
              const reason = reasonMap[tm.closeReason] || tRef.current('common.closed');
              ctx.font = 'bold 8px Inter, system-ui, sans-serif';
              const rw = ctx.measureText(reason).width + 8;
              ctx.fillStyle = 'rgba(10,11,15,0.85)';
              roundRect(ctx, xx - rw / 2, xy - 20, rw, 14, 3); ctx.fill();
              ctx.fillStyle = isWin ? GREEN : RED; ctx.textAlign = 'center';
              ctx.fillText(reason, xx, xy - 9);
            }
          }
        }
      }
    }

    /* Last price line — dotted from last candle to right axis, below border/axis */
    { const _displayData = displayData; if (_displayData.length) {
      const lastIdx = _displayData.length - 1;
      const lastPrice = safeN(_displayData[lastIdx].c);
      const ly = py(lastPrice);
      const lineStartX = px(lastIdx);
      const axisStartX = m.left + cw;
      const lineEndX = axisStartX + 4;
      const glowPhase = (Date.now() % 2000) / 2000;

      // Dotted line
      ctx.strokeStyle = GREEN; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(lineStartX, ly);
      ctx.lineTo(lineEndX, ly); ctx.stroke(); ctx.setLineDash([]);

      // Glowing dot on the LEFT end
      ctx.save();
      ctx.shadowColor = GREEN;
      ctx.shadowBlur = 4 + 3 * Math.sin(glowPhase * Math.PI * 2);
      ctx.restore();

      // Price label at right axis (text only)
      ctx.font = "bold 11px Inter, system-ui, sans-serif"; ctx.textAlign = "right";
      ctx.fillStyle = GREEN;
      ctx.fillText(lastPrice.toFixed(decimals), w - 6, ly + 4);
    }}

    /* Chart border */
    ctx.strokeStyle = BORDER; ctx.lineWidth = 1; ctx.strokeRect(m.left, m.top, cw, ch);

    /* Market closed */
    if (!marketOpen && displayData.length) {
      ctx.fillStyle = CLOSED_OVERLAY; ctx.fillRect(m.left, m.top, cw, ch);
      ctx.fillStyle = "#f59e0b"; ctx.font = "bold 14px inherit"; ctx.textAlign = "center";
      ctx.fillText(tRef.current('chart.marketClosed'), m.left + cw / 2, m.top + ch / 2 - 8);
      ctx.fillStyle = TEXT; ctx.font = "11px 'Inter', sans-serif";
      ctx.fillText(tRef.current('chart.showingHistorical'), m.left + cw / 2, m.top + ch / 2 + 14);
    }

    needsRedraw.current = false;
    // Count down animation gate: frame 1 (mount) + frame 2 (first tick) = instant.
    // Frame 3 onward = smooth interpolation enabled.
    if (skipAnimRef.current > 0) skipAnimRef.current--;

    /* Snap layout to state for JSX crosshair — only update when values actually change */
    const prevLayout = prevLayoutRef.current;
    const curLayout = layoutRef.current;
    if (!prevLayout
      || prevLayout.canvasW !== curLayout.canvasW
      || prevLayout.chartW !== curLayout.chartW
      || prevLayout.chartH !== curLayout.chartH
      || prevLayout.priceMin !== curLayout.priceMin
      || prevLayout.priceMax !== curLayout.priceMax
      || prevLayout.margin.top !== curLayout.margin.top
      || prevLayout.margin.right !== curLayout.margin.right
    ) {
      prevLayoutRef.current = { ...curLayout };
      setLayoutSnap(curLayout);
    }
  }, [decimals, marketOpen, chartType, candleWidthMode, showGrid, drawingLines, indicators, drawingMode, tradeMarkers, volumeProfile, mtfCandles, orderBook, customIndicators, tfMs]);

  /* ── rAF-driven change detection (independent of React render ticks) ── */
  const detectDataChanges = useCallback(() => {
    const candles = candlesRef.current
    if (candles.length === 0) { interpRef.current = null; lastCandleRef.current = null; skipAnimRef.current = 2; return }

    const latest = candles[candles.length - 1]
    const firstT = candles[0]?.t || 0
    const key = `${firstT}-${candles.length}`
    const snap = dataSnapshotRef.current

    // Data reset detection (fetchCandles replacing tick-built candles, or symbol change)
    if (snap.key && key !== snap.key) {
      const [oldFirstT, oldLen] = snap.key.split("-").map(Number)
      if (Math.abs(candles.length - oldLen) > 50 || (firstT > 0 && firstT !== oldFirstT)) {
        // Clear interpolation state only — do NOT reset zoom/pan.
        // Symbol changes remount the component via the key prop (zoom IIFE handles it).
        // Data refreshes should preserve the user's current zoom level.
        lastCandleRef.current = null; interpRef.current = null
        candlesTransitionRef.current = null; prevCandlesRef.current = []
        smoothBoundsRef.current = null
        skipAnimRef.current = 2  // re-enable instant-render gate
        dataSnapshotRef.current = { key, length: candles.length, lastT: latest.t }
        needsRedraw.current = true
        return
      }
    }

    // First data or new tab
    if (!lastCandleRef.current) {
      lastCandleRef.current = latest
      prevCandlesRef.current = [...candles]
      dataSnapshotRef.current = { key, length: candles.length, lastT: latest.t }
      needsRedraw.current = true
      return
    }

    // Candle array structural change (new candle appended or old removed)
    const prevLen = prevCandlesRef.current.length
    if (candles.length !== prevLen) {
      candlesTransitionRef.current = { from: [...prevCandlesRef.current], to: [...candles], startTime: Date.now() }
      prevCandlesRef.current = [...candles]
    }

    // Live candle update — only interpolate if OHLC actually changed
    if (latest.t !== lastCandleRef.current.t || latest.o !== lastCandleRef.current.o ||
        latest.h !== lastCandleRef.current.h || latest.l !== lastCandleRef.current.l ||
        latest.c !== lastCandleRef.current.c) {
      interpRef.current = { from: { ...lastCandleRef.current }, to: { ...latest }, startTime: Date.now() }
      lastCandleRef.current = latest
      needsRedraw.current = true
    }

    dataSnapshotRef.current = { key, length: candles.length, lastT: latest.t }
  }, [getStoredZoom, getInitialZoom])

  /* ═══════════════ PHYSICS STEP ═══════════════ */
  const physicsStep = useCallback(() => {
    let changed = false;
    const cLen = candlesRef.current.length;

    if (Math.abs(zoomVelocity.current) > ZOOM_MIN_VELOCITY) {
      const len = Math.max(1, cLen);
      const step = Math.max(1, Math.floor(len * ZOOM_STEP_BASE));
      const delta = zoomVelocity.current * step;
      if (zoomTarget.current === 0 && delta < 0) zoomTarget.current = len;
      let nextZoom = zoomTarget.current + delta;
      // Snap to nice numbers when velocity is low
      if (Math.abs(zoomVelocity.current) < ZOOM_SNAP_THRESHOLD) {
        const snapCandidates = [10, 20, 30, 50, 60, 80, 100, 150, 200, 300, 500];
        for (const s of snapCandidates) {
          if (Math.abs(nextZoom - s) < s * 0.15) { nextZoom = s; break; }
        }
      }
      zoomTarget.current = Math.max(MIN_ZOOM_BARS, Math.min(MAX_ZOOM_BARS, Math.min(len, nextZoom)));
      if (zoomTarget.current >= len - 1) zoomTarget.current = Math.max(MIN_ZOOM_BARS, len - 1);
      zoomVelocity.current *= ZOOM_FRICTION;
      if (Math.abs(zoomVelocity.current) <= ZOOM_MIN_VELOCITY) {
        zoomVelocity.current = 0;
        setStoredZoom(zoomTarget.current);
      }
      changed = true;
    }

    if (!isDragging.current && Math.abs(panVelocity.current) > PAN_MIN_VELOCITY) {
      const barsPerPx = layoutRef.current.barSpacing > 0 ? 1 / layoutRef.current.barSpacing : 0.05;
      panOffset.current += panVelocity.current * barsPerPx;
      panVelocity.current *= PAN_FRICTION;

      const maxPan = cLen - (zoomTarget.current > 0 ? zoomTarget.current : cLen);
      const maxPanPx = maxPan > 0 ? maxPan * layoutRef.current.barSpacing : 0;
      if (panOffset.current > PAN_OVERSHOOT_LIMIT) {
        panOffset.current -= (panOffset.current - PAN_OVERSHOOT_LIMIT) * PAN_SPRING_BACK * 4;
        panVelocity.current *= 0.6;
      } else if (panOffset.current < -maxPanPx / (layoutRef.current.barSpacing || 1) - PAN_OVERSHOOT_LIMIT) {
        const overshoot = panOffset.current + maxPanPx / (layoutRef.current.barSpacing || 1) + PAN_OVERSHOOT_LIMIT;
        panOffset.current -= overshoot * PAN_SPRING_BACK * 4;
        panVelocity.current *= 0.6;
      }

      if (Math.abs(panVelocity.current) <= PAN_MIN_VELOCITY) panVelocity.current = 0;
      changed = true;
    }

    if (changed) needsRedraw.current = true;
    // Persist zoom when pan inertia settles
    if (!isDragging.current && panVelocity.current === 0 && zoomVelocity.current === 0 && zoomTarget.current > 0) {
      setStoredZoom(zoomTarget.current);
    }
  }, [setStoredZoom]);

  /* ═══════════════ FRAME LOOP (ref-based to avoid self-reference) ═══════════════ */
  const stepFn = useCallback(() => {
    detectDataChanges();   // rAF-driven, independent of React render ticks
    physicsStep();         // let zoom/pan momentum decay naturally
    // trading-charts pattern: skip rendering when tab is backgrounded.
    // When the user returns, interpolation timeouts self-correct (clamped t=1).
    if (!document.hidden && needsRedraw.current) drawFrame();
    rafId.current = requestAnimationFrame(frameFnRef.current);
  }, [detectDataChanges, physicsStep, drawFrame]);

  // Reset interpolation on tab return — prevents stale animation catch-up
  useEffect(() => {
    const onVis = () => { if (!document.hidden) { skipAnimRef.current = 2; needsRedraw.current = true; } };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  /* Keep the ref updated so the rAF callback always calls the latest stepFn */
  useEffect(() => { frameFnRef.current = stepFn; }, [stepFn]);

  useEffect(() => {
    rafId.current = requestAnimationFrame(frameFnRef.current);
    return () => cancelAnimationFrame(rafId.current);
  }, []);

  /* ── UI config changes → mark dirty (candle data changes handled by detectDataChanges in rAF loop) ── */
  useEffect(() => { needsRedraw.current = true; }, [decimals, marketOpen, chartType, candleWidthMode, showGrid, drawingLines, indicators, drawingMode]);

  /* ── Timeframe switch: load stored zoom for new persistKey, keep current if none ── */
  const prevPersistKeyRef = useRef(persistKey);
  useEffect(() => {
    if (persistKey === prevPersistKeyRef.current) return;
    prevPersistKeyRef.current = persistKey;
    // Try to load stored zoom for the new timeframe
    let storedZoom = 0;
    try {
      const raw = localStorage.getItem(ZOOM_STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        storedZoom = data[persistKey] || 0;
      }
    } catch { /* noop */ }
    if (storedZoom > 0) {
      // Use stored zoom for this timeframe
      zoomTarget.current = storedZoom;
      zoomVelocity.current = 0;
      panOffset.current = 0;
      panVelocity.current = 0;
      smoothBoundsRef.current = null;
      needsRedraw.current = true;
    }
    // If no stored zoom, keep current zoom level — inherits from previous timeframe
  }, [persistKey]);

  /* ── Reset zoom/pan/physics on tab open/close ── */
  useEffect(() => {
    if (resetKey === 0) return; // skip initial mount
    zoomTarget.current = getInitialZoom(); // show most recent ~80 candles
    zoomVelocity.current = 0;
    panOffset.current = 0;     // scroll to rightmost (current) candles
    panVelocity.current = 0;
    smoothBoundsRef.current = null;
    lastCandleRef.current = null;
    interpRef.current = null;
    candlesTransitionRef.current = null;
    prevCandlesRef.current = [];
    needsRedraw.current = true;
  }, [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ═══════════════ INPUT HANDLERS ═══════════════ */

  const handleMouseMove = useCallback((e) => {
    const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return;
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    mouseRef.current = { x: mx, y: my };

    // In drawing modes, track mouse for preview but skip crosshair/tooltip
    if (drawingMode !== 'off') {
      needsRedraw.current = true;  // trigger redraw for preview
      return;
    }
    setMouse({ x: mx, y: my });

    if (isDragging.current) {
      const dx = mx - dragLastX.current;
      const now = performance.now();
      const dt = Math.max(1, now - dragLastTime.current);
      panVelocity.current = (dx / dt) * 16;
      const L = layoutRef.current;
      if (L.barSpacing > 0) {
        const barDelta = dx / L.barSpacing;
        const maxPan = candles.length - (zoomTarget.current > 0 ? zoomTarget.current : candles.length);
        if (panOffset.current + barDelta > PAN_OVERSHOOT_LIMIT) {
          panOffset.current += barDelta * PAN_OVERSCROLL_RESISTANCE;
        } else if (panOffset.current + barDelta < -maxPan - PAN_OVERSHOOT_LIMIT) {
          panOffset.current += barDelta * PAN_OVERSCROLL_RESISTANCE;
        } else {
          panOffset.current += barDelta;
        }
      }
      dragLastX.current = mx;
      dragLastTime.current = now;
      needsRedraw.current = true;
      return;
    }

    const L = layoutRef.current;
    const visible = getVisibleCandles();
    if (visible.length === 0 || mx < L.margin.left || mx > L.margin.left + L.chartW) { setTooltip(null); return; }
    const idx = L.toIdx(mx);
    if (idx >= 0 && idx < visible.length) {
      setTooltip({ x: mx + 10, y: Math.min(my, rect.height - 80), candle: visible[idx], idx });
    } else { setTooltip(null); }
  }, [getVisibleCandles]);

  const handleMouseDown = useCallback((e) => {
    const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return;
    const L = layoutRef.current;
    if (L.chartW <= 0) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (drawingMode === 'horizontal') {
      // Place horizontal line at clicked price level
      const price = L.priceMax - ((my - L.margin.top) / L.chartH) * (L.priceMax - L.priceMin);
      if (my >= L.margin.top && my <= L.margin.top + L.chartH) {
        setDrawingLines(prev => [...prev, { type: 'horizontal', value: parseFloat(price.toFixed(decimals)) }]);
      }
      return;
    }

    if (drawingMode === 'trendline' || drawingMode === 'fibonacci') {
      if (drawingAnchor.current) {
        // Second click — complete the drawing
        const visible = getVisibleCandles();
        const anchorPrice = drawingAnchor.current.price;
        const anchorTime = drawingAnchor.current.time;
        const currentPrice = L.priceMax - ((my - L.margin.top) / L.chartH) * (L.priceMax - L.priceMin);
        const idx = L.toIdx(mx);
        const currentTime = visible[idx]?.t || Date.now();
        if (drawingMode === 'trendline') {
          setDrawingLines(prev => [...prev, {
            type: 'trendline',
            x1: anchorTime, y1: anchorPrice,
            x2: currentTime, y2: parseFloat(currentPrice.toFixed(decimals)),
          }]);
        } else {
          setDrawingLines(prev => [...prev, {
            type: 'fibonacci',
            x1: anchorTime, y1: anchorPrice,
            x2: currentTime, y2: parseFloat(currentPrice.toFixed(decimals)),
          }]);
        }
        drawingAnchor.current = null;
        needsRedraw.current = true;
        return;
      }
      // First click — set anchor
      const visible = getVisibleCandles();
      const anchorIdx = L.toIdx(mx);
      const anchorPrice = L.priceMax - ((my - L.margin.top) / L.chartH) * (L.priceMax - L.priceMin);
      drawingAnchor.current = {
        x: mx, y: my,
        time: visible[anchorIdx]?.t || Date.now(),
        price: parseFloat(anchorPrice.toFixed(decimals)),
      };
      needsRedraw.current = true;
      return;
    }

    // Cursor mode — begin pan
    isDragging.current = true; setIsDraggingUI(true); panVelocity.current = 0;
    dragLastX.current = mx;
    dragLastTime.current = performance.now();
  }, [drawingMode, decimals, getVisibleCandles]);

  const handleMouseUp = useCallback(() => {
    if (drawingMode !== 'off') return
    isDragging.current = false; setIsDraggingUI(false)
  }, [drawingMode]);
  const handleMouseLeave = useCallback(() => {
    setMouse(null); setTooltip(null);
    isDragging.current = false; setIsDraggingUI(false);
    drawingAnchor.current = null;  // cancel mid-placement on leave
    needsRedraw.current = true;
  }, []);

  /* Keyboard: Escape cancels drawing anchor or clears drawings */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (drawingAnchor.current) {
        drawingAnchor.current = null;
        needsRedraw.current = true;
      } else if (drawingMode !== 'off') {
        window.dispatchEvent(new CustomEvent('pit-drawing-mode', { detail: 'off' }));
      } else {
        setDrawingLines([]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawingMode]);

  /* Wheel: velocity-accumulating zoom (attached via ref for non-passive) */
  const lastWheelTime = useRef(0);

  const zoomIn = useCallback(() => {
    const len = candlesRef.current.length;
    zoomTarget.current = zoomTarget.current === 0
      ? Math.max(MIN_ZOOM_BARS, Math.floor(len * 0.7))
      : Math.max(MIN_ZOOM_BARS, Math.floor(zoomTarget.current * 0.7));
    zoomVelocity.current = 0; panVelocity.current = 0;
    setStoredZoom(zoomTarget.current);
    needsRedraw.current = true;
  }, [setStoredZoom]);

  const zoomOut = useCallback(() => {
    const len = candlesRef.current.length;
    if (zoomTarget.current === 0) return;
    const next = Math.floor(zoomTarget.current * 1.4);
    zoomTarget.current = next >= len - 2 ? 0 : Math.min(len, next);
    zoomVelocity.current = 0; panVelocity.current = 0;
    setStoredZoom(zoomTarget.current);
    needsRedraw.current = true;
  }, [setStoredZoom]);

  useEffect(() => {
    const onZI = () => zoomIn(); const onZO = () => zoomOut();
    const onCL = () => { setDrawingLines([]); drawingAnchor.current = null; };
    const onCancel = () => { drawingAnchor.current = null; needsRedraw.current = true; };
    window.addEventListener("pit-zoom-in", onZI);
    window.addEventListener("pit-zoom-out", onZO);
    window.addEventListener("pit-clear-drawings", onCL);
    window.addEventListener("pit-clear-anchor", onCancel);
    return () => {
      window.removeEventListener("pit-zoom-in", onZI);
      window.removeEventListener("pit-zoom-out", onZO);
      window.removeEventListener("pit-clear-drawings", onCL);
      window.removeEventListener("pit-clear-anchor", onCancel);
    };
  }, [zoomIn, zoomOut]);

  const handleDoubleClick = useCallback((e) => {
    const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return;
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const L = layoutRef.current;
    if (mx < L.margin.left || mx > L.margin.left + L.chartW) return;
    const priceAtY = L.priceMax - ((my - L.margin.top) / L.chartH) * (L.priceMax - L.priceMin);
    setDrawingLines((prev) => [...prev, { id: idCounter++, type: "horizontal", value: priceAtY }]);
  }, []);

  const handleContextMenu = useCallback((e) => {
    e.preventDefault(); setDrawingLines((prev) => prev.slice(0, -1));
  }, []);

  /* ResizeObserver — debounced to prevent rapid resize thrashing */
  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    let timer;
    const ro = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => { needsRedraw.current = true; }, 60);
    });
    ro.observe(c);
    return () => { ro.disconnect(); clearTimeout(timer); };
  }, []);

  /* Wheel listener — on canvas for direct capture (bypass parent overflow:hidden) */
  useEffect(() => {
    const el = canvasRef.current; if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const now = performance.now();
      const dt = Math.max(1, now - lastWheelTime.current);
      lastWheelTime.current = now;
      const timeNormalized = e.deltaY * ZOOM_VELOCITY_SCALE * Math.min(1, 16 / dt);
      zoomVelocity.current = Math.max(-8, Math.min(8, zoomVelocity.current + timeNormalized));
      panVelocity.current *= 0.5;
      needsRedraw.current = true;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  /* ── For JSX crosshair: layoutSnap.chartW > 0 already signals a rendered chart ── */

  return (
    <div ref={containerRef} className="canvas-chart-container">
      <canvas ref={canvasRef}
        className={`canvas-chart-canvas ${isDraggingUI ? "canvas-grabbing" : "canvas-crosshair"}`}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
      />

      {/* Crosshair SVG — uses layoutSnap (state, not ref) */}
      {mouse && layoutSnap.chartW > 0 &&
        mouse.x >= layoutSnap.margin.left && mouse.x <= layoutSnap.margin.left + layoutSnap.chartW && (() => {
          const crossPrice = layoutSnap.priceMax - ((mouse.y - layoutSnap.margin.top) / layoutSnap.chartH) * (layoutSnap.priceMax - layoutSnap.priceMin);
          // Crosshair price label — at right axis column overlaid on scale values
          const priceStr = crossPrice.toFixed(decimals);
          const estChars = priceStr.length;
          const labelW = estChars * 6.5 + 12;
          const labelH = 15;
          // Right edge same as axis labels: right = canvasW - margin.right + (margin.right - labelW)/2
          // Simply: chartArea.right + margin.right - labelW - some padding
          const rightEdge = layoutSnap.margin.left + layoutSnap.chartW + layoutSnap.margin.right;
          const labelX = rightEdge - labelW - 6;
          const labelY = Math.max(layoutSnap.margin.top, Math.min(layoutSnap.margin.top + layoutSnap.chartH - labelH, mouse.y - labelH / 2));
          return (
        <svg style={{ position: "absolute", inset: 0, pointerEvents: "none", width: "100%", height: "100%" }}>
          <line x1={mouse.x} y1={layoutSnap.margin.top} x2={mouse.x} y2={layoutSnap.margin.top + layoutSnap.chartH}
            stroke={XHAIR} strokeWidth={1} strokeDasharray="4 2" />
          <line x1={layoutSnap.margin.left} y1={mouse.y} x2={layoutSnap.margin.left + layoutSnap.chartW} y2={mouse.y}
            stroke={XHAIR} strokeWidth={1} strokeDasharray="4 2" />
          {/* Right-scale price label — overlaid on axis value column */}
          <g>
            <rect x={labelX} y={labelY} width={labelW} height={labelH} rx={3}
              fill="rgba(10,12,18,0.85)" stroke="rgba(245,123,0,0.2)" strokeWidth={0.5} />
            <text x={labelX + labelW / 2} y={labelY + labelH / 2 + 1}
              textAnchor="middle" dominantBaseline="central"
              fill="#e8edf5" fontFamily="inherit" fontSize={11} fontWeight={600}>
              {priceStr}
            </text>
          </g>
        </svg>
          );
        })()
      }

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position: "absolute", left: tooltip.x, top: tooltip.y, pointerEvents: "none",
          background: TOOLTIP_BG, border: "1px solid rgba(245,123,0,0.25)", borderRadius: 6,
          padding: "6px 10px", fontFamily: "inherit", fontSize: 11,
          color: "#e8eaf0", lineHeight: 1.6, zIndex: 50, whiteSpace: "nowrap",
          boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
        }}>
          <div style={{ color: "#5c6578", marginBottom: 2 }}>{fmtTime(tooltip.candle.t)}</div>
          <div>{t('chart.open')} <span>{safeN(tooltip.candle.o).toFixed(decimals)}</span></div>
          <div>{t('chart.high')} <span>{safeN(tooltip.candle.h).toFixed(decimals)}</span></div>
          <div>{t('chart.low')} <span>{safeN(tooltip.candle.l).toFixed(decimals)}</span></div>
          <div>{t('chart.close')} <span style={{ color: safeN(tooltip.candle.c) >= safeN(tooltip.candle.o) ? GREEN : RED }}>
            {safeN(tooltip.candle.c).toFixed(decimals)}
          </span></div>
        </div>
      )}

      {/* In-canvas zoom buttons */}
      {candles.length > 0 && (
        <div className="blg-zoom-btns">
          <button className="blg-zoom-btn" onClick={zoomIn} title={t('chart.zoomIn')}><ZoomIn size={14} /></button>
          <button className="blg-zoom-btn" onClick={zoomOut} title={t('chart.zoomOut')}><ZoomOut size={14} /></button>
        </div>
      )}

      {drawingLines.length > 0 && (
        <button className="blg-clear-drawings" onClick={() => setDrawingLines([])} title={t('chart.clearDrawings')}>X</button>
      )}
    </div>
  );
};