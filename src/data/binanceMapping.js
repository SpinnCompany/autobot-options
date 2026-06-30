/**
 * Binance symbol mapping — normalizes proxy symbol data to our asset format.
 *
 * Symbols are discovered dynamically from Binance exchangeInfo via the proxy.
 * Icons come from the cryptocurrency-icons CDN (SVG), with a generated
 * SVG circle as fallback for coins not in the icon set.
 *
 * Asset shape produced:
 *   { name, displayName, price: 0, change: '0.00', category: 'Crypto',
 *     color, icon (CDN URL), iconFallback (SVG data URI), payout: 90,
 *     source: 'binance', brokerSymbol }
 */

const ICON_CDN = 'https://cdn.jsdelivr.net/npm/cryptocurrency-icons@0.18.1/svg/icon';

// SVG data URI — colored circle with ticker label (fallback when CDN 404s)
function fallbackIconSVG(label, color) {
  const fontSize = label.length > 3 ? 8.5 : label.length > 2 ? 11 : 14;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="15.5" fill="${color}"/><text x="16" y="21" text-anchor="middle" fill="#fff" font-family="system-ui,sans-serif" font-size="${fontSize}" font-weight="700">${label}</text></svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

export function normalizeBinanceSymbol(raw) {
  if (!raw || !raw.symbol || !raw.baseAsset) return null;

  const name = raw.display_name || `${raw.baseAsset}/USDT`;
  const color = raw.color || '#f7931a';
  const slug = raw.baseAsset.toLowerCase();
  // Real SVG icon from CDN, with generated SVG as fallback
  const icon = `${ICON_CDN}/${slug}.svg`;
  const iconFallback = fallbackIconSVG(raw.baseAsset, color);

  return {
    name,
    displayName: name,
    price: 0,
    change: '0.00',
    category: 'Crypto',
    color,
    icon,
    iconFallback,
    payout: 90,
    spread: null,
    dayHigh: null,
    dayLow: null,
    source: 'binance',
    brokerSymbol: raw.symbol,
  };
}
