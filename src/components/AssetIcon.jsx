/**
 * AssetIcon — renders an asset icon correctly for all source types.
 *
 * - Binance (source === 'binance'):  CDN SVG image with fallback
 * - Forex (derivMarket === 'forex' && icon2): country flag emojis
 * - Everything else: styled text badge
 */

export default function AssetIcon({ asset, size = 20, style = {} }) {
  if (!asset) return null

  // Binance — CDN SVG icon with fallback
  if (asset.source === 'binance') {
    return (
      <img
        src={asset.icon}
        alt={asset.name}
        onError={e => { if (asset.iconFallback) e.target.src = asset.iconFallback }}
        style={{
          width: size, height: size, borderRadius: '50%', flexShrink: 0,
          ...style,
        }}
      />
    )
  }

  // Forex pairs with dual country flags
  if (asset.derivMarket === 'forex' && asset.icon2) {
    return (
      <span style={{
        fontSize: Math.round(size * 0.75), lineHeight: `${size}px`,
        letterSpacing: -1, flexShrink: 0,
        ...style,
      }}>{asset.icon}{asset.icon2}</span>
    )
  }

  // Default — colored text badge
  return (
    <span style={{
      width: size, height: size, borderRadius: Math.round(size / 5),
      background: `${asset.color}22`, color: asset.color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.max(11, Math.round(size * 0.55)),
      fontWeight: 700, fontFamily: 'Inter, sans-serif', flexShrink: 0,
      ...style,
    }}>{asset.icon || '◆'}</span>
  )
}
