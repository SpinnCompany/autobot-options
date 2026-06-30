/**
 * Binance symbol mapping — normalizes raw Binance symbols to our asset format.
 *
 * Asset shape produced:
 *   { name, displayName, price: 0, change: '0.00', category: 'Crypto',
 *     color, icon, payout: 88, source: 'binance', brokerSymbol }
 */

const BINANCE_MARKET_CONFIG = {
  cryptocurrency: { category: 'Crypto', payout: 90, order: 3 },
};

const BINANCE_TRADING_PAIRS = [
  ['BTCUSDT',  'BTC/USDT',  'BT', '#f7931a'],
  ['ETHUSDT',  'ETH/USDT',  'ET', '#627eea'],
  ['SOLUSDT',  'SOL/USDT',  'SO', '#9945ff'],
  ['XRPUSDT',  'XRP/USDT',  'XR', '#23292f'],
  ['ADAUSDT',  'ADA/USDT',  'AD', '#0033ad'],
  ['DOGEUSDT', 'DOGE/USDT', 'DO', '#c2a633'],
  ['DOTUSDT',  'DOT/USDT',  'DT', '#e6007a'],
  ['AVAXUSDT', 'AVAX/USDT', 'AV', '#e84142'],
  ['MATICUSDT','MATIC/USDT','MA', '#8247e5'],
  ['LINKUSDT', 'LINK/USDT', 'LK', '#2a5ada'],
  ['UNIUSDT',  'UNI/USDT',  'UN', '#ff007a'],
  ['ATOMUSDT', 'ATOM/USDT', 'AT', '#2e3148'],
  ['ETCUSDT',  'ETC/USDT',  'EC', '#328332'],
  ['FILUSDT',  'FIL/USDT',  'FI', '#0090ff'],
  ['TRXUSDT',  'TRX/USDT',  'TR', '#ff0013'],
  ['APTUSDT',  'APT/USDT',  'AP', '#000000'],
  ['ARBUSDT',  'ARB/USDT',  'AR', '#28a0f0'],
  ['OPUSDT',   'OP/USDT',   'OP', '#ff0420'],
  ['SUIUSDT',  'SUI/USDT',  'SU', '#4da2ff'],
  ['PEPEUSDT', 'PEPE/USDT', 'PE', '#00843d'],
];

// Build lookup map: raw symbol → metadata
const PAIR_MAP = new Map();
for (const [sym, name, icon, color] of BINANCE_TRADING_PAIRS) {
  PAIR_MAP.set(sym, { name, icon, color });
}

/**
 * Normalize a raw Binance symbol object (from proxy's `get_symbols` response)
 * into our standard asset format. Returns null if the symbol is unrecognized.
 */
export function normalizeBinanceSymbol(raw) {
  if (!raw || !raw.symbol) return null;

  const meta = PAIR_MAP.get(raw.symbol);
  if (!meta) return null;

  const marketConfig = BINANCE_MARKET_CONFIG[raw.market] || BINANCE_MARKET_CONFIG.cryptocurrency;

  return {
    name: meta.name,
    displayName: meta.name,
    price: 0,
    change: '0.00',
    category: marketConfig.category,
    color: meta.color,
    icon: meta.icon,
    payout: marketConfig.payout,
    spread: null,
    dayHigh: null,
    dayLow: null,
    source: 'binance',
    brokerSymbol: raw.symbol,
  };
}
