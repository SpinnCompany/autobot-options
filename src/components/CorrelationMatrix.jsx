import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { generatePriceHistory } from '../data/mockData'

function pearson(a, b) {
  const n = Math.min(a.length, b.length)
  if (n < 10) return 0
  let sumA = 0, sumB = 0, sumAB = 0, sumA2 = 0, sumB2 = 0
  for (let i = 0; i < n; i++) {
    sumA += a[i]; sumB += b[i]
    sumAB += a[i] * b[i]; sumA2 += a[i] * a[i]; sumB2 += b[i] * b[i]
  }
  const num = n * sumAB - sumA * sumB
  const den = Math.sqrt((n * sumA2 - sumA * sumA) * (n * sumB2 - sumB * sumB))
  return den === 0 ? 0 : parseFloat((num / den).toFixed(2))
}

function corrColor(v) {
  const abs = Math.abs(v)
  if (v > 0.7) return 'rgba(0,200,83,0.35)'
  if (v > 0.3) return 'rgba(0,200,83,0.15)'
  if (v < -0.7) return 'rgba(255,23,68,0.35)'
  if (v < -0.3) return 'rgba(255,23,68,0.15)'
  return 'transparent'
}

function corrTextColor(v) {
  if (v > 0.7) return 'var(--success)'
  if (v > 0.3) return 'rgba(0,200,83,0.6)'
  if (v < -0.7) return 'var(--danger)'
  if (v < -0.3) return 'rgba(255,23,68,0.6)'
  return 'var(--text-muted)'
}

export default function CorrelationMatrix({ assets }) {
  const { t } = useTranslation()

  // Generate price histories and compute % change series for correlation
  const matrix = useMemo(() => {
    const forex = assets.filter(a => a.category === 'Forex')
    if (forex.length < 2) return { pairs: [], data: [] }

    // Generate 200-point price histories and compute % changes
    const series = {}
    forex.forEach(a => {
      const hist = generatePriceHistory(200, a.price)
      const changes = []
      for (let i = 1; i < hist.length; i++) {
        changes.push((hist[i].price - hist[i-1].price) / hist[i-1].price * 100)
      }
      series[a.name] = changes
    })

    // Compute correlation matrix
    const data = forex.map(a => {
      const row = forex.map(b => {
        if (a.name === b.name) return 1.0
        return pearson(series[a.name], series[b.name])
      })
      return { asset: a, correlations: row }
    })

    return { pairs: forex, data }
  }, [assets])

  const { pairs, data } = matrix

  return (
    <div style={{ gridColumn: '2 / 5', padding: 20, overflow: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 18, fontWeight: 700 }}>{t('correlation.title')}</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {pairs.length} {t('correlation.subtitle')}
        </span>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 11 }}>
        <span style={{ color: 'var(--text-muted)' }}>{t('correlation.negOne')}</span>
        <div style={{ display: 'flex', height: 10, borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: 30, background: 'rgba(255,23,68,0.40)' }} />
          <div style={{ width: 30, background: 'rgba(255,23,68,0.18)' }} />
          <div style={{ width: 30, background: 'transparent' }} />
          <div style={{ width: 30, background: 'rgba(0,200,83,0.18)' }} />
          <div style={{ width: 30, background: 'rgba(0,200,83,0.40)' }} />
        </div>
        <span style={{ color: 'var(--text-muted)' }}>{t('correlation.posOne')}</span>
      </div>

      {pairs.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, marginTop: 40 }}>
          {t('correlation.noPairs')}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 11, width: '100%' }}>
            <thead>
              <tr>
                <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--text-muted)', fontWeight: 500, fontSize: 11, position: 'sticky', left: 0, background: 'var(--bg-base)', zIndex: 2 }} />
                {pairs.map(p => (
                  <th key={p.name} style={{
                    padding: '6px 4px', textAlign: 'center', fontWeight: 600, fontSize: 11,
                    color: p.color || 'var(--text-secondary)', whiteSpace: 'nowrap',
                  }}>
                    <span style={{ marginRight: 3 }}>{p.icon}</span>
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, ri) => (
                <tr key={row.asset.name}>
                  <td style={{
                    padding: '6px 8px', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap',
                    color: row.asset.color || 'var(--text-secondary)',
                    position: 'sticky', left: 0, background: ri % 2 === 0 ? 'var(--bg-base)' : 'rgba(255,255,255,0.01)', zIndex: 1,
                  }}>
                    <span style={{ marginRight: 3 }}>{row.asset.icon}</span>
                    {row.asset.name}
                  </td>
                  {row.correlations.map((v, ci) => (
                    <td key={ci} style={{
                      padding: '4px 0', textAlign: 'center',
                      background: ri === ci ? 'rgba(255,255,255,0.03)' : corrColor(v),
                      borderRadius: ri === ci ? 4 : 0,
                      fontWeight: 700, fontSize: 11,
                      color: corrTextColor(v),
                      fontVariantNumeric: 'tabular-nums',
                      minWidth: 52,
                    }}>
                      {v.toFixed(2)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        {t('correlation.footer')}
      </div>
    </div>
  )
}
