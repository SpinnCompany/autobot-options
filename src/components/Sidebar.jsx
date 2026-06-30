import { LayoutDashboard, CandlestickChart, BarChart3, History, Calendar, BookOpen, Grid3X3, Table2, Play, Settings, HelpCircle, User } from 'lucide-react'
import { useTranslation } from 'react-i18next'

const sections = [
  { id: 'trade', icon: CandlestickChart, key: 'sidebar.trade' },
  { id: 'positions', icon: LayoutDashboard, key: 'sidebar.positions' },
  { id: 'history', icon: History, key: 'sidebar.history' },
  { id: 'analytics', icon: BarChart3, key: 'sidebar.analytics' },
  { id: 'heatmap', icon: Grid3X3, key: 'sidebar.heatmap' },
  { id: 'correlation', icon: Table2, key: 'sidebar.correlation' },
  { id: 'backtest', icon: Play, key: 'sidebar.backtest' },
  { id: 'calendar', icon: Calendar, key: 'sidebar.calendar' },
  { id: 'journal', icon: BookOpen, key: 'sidebar.journal' },
]

export default function Sidebar({ activeSection, onSectionChange, positionsCount }) {
  const { t } = useTranslation()
  return (
    <nav className="sidebar">
      <div className="sidebar-logo">
        <img src="/plain_logo.png" alt={t('sidebar.logoAlt')} width={22} height={22} style={{ display: 'block' }} />
      </div>

      {sections.map(({ id, icon: Icon, key }) => (
        <button
          key={id}
          className={`sidebar-btn ${activeSection === id ? 'active' : ''}`}
          onClick={() => onSectionChange(id)}
          title={t(key)}
        >
          <Icon size={19} />
          {id === 'positions' && positionsCount > 0 && (
            <span className="badge">{positionsCount}</span>
          )}
        </button>
      ))}

      <div className="sidebar-spacer" />

      <div className="sidebar-footer">
        <button className="sidebar-btn" title={t('sidebar.help')}>
          <HelpCircle size={19} />
        </button>
        <button className="sidebar-btn" title={t('sidebar.settings')}>
          <Settings size={19} />
        </button>
        <button className="sidebar-btn" title={t('sidebar.account')}>
          <User size={19} />
        </button>
      </div>
    </nav>
  )
}