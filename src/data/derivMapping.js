/**
 * Normalize a Deriv raw symbol to a clean display name.
 * Deriv prefixes: frx=forex, WLD=world, stp=step, JD=jump
 */
function formatSymbol(sym) {
  let cleaned = sym
  // Strip known prefixes
  if (cleaned.startsWith('frx')) cleaned = cleaned.slice(3)       // frxEURUSD → EURUSD
  else if (cleaned.startsWith('WLD')) cleaned = cleaned.slice(3)  // WLDAUD → AUD
  // Format forex: 6 chars → AAA/BBB
  if (cleaned.length === 6 && cleaned === cleaned.toUpperCase() && !cleaned.includes('_')) {
    return cleaned.slice(0, 3) + '/' + cleaned.slice(3)           // EURUSD → EUR/USD
  }
  return cleaned
}

/** Currency code → flag emoji. Exception: country flags are the ONLY emojis allowed per design-system rules. */
const CURRENCY_FLAGS = {
  USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵',
  AUD: '🇦🇺', CAD: '🇨🇦', CHF: '🇨🇭', NZD: '🇳🇿',
  SEK: '🇸🇪', NOK: '🇳🇴', MXN: '🇲🇽', PLN: '🇵🇱',
  SGD: '🇸🇬', HKD: '🇭🇰', DKK: '🇩🇰', ZAR: '🇿🇦',
  TRY: '🇹🇷', RUB: '🇷🇺', BRL: '🇧🇷', CNH: '🇨🇳',
  KRW: '🇰🇷', INR: '🇮🇳', THB: '🇹🇭', CZK: '🇨🇿',
  HUF: '🇭🇺', ILS: '🇮🇱', RON: '🇷🇴',
}

/** Parse a forex pair name like "EUR/USD" into [base, quote] flags. */
function forexFlags(pairName) {
  const parts = pairName.split('/')
  if (parts.length !== 2) return null
  const base = CURRENCY_FLAGS[parts[0]]
  const quote = CURRENCY_FLAGS[parts[1]]
  if (!base || !quote) return null
  return { icon: base, icon2: quote }
}

/** Only show supported market types */
function isDisplayable(sym) {
  const market = (sym.market || sym.market_display_name || '').toLowerCase()
  // Accept all known market types — synthetic, forex, crypto, indices, commodities
  return market === 'forex' || market === 'cryptocurrency' || market === 'synthetic_index'
    || market === 'stock_indices' || market === 'commodities'
}

/**
 * Deriv market type → UI display config.
 */
export const DERIV_MARKET_CONFIG = {
  synthetic_index: {
    label: 'Synthetic Indices',
    category: 'Synthetic',
    color: '#f7931a',
    icon: 'SI',
    payout: 88,
    order: 1,
  },
  forex: {
    label: 'Forex',
    category: 'Forex',
    color: '#2979ff',
    icon: 'FX',
    payout: 85,
    order: 2,
  },
  cryptocurrency: {
    label: 'Crypto',
    category: 'Crypto',
    color: '#f7931a',
    icon: 'CR',
    payout: 90,
    order: 3,
  },
  stock_indices: {
    label: 'Stock Indices',
    category: 'Indices',
    color: '#00c853',
    icon: 'ID',
    payout: 82,
    order: 4,
  },
  commodities: {
    label: 'Commodities',
    category: 'Commodities',
    color: '#ff9800',
    icon: 'CM',
    payout: 84,
    order: 5,
  },
  // Fallback for unknown types
  _default: {
    label: 'Other',
    category: 'Other',
    color: '#5a5e72',
    icon: 'OT',
    payout: 82,
    order: 99,
  },
}

/**
 * Normalize a Deriv active_symbol entry into our internal asset format.
 * @param {object} sym — Deriv symbol object from active_symbols response
 * @returns {object} normalized asset or null if unusable
 */
export function normalizeDerivSymbol(sym) {
  if (!sym || !sym.symbol || sym.symbol.startsWith('.')) return null
  if (!isDisplayable(sym)) return null
  const market = sym.market || sym.market_display_name || ''
  const config = DERIV_MARKET_CONFIG[market] || DERIV_MARKET_CONFIG._default

  const displayName = sym.display_name || formatSymbol(sym.symbol)

  // Forex pairs get flag emoji icons — all other asset types keep text badges
  const flags = market === 'forex' ? forexFlags(displayName) : null
  const icon = flags?.icon || config.icon
  const icon2 = flags?.icon2 || undefined

  return {
    name: displayName,
    displayName,
    price: 0,
    change: '0.00',
    category: config.category,
    color: config.color,
    icon,
    icon2,
    payout: config.payout,
    spread: null,
    dayHigh: null,
    dayLow: null,
    source: 'deriv',
    derivMarket: market,
    derivSymbol: sym.symbol,
  }
}

/**
 * Group normalized Deriv assets by market type for category display.
 */
export function groupDerivAssets(assets) {
  const groups = {}
  for (const a of assets) {
    const cat = a.category || 'Other'
    if (!groups[cat]) groups[cat] = []
    groups[cat].push(a)
  }
  return groups
}
