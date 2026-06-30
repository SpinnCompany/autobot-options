import { LayoutDashboard, CandlestickChart, BarChart3, History, Calendar, BookOpen, Grid3X3, Table2, Play, Settings, HelpCircle, User } from 'lucide-react'

const sections = [
  { id: 'trade', icon: CandlestickChart, label: 'Trade' },
  { id: 'positions', icon: LayoutDashboard, label: 'Positions' },
  { id: 'history', icon: History, label: 'History' },
  { id: 'analytics', icon: BarChart3, label: 'Analytics' },
  { id: 'heatmap', icon: Grid3X3, label: 'Heatmap' },
  { id: 'correlation', icon: Table2, label: 'Correlation' },
  { id: 'backtest', icon: Play, label: 'Backtest' },
  { id: 'calendar', icon: Calendar, label: 'Calendar' },
  { id: 'journal', icon: BookOpen, label: 'Journal' },
]

export default function Sidebar({ activeSection, onSectionChange, positionsCount }) {
  return (
    <nav className="sidebar">
      <div className="sidebar-logo">
        <img src="/plain_logo.png" alt="AutobotSignal" width={22} height={22} style={{ display: 'block' }} />
      </div>

      {sections.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          className={`sidebar-btn ${activeSection === id ? 'active' : ''}`}
          onClick={() => onSectionChange(id)}
          title={label}
        >
          <Icon size={19} />
          {id === 'positions' && positionsCount > 0 && (
            <span className="badge">{positionsCount}</span>
          )}
        </button>
      ))}

      <div className="sidebar-spacer" />

      <div className="sidebar-footer">
        <button className="sidebar-btn" title="Help">
          <HelpCircle size={19} />
        </button>
        <button className="sidebar-btn" title="Settings">
          <Settings size={19} />
        </button>
        <button className="sidebar-btn" title="Account">
          <User size={19} />
        </button>
      </div>
    </nav>
  )
}