import { AlertTriangle } from 'lucide-react'

export default function ConfirmModal({ open, title, message, confirmLabel = 'Confirm', danger = false, onConfirm, onCancel }) {
  if (!open) return null

  return (
    <div
      className="modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
      }}
    >
      <div style={{
        background: 'var(--bg-surface)', borderRadius: 12, padding: 24,
        minWidth: 320, maxWidth: 400,
        border: '1px solid var(--border-default)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: danger ? 'rgba(255,23,68,0.12)' : 'rgba(245,123,0,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <AlertTriangle size={20} color={danger ? 'var(--danger)' : 'var(--brand)'} />
          </div>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>{title}</h3>
            {message && <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0', lineHeight: 1.5 }}>{message}</p>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{
            padding: '8px 20px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            background: 'var(--bg-input)', border: '1px solid var(--border-default)',
            color: 'var(--text-secondary)', cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={onConfirm} style={{
            padding: '8px 20px', borderRadius: 8, fontSize: 12, fontWeight: 600,
            background: danger ? 'var(--danger)' : 'var(--brand)',
            border: 'none', color: danger ? '#fff' : '#000', cursor: 'pointer',
          }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
