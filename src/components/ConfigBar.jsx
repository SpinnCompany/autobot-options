import { Wifi, WifiOff } from 'lucide-react'

export default function ConfigBar({ connected, source, derivReady, derivEnabled, onToggleDeriv, derivCount }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '6px 14px',
      background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)',
      fontSize: 11, flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {connected ? (
          <Wifi size={14} color={source === 'deriv' ? 'var(--success)' : '#ffc107'} />
        ) : (
          <WifiOff size={14} color="var(--text-muted)" />
        )}
        <span style={{
          fontWeight: 600, fontSize: 11, padding: '1px 6px', borderRadius: 3,
          color: '#000',
          background: source === 'deriv' ? 'var(--success)' : '#ffc107',
        }}>
          {source === 'deriv' ? 'LIVE' : 'DEMO'}
        </span>
        {derivReady && derivCount > 0 && (
          <span style={{ color: 'var(--text-muted)' }}>{derivCount} Deriv markets</span>
        )}
      </div>

      <div style={{ flex: 1 }} />

      <button onClick={onToggleDeriv} style={{
        padding: '4px 12px', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer',
        background: derivEnabled ? 'var(--success)' : 'var(--bg-input)',
        border: derivEnabled ? '1px solid var(--success)' : '1px solid var(--border-default)',
        color: derivEnabled ? '#000' : 'var(--text-secondary)',
      }}>
        {derivEnabled ? 'Deriv ON' : 'Use Deriv'}
      </button>
    </div>
  )
}
