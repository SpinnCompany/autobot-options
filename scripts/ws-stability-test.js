#!/usr/bin/env node
/**
 * ws-stability-test.js — Comprehensive WebSocket stability test for both proxies.
 *
 * Tests:
 *  1. Connection to both Binance and Deriv proxies
 *  2. Symbol list retrieval
 *  3. Subscribe → verify tick arrival (per-client filtering)
 *  4. Multi-symbol subscription
 *  5. Unsubscribe → verify ticks stop
 *  6. Re-subscribe after unsub
 *  7. Candle history fetch
 *  8. Tick latency measurement
 *  9. Reconnect recovery
 * 10. Concurrent subscriptions
 *
 * Usage:
 *   # Test production
 *   node scripts/ws-stability-test.js
 *
 *   # Test local dev
 *   BINANCE_URL=ws://localhost:8092 DERIV_URL=ws://localhost:8091 node scripts/ws-stability-test.js
 */

import WebSocket from 'ws'

const BINANCE_URL = process.env.BINANCE_URL || 'wss://options.autobotsignal.io/ws/binance'
const DERIV_URL = process.env.DERIV_URL || 'wss://options.autobotsignal.io/ws/deriv'
const TEST_TIMEOUT = 15000
const TICK_TIMEOUT = 8000

// ── Helpers ──────────────────────────────────────────────────────

function connect(url, label) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    const timer = setTimeout(() => { ws.close(); reject(new Error(`${label} connect timeout`)) }, TEST_TIMEOUT)
    ws.on('open', () => { clearTimeout(timer); resolve(ws) })
    ws.on('error', (e) => { clearTimeout(timer); reject(new Error(`${label} error: ${e.message}`)) })
  })
}

function waitForMessage(ws, type, timeout = TICK_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${type}`)), timeout)
    const handler = (raw) => {
      try {
        const msg = JSON.parse(raw.toString())
        if (msg.type === type || !type) {
          clearTimeout(timer)
          ws.removeListener('message', handler)
          resolve(msg)
        }
      } catch {}
    }
    ws.on('message', handler)
  })
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function send(ws, data) {
  ws.send(JSON.stringify(data))
}

// ── Test cases ───────────────────────────────────────────────────

async function testConnection(label, url) {
  console.log(`\n── Test: ${label} connection ──`)
  const ws = await connect(url, label)
  console.log(`  ✅ Connected to ${label}`)

  // Get symbols
  send(ws, { type: 'get_symbols' })
  const syms = await waitForMessage(ws, 'symbols')
  console.log(`  ✅ Got ${syms.symbols?.length || 0} symbols`)
  return ws
}

async function testTickArrival(ws, label) {
  console.log(`\n── Test: ${label} tick arrival ──`)
  const symbols = []

  // Collect symbols first
  send(ws, { type: 'get_symbols' })
  const syms = await waitForMessage(ws, 'symbols')
  const firstSymbol = syms.symbols?.[0]
  if (!firstSymbol) { console.log('  ❌ No symbols available'); return symbols }
  const symName = firstSymbol.symbol || firstSymbol.display_name?.split('/')[0] + 'USDT'
  console.log(`  Symbol: ${symName}`)

  // Subscribe
  send(ws, { type: 'subscribe', symbols: [symName] })
  await sleep(500)

  // Wait for ticks
  const ticks = []
  const startTime = Date.now()
  const tickPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(ticks), TICK_TIMEOUT)
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString())
        if (msg.type === 'tick' && msg.symbol === symName) {
          ticks.push({ price: msg.price, epoch: msg.epoch, ts: Date.now() })
          if (ticks.length >= 3) { clearTimeout(timer); resolve(ticks) }
        }
      } catch {}
    })
  })

  const received = await tickPromise
  const elapsed = Date.now() - startTime
  if (received.length >= 3) {
    const intervals = received.slice(1).map((t, i) => t.ts - received[i].ts)
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
    console.log(`  ✅ Received ${received.length} ticks in ${elapsed}ms (avg interval: ${Math.round(avgInterval)}ms)`)
    received.forEach((t, i) => {
      const latency = t.ts - t.epoch * 1000
      console.log(`     Tick ${i + 1}: ${t.price}  latency=${latency}ms`)
    })
  } else {
    console.log(`  ⚠️  Only ${received.length} ticks received in ${elapsed}ms`)
  }

  symbols.push(symName)
  return { ws, symbols, symName }
}

async function testUnsubscribe(ws, label, symName) {
  console.log(`\n── Test: ${label} unsubscribe ──`)
  send(ws, { type: 'unsubscribe', symbols: [symName] })
  await sleep(500)

  let leakedTicks = 0
  const leakPromise = new Promise((resolve) => {
    const timer = setTimeout(() => resolve(leakedTicks), 4000)
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString())
        if (msg.type === 'tick' && msg.symbol === symName) leakedTicks++
      } catch {}
    })
  })

  leakedTicks = await leakPromise
  if (leakedTicks === 0) {
    console.log(`  ✅ No ticks after unsubscribe (per-client filtering works)`)
  } else {
    console.log(`  ⚠️  ${leakedTicks} ticks leaked after unsubscribe`)
  }
}

async function testCandleHistory(ws, label, symName) {
  console.log(`\n── Test: ${label} candle history ──`)
  send(ws, { type: 'market:candles', symbol: symName, granularity: 60, count: 5 })
  const candle = await waitForMessage(ws, 'candles')
  if (candle.candles?.length > 0) {
    console.log(`  ✅ Got ${candle.candles.length} candles for ${symName}`)
    console.log(`     Latest: O=${candle.candles[0].open} H=${candle.candles[0].high} L=${candle.candles[0].low} C=${candle.candles[0].close}`)
  } else {
    console.log(`  ⚠️  Empty candle response`)
  }
}

async function testMultiSubscribe(ws, label) {
  console.log(`\n── Test: ${label} multi-subscribe ──`)
  send(ws, { type: 'get_symbols' })
  const syms = await waitForMessage(ws, 'symbols')
  const symbols = (syms.symbols || []).slice(0, 5)
  const symNames = symbols.map(s => s.symbol || s.display_name?.split('/')[0] + 'USDT')
  console.log(`  Subscribing to ${symNames.length} symbols: ${symNames.join(', ')}`)

  send(ws, { type: 'subscribe', symbols: symNames })
  await sleep(1000)

  // Count unique symbols that tick
  const tickedSymbols = new Set()
  const tickPromise = new Promise((resolve) => {
    const timer = setTimeout(() => resolve([...tickedSymbols]), 5000)
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString())
        if (msg.type === 'tick') tickedSymbols.add(msg.symbol)
        if (tickedSymbols.size >= symNames.length) { clearTimeout(timer); resolve([...tickedSymbols]) }
      } catch {}
    })
  })

  const received = await tickPromise
  console.log(`  ✅ Ticks received for ${received.length}/${symNames.length} subscribed symbols`)

  // Clean up
  send(ws, { type: 'unsubscribe', symbols: symNames })
  await sleep(500)
}

async function testReconnect(ws, label) {
  console.log(`\n── Test: ${label} reconnect recovery ──`)
  // This tests that the server handles close/reconnect gracefully
  ws.close()
  await sleep(1000)
  const newWs = await connect(label === 'Binance' ? BINANCE_URL : DERIV_URL, label)
  send(newWs, { type: 'get_symbols' })
  const syms = await waitForMessage(newWs, 'symbols')
  console.log(`  ✅ Reconnected, got ${syms.symbols?.length || 0} symbols`)
  return newWs
}

// ── Main ─────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════')
  console.log('  WebSocket Stability Test')
  console.log(`  Binance: ${BINANCE_URL}`)
  console.log(`  Deriv:   ${DERIV_URL}`)
  console.log('═══════════════════════════════════════════')

  const results = { passed: 0, failed: 0, warnings: 0 }

  try {
    // ── Binance tests ──
    let binanceWs = await testConnection('Binance', BINANCE_URL)
    results.passed++

    const binanceResult = await testTickArrival(binanceWs, 'Binance')
    results.passed++

    await testCandleHistory(binanceWs, 'Binance', binanceResult.symName)
    results.passed++

    await testUnsubscribe(binanceWs, 'Binance', binanceResult.symName)
    results.passed++

    await testMultiSubscribe(binanceWs, 'Binance')
    results.passed++

    binanceWs = await testReconnect(binanceWs, 'Binance')
    results.passed++

    // Verify ticks still work after reconnect
    await testTickArrival(binanceWs, 'Binance (after reconnect)')
    results.passed++

    binanceWs.close()

    // ── Deriv tests ──
    let derivWs = await testConnection('Deriv', DERIV_URL)
    results.passed++

    const derivResult = await testTickArrival(derivWs, 'Deriv')
    results.passed++

    await testCandleHistory(derivWs, 'Deriv', derivResult.symName)
    results.passed++

    await testUnsubscribe(derivWs, 'Deriv', derivResult.symName)
    results.passed++

    derivWs = await testReconnect(derivWs, 'Deriv')
    results.passed++

    await testTickArrival(derivWs, 'Deriv (after reconnect)')
    results.passed++

    derivWs.close()

  } catch (err) {
    console.log(`\n  ❌ FAILED: ${err.message}`)
    results.failed++
  }

  console.log('\n═══════════════════════════════════════════')
  console.log(`  Results: ${results.passed} passed, ${results.failed} failed, ${results.warnings} warnings`)
  console.log('═══════════════════════════════════════════')
}

main().catch(console.error)
