/**
 * subscriptionManager.js — Centralized subscription tracking with reference counting.
 *
 * Ensures:
 *  - Each symbol is subscribed only once (dedup across tabs)
 *  - Unsubscribe only happens when NO tabs need the symbol (ref counting)
 *  - Reconnection recovery: all active symbols re-subscribed on reconnect
 *  - State exposed for UI indicators
 *
 * Used by both BinanceFeed and DerivFeed through a common interface.
 */

export class SubscriptionManager {
  // symbol → Set<tabId>  (which tabs need this symbol)
  _refs = new Map()

  // Set of all symbols currently subscribed at the proxy level
  _active = new Set()

  // Callback when active set changes
  onChange = null  // (added: string[], removed: string[]) => void

  /** Subscribe one or more symbols for a given tab. Returns symbols newly added. */
  subscribe(tabId, symbols) {
    const added = []
    for (const sym of symbols) {
      let tabs = this._refs.get(sym)
      if (!tabs) {
        tabs = new Set()
        this._refs.set(sym, tabs)
      }
      tabs.add(tabId)
      if (!this._active.has(sym)) {
        this._active.add(sym)
        added.push(sym)
      }
    }
    if (added.length > 0) this.onChange?.(added, [])
    return added
  }

  /** Unsubscribe symbols for a given tab. Returns symbols to remove from proxy. */
  unsubscribe(tabId, symbols) {
    const removed = []
    for (const sym of symbols) {
      const tabs = this._refs.get(sym)
      if (!tabs) continue
      tabs.delete(tabId)
      if (tabs.size === 0) {
        this._refs.delete(sym)
        this._active.delete(sym)
        removed.push(sym)
      }
    }
    if (removed.length > 0) this.onChange?.(null, removed)
    return removed
  }

  /** Unsubscribe ALL symbols for a tab (called on tab close). */
  unsubscribeAll(tabId) {
    const toRemove = []
    for (const [sym, tabs] of this._refs) {
      if (tabs.has(tabId)) {
        tabs.delete(tabId)
        if (tabs.size === 0) {
          this._refs.delete(sym)
          this._active.delete(sym)
          toRemove.push(sym)
        }
      }
    }
    if (toRemove.length > 0) this.onChange?.(null, toRemove)
    return toRemove
  }

  /** All currently active symbols (for reconnection recovery). */
  get activeSymbols() {
    return [...this._active]
  }

  /** Number of unique symbols subscribed. */
  get activeCount() {
    return this._active.size
  }

  /** Number of tabs subscribed to a given symbol. */
  refCount(symbol) {
    return this._refs.get(symbol)?.size || 0
  }

  /** Check if any tab is subscribed to this symbol. */
  isActive(symbol) {
    return this._active.has(symbol)
  }

  /** All symbols with their reference counts. */
  get snapshot() {
    const result = {}
    for (const [sym, tabs] of this._refs) {
      result[sym] = { count: tabs.size, tabs: [...tabs] }
    }
    return result
  }

  /** Clear all state (on disconnect). */
  reset() {
    this._refs.clear()
    this._active.clear()
  }
}
