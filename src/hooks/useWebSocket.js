import { useState, useEffect, useRef } from 'react'

/**
 * Simulated WebSocket hook for AutobotOptions.
 *
 * In production, replace the simulation logic with a real WebSocket
 * connection to broker APIs documented in docs/brokers-websocket-architecture.md.
 *
 * To use a real WebSocket server, set VITE_WS_URL in your .env file
 * (e.g. VITE_WS_URL=wss://your-broker-api.com/ws). The hook will
 * attempt the real connection first and fall back to simulation.
 */
export function useWebSocket({ onTick } = {}) {
  const [connected, setConnected] = useState(false)
  const intervalRef = useRef(null)
  const priceRef = useRef(1.0850)
  const wsRef = useRef(null)

  // Keep onTick ref current so the interval never needs to restart
  const onTickRef = useRef(onTick)
  onTickRef.current = onTick

  useEffect(() => {
    const wsUrl = import.meta.env.VITE_WS_URL

    if (wsUrl) {
      // Real WebSocket mode — only used when VITE_WS_URL is configured
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
          } catch {
            // non-JSON message, ignore
          }
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
    }

    // Simulation mode — used by default in development
    setConnected(true)

    intervalRef.current = setInterval(() => {
      const change = (Math.random() - 0.48) * priceRef.current * 0.0005
      priceRef.current = parseFloat((priceRef.current + change).toFixed(5))
      onTickRef.current?.({ price: priceRef.current })
    }, 1000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, []) // runs once — onTickRef keeps callback fresh

  return { connected }
}
