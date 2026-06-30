import { useState, useEffect, useRef } from 'react'

/**
 * Pure WebSocket hook — NO simulation, NO polling, NO fake data.
 *
 * Connects to a real WebSocket server when VITE_WS_URL is configured.
 * If VITE_WS_URL is not set, the hook returns { connected: false } and
 * does nothing — the consumer is responsible for showing "Waiting for
 * market data..." or providing a different feed.
 *
 * Architecture law: NEVER generate fake prices. The chart shows
 * "Waiting for market data..." until a real feed arrives.
 */
export function useWebSocket({ onTick } = {}) {
  const [connected, setConnected] = useState(false)
  const wsRef = useRef(null)

  // Keep onTick ref current so the WS handler never holds stale callbacks
  const onTickRef = useRef(onTick)
  onTickRef.current = onTick

  useEffect(() => {
    const wsUrl = import.meta.env.VITE_WS_URL
    if (!wsUrl) return // No URL configured — consumer handles the empty state

    let reconnectTimer

    const connectWs = () => {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        ws.send(JSON.stringify({
          action: 'subscribe',
          name: 'price',
          data: { assets: ['*'] },
          msgid: Date.now(),
        }))
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'tick' || data.type === 'price') {
            onTickRef.current?.({ price: data.price, asset: data.asset })
          } else if (data.price) {
            onTickRef.current?.(data)
          }
        } catch { /* non-JSON message, ignore */ }
      }

      ws.onerror = () => setConnected(false)

      ws.onclose = () => {
        setConnected(false)
        reconnectTimer = setTimeout(connectWs, 3000)
      }
    }

    connectWs()

    return () => {
      clearTimeout(reconnectTimer)
      wsRef.current?.close()
    }
  }, []) // runs once — onTickRef keeps callback fresh

  return { connected }
}
