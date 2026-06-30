import { useState, useCallback, useEffect, useRef } from 'react'

export function usePushNotifications() {
  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem('autobot_push_enabled') === 'true' } catch { return false }
  })
  const [permission, setPermission] = useState('default')
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled

  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission)
    }
  }, [])

  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) return false
    const result = await Notification.requestPermission()
    setPermission(result)
    return result === 'granted'
  }, [])

  const toggle = useCallback(async () => {
    if (!enabled) {
      const granted = await requestPermission()
      if (granted) {
        setEnabled(true)
        try { localStorage.setItem('autobot_push_enabled', 'true') } catch {}
      }
    } else {
      setEnabled(false)
      try { localStorage.setItem('autobot_push_enabled', 'false') } catch {}
    }
  }, [enabled, requestPermission])

  const notify = useCallback((title, body) => {
    if (!enabledRef.current || !('Notification' in window) || Notification.permission !== 'granted') return
    try {
      new Notification(title, {
        body,
        icon: '/favicon.svg',
        tag: 'autobot-trade',
        requireInteraction: false,
      })
    } catch {
      // silent fail
    }
  }, [])

  // Fire a test notification
  const test = useCallback(() => {
    notify('AutobotOptions', 'Push notifications are working!')
  }, [notify])

  return { enabled, permission, toggle, notify, test }
}