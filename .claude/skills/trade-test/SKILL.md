---
name: trade-test
description: Run through the complete trade execution lifecycle and verify all states work correctly
---

# Trade Execution Test

Verify the paper trading system works end-to-end by testing every trade lifecycle state.

## Test Scenarios

### 1. Successful Trade (CALL, Win)
1. Select EUR/USD from asset panel
2. Enter amount: $100
3. Select duration: 30s (or shortest available)
4. Click CALL button
5. Verify: balance decreases by $100 immediately
6. Verify: position appears in trade panel with progress bar
7. Wait for expiry
8. Verify: toast notification shows result
9. Verify: balance updates correctly (refund + profit or loss)
10. Verify: trade appears in History view
11. Verify: Analytics numbers update

### 2. Successful Trade (PUT, Loss)
Repeat with PUT direction — verify loss handling.

### 3. Insufficient Balance
1. Enter amount > current balance
2. Click CALL
3. Verify: toast error "Insufficient balance"
4. Verify: no position created

### 4. Max Open Positions
1. Open 5 trades (MAX_OPEN)
2. Try to open a 6th
3. Verify: toast error "Max 5 open positions"
4. Verify: 6th position NOT created

### 5. Early Close
1. Open a trade with longer duration (60s+)
2. Click "Close Early (65% refund)"
3. Verify: position closed immediately
4. Verify: balance refunded ≈ 65% of amount
5. Verify: status shows as loss

### 6. Zero/Negative Amount
1. Enter amount: 0 or -50
2. Click CALL
3. Verify: toast error "Enter a valid amount"

### 7. Tab Management
1. Select multiple assets (EUR/USD, GBP/USD, BTC/USD)
2. Verify: each opens a new tab
3. Click between tabs — verify chart updates
4. Close a tab — verify remaining tabs still work
5. Try to open > MAX_TABS (8) — verify error toast

## After Each Test
- [ ] No console errors
- [ ] Balance always correct (initial = 10000, sum of all changes = current)
- [ ] No orphaned positions
- [ ] localStorage `autobot_options_history` updated

## Full Regression
```bash
cd autobot-options && npm run build
```
Must pass with zero errors.
