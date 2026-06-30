// ── Economic Calendar — sample upcoming events ───────────────
//
// In production, this would be fetched from an API (e.g. ForexFactory,
// Investing.com, or a paid data provider). For demo mode, we use
// realistic sample events with rolling dates.
//
// Usage:
//   import { getUpcomingEvents, getActiveEvents } from './economicCalendar'
//   const events = getUpcomingEvents()   // today + next 6 days
//   const active = getActiveEvents()     // events happening right now

const SAMPLE_EVENTS = [
  // US events
  { id: 'nfp', currency: 'USD', impact: 'high', title: 'Non-Farm Payrolls', country: 'US', frequency: 'monthly', timeOfDay: 12.5, durationMin: 120, previous: '187K', forecast: '205K' },
  { id: 'cpi', currency: 'USD', impact: 'high', title: 'CPI (YoY)', country: 'US', frequency: 'monthly', timeOfDay: 12.5, durationMin: 90, previous: '3.4%', forecast: '3.3%' },
  { id: 'fomc', currency: 'USD', impact: 'high', title: 'FOMC Rate Decision', country: 'US', frequency: '6week', timeOfDay: 18.0, durationMin: 180, previous: '5.50%', forecast: '5.50%' },
  { id: 'gdp', currency: 'USD', impact: 'high', title: 'GDP (QoQ)', country: 'US', frequency: 'quarterly', timeOfDay: 12.5, durationMin: 90, previous: '3.2%', forecast: '2.8%' },
  { id: 'ism_mfg', currency: 'USD', impact: 'medium', title: 'ISM Manufacturing PMI', country: 'US', frequency: 'monthly', timeOfDay: 14.0, durationMin: 60, previous: '49.2', forecast: '50.1' },
  { id: 'retail_sales', currency: 'USD', impact: 'medium', title: 'Retail Sales (MoM)', country: 'US', frequency: 'monthly', timeOfDay: 12.5, durationMin: 60, previous: '0.6%', forecast: '0.3%' },
  { id: 'umich', currency: 'USD', impact: 'medium', title: 'Michigan Consumer Sentiment', country: 'US', frequency: 'monthly', timeOfDay: 14.0, durationMin: 60, previous: '69.1', forecast: '68.5' },
  { id: 'jobless', currency: 'USD', impact: 'low', title: 'Initial Jobless Claims', country: 'US', frequency: 'weekly', timeOfDay: 12.5, durationMin: 30, previous: '220K', forecast: '218K' },

  // EU / GBP events
  { id: 'ecb', currency: 'EUR', impact: 'high', title: 'ECB Rate Decision', country: 'EU', frequency: '6week', timeOfDay: 12.25, durationMin: 180, previous: '4.50%', forecast: '4.50%' },
  { id: 'eu_cpi', currency: 'EUR', impact: 'medium', title: 'EU CPI (YoY)', country: 'EU', frequency: 'monthly', timeOfDay: 9.0, durationMin: 60, previous: '2.6%', forecast: '2.5%' },
  { id: 'boe', currency: 'GBP', impact: 'high', title: 'BOE Rate Decision', country: 'UK', frequency: '6week', timeOfDay: 11.0, durationMin: 180, previous: '5.25%', forecast: '5.25%' },
  { id: 'gbp_cpi', currency: 'GBP', impact: 'medium', title: 'UK CPI (YoY)', country: 'UK', frequency: 'monthly', timeOfDay: 6.0, durationMin: 60, previous: '3.2%', forecast: '3.0%' },
  { id: 'gbp_gdp', currency: 'GBP', impact: 'medium', title: 'UK GDP (MoM)', country: 'UK', frequency: 'monthly', timeOfDay: 6.0, durationMin: 60, previous: '0.2%', forecast: '0.1%' },

  // JPY events
  { id: 'boj', currency: 'JPY', impact: 'high', title: 'BOJ Rate Decision', country: 'JP', frequency: '6week', timeOfDay: 3.0, durationMin: 180, previous: '0.10%', forecast: '0.10%' },
  { id: 'jpy_cpi', currency: 'JPY', impact: 'medium', title: 'Japan CPI (YoY)', country: 'JP', frequency: 'monthly', timeOfDay: 23.5, durationMin: 60, previous: '2.8%', forecast: '2.7%' },

  // AUD / NZD / CAD events
  { id: 'rba', currency: 'AUD', impact: 'high', title: 'RBA Rate Decision', country: 'AU', frequency: 'monthly', timeOfDay: 3.5, durationMin: 120, previous: '4.35%', forecast: '4.35%' },
  { id: 'aud_emp', currency: 'AUD', impact: 'medium', title: 'AU Employment Change', country: 'AU', frequency: 'monthly', timeOfDay: 0.5, durationMin: 60, previous: '39.7K', forecast: '25.0K' },

  // CHF events
  { id: 'snb', currency: 'CHF', impact: 'medium', title: 'SNB Rate Decision', country: 'CH', frequency: 'quarterly', timeOfDay: 7.5, durationMin: 120, previous: '1.75%', forecast: '1.75%' },

  // Commodity / general
  { id: 'eia_crude', currency: 'USD', impact: 'medium', title: 'EIA Crude Oil Inventories', country: 'US', frequency: 'weekly', timeOfDay: 14.5, durationMin: 60, previous: '-2.5M', forecast: '-1.8M' },
  { id: 'eia_ngas', currency: 'USD', impact: 'low', title: 'EIA Natural Gas Storage', country: 'US', frequency: 'weekly', timeOfDay: 14.5, durationMin: 30, previous: '+40B', forecast: '+38B' },
]

/**
 * Get upcoming events starting from today.
 * Returns events for today + the next `days` days.
 * Events are assigned rolling dates based on their frequency pattern.
 */
export function getUpcomingEvents(days = 7) {
  const now = new Date()
  const events = []

  for (let d = 0; d < days; d++) {
    const date = new Date(now)
    date.setDate(date.getDate() + d)
    date.setHours(0, 0, 0, 0)
    const dayOfWeek = date.getDay() // 0=Sun, 1=Mon, ...
    const dayOfMonth = date.getDate()

    // Skip weekends
    if (dayOfWeek === 0 || dayOfWeek === 6) continue

    // Select events that could fall on this day
    SAMPLE_EVENTS.forEach(ev => {
      // Assign events based on frequency
      let shouldInclude = false
      switch (ev.frequency) {
        case 'weekly':
          // Weekly events appear on specific weekdays
          if (ev.id === 'jobless' && dayOfWeek === 4) shouldInclude = true  // Thursday
          if (ev.id === 'eia_crude' && dayOfWeek === 3) shouldInclude = true // Wednesday
          if (ev.id === 'eia_ngas' && dayOfWeek === 4) shouldInclude = true  // Thursday
          break
        case 'monthly':
          // Monthly events on different days to spread them out
          shouldInclude = (dayOfMonth % 5 === ev.id.charCodeAt(0) % 5) && dayOfMonth <= 28
          break
        case '6week':
          // Less frequent — spread across months
          shouldInclude = (dayOfMonth === 10 || dayOfMonth === 20 || dayOfMonth === 2)
          break
        case 'quarterly':
          shouldInclude = dayOfMonth === 15
          break
      }

      if (shouldInclude) {
        // Set the event time
        const eventTime = new Date(date)
        const hours = Math.floor(ev.timeOfDay)
        const mins = Math.round((ev.timeOfDay - hours) * 60)
        eventTime.setHours(hours, mins, 0, 0)

        // Only include if event hasn't passed yet (for today) or is future day
        if (d === 0 && eventTime.getTime() < now.getTime()) {
          // Today's event already passed — skip unless within its active window
          const endTime = new Date(eventTime.getTime() + ev.durationMin * 60000)
          if (endTime.getTime() < now.getTime()) return
        }

        events.push({
          ...ev,
          time: eventTime.getTime(),
          timeStr: eventTime.toISOString(),
          endTime: eventTime.getTime() + ev.durationMin * 60000,
        })
      }
    })
  }

  // Sort by time
  events.sort((a, b) => a.time - b.time)
  return events
}

/**
 * Get events that are currently active (within their duration window).
 * Used by the news blocker in DemoEngine.
 */
export function getActiveEvents() {
  const now = Date.now()
  const upcoming = getUpcomingEvents(3) // check next 3 days
  return upcoming.filter(ev => now >= ev.time && now <= ev.endTime)
}

/**
 * Get a flag icon for a currency.
 */
export function getCurrencyFlag(currency) {
  const flags = {
    USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵',
    AUD: '🇦🇺', NZD: '🇳🇿', CAD: '🇨🇦', CHF: '🇨🇭',
  }
  return flags[currency] || '🌐'
}

export const IMPACT_COLORS = {
  high: 'var(--danger)',
  medium: '#ffc107',
  low: 'var(--text-muted)',
}
