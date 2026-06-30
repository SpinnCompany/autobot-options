---
name: broker-guidance-protocol
description: When Claude MUST ask for user clarification during AutobotOptions development — decisions about demo/real, price engine, account model, regulatory scope
metadata:
  type: feedback
---

# Broker Guidance Protocol

**This is a MANDATORY protocol.** When implementing features that touch trading engine, accounts, or production deployment, Claude MUST pause and ask the user for direction.

**Why:** Building a broker platform involves design choices where multiple valid approaches exist and the user's preference determines the architecture. Guessing wrong wastes implementation effort.

**How to apply:** Before starting any implementation task that touches these areas, check this list. If any decision point is unresolved, present the options and ask.

## Critical Architecture Decisions (ALL 10 RESOLVED — 2026-06-29)

1. **Platform identity:** This is our OWN broker platform. NOT a multi-broker terminal.
2. **Other broker integration:** Deriv, Pocket Option, Quotex, etc. integrations live in the separate ATS-Project desktop Python bot — OUT OF SCOPE for this web app.
3. **Demo = Paper:** "Paper trading" and "demo trading" are the same thing. UI says "Demo Trading."
4. **Token storage:** localStorage encrypted (when real accounts are added).
5. **Demo account model:** Unlimited free demo — one-click reset to $10k, no login required.
6. **Price feed:** Demo-only for now. Same engine generates prices regardless.
7. **Real account activation:** Demo-only for now. No real money features exist.
8. **Order execution:** Instant fill at shown price — market maker model.
9. **Chart data source:** Demo engine always drives charts.
10. **Regulatory scope:** Undecided — build first, compliance later.

### Current Focus
The platform is a **demo-only trading terminal**. No real money, no external broker connections, no regulatory concerns.

### Features Built (verified 2026-06-30)
- **Engine:** DemoEngine with full trade lifecycle (place/close/double-up/extend), TP/SL auto-close, pending orders with auto-execution, risk management (5 controls), price alerts, trade journal notes, localStorage persistence
- **Price Feed:** 4 market modes — random, trending(up/down), volatile(3x), sideways(mean-revert)
- **Chart:** Physics-grade CanvasChart — candles, 5 indicators (EMA, BB, SMA, RSI, MACD), drawing tools (trendline, fib, horizontal), zoom/pan, crosshair, sub-panels
- **Trading:** CALL/PUT execution, TP/SL with % quick-sets, Martingale (auto×N/manual steps), Compounding (% of profit/manual $ steps), entry orders, extend positions
- **Risk:** Daily loss limit, max position %, max daily trades, min payout %, news event blocker with per-level toggles
- **Panels:** Sidebar (6 sections), AssetPanel (20 assets, search, sentiment, win rates), TradePanel (~1200 lines), HistoryView (CSV export, notes), AnalyticsView, JournalView, EconomicCalendar (21 events, live countdowns)
- **UX:** Keyboard shortcuts, trade confirmation toggle, sound toggle, toast duration control, position timer rings, mobile responsive (3 breakpoints), OTC/LIVE badge, candle countdown
- **Design:** PIT-TERMINAL dark theme, Inter font, all CSS tokens (no raw colors), lucide-react icons

**27 of 46 gap audit items complete (59%).**

### When These Decisions Should Be Revisited
- When the backend engine (autobot-engine) is ready
- When user accounts & authentication are added
- When real money features are being planned
- When implementing Account Types (#25) or Deposit/Withdrawal (#26)

## Decision Points — Must Ask

### 1. Demo Account Model
**Status:** RESOLVED — Unlimited free demo, one-click reset to $10k.
**Triggers when:** Building multi-profile demo accounts, adding named profiles.

### 2. Price Feed for Real Mode
**Status:** RESOLVED — Demo-only for now.
**Triggers when:** Planning the real trading engine, discussing price data sources.

### 3. Real Account Activation
**Status:** RESOLVED — Demo-only for now.
**Triggers when:** Adding real trading mode, user account features.

### 4. Order Execution Model (Real Mode)
**Status:** RESOLVED — Instant fill at shown price.
**Triggers when:** Building the backend order matcher or real trade flow.

### 5. Chart Data Source
**Status:** RESOLVED — Demo engine always drives charts.
**Triggers when:** Planning real-mode chart feeds.

### 6. Multi-Account Support
**Status:** RESOLVED — One demo account per browser, no login.
**Triggers when:** Adding user accounts, login, profiles. Revisit for #25 (Account Types).

### 7. Regulatory Scope
**Status:** RESOLVED — Undecided, build first.
**Triggers when:** Planning real money features.

### 8. Platform Branding
**Status:** RESOLVED — AutobotOptions.
**Triggers when:** Finalizing product name, marketing.

### 9. Sound & Notification Defaults
**Status:** RESOLVED — Sound ON, confirmations OFF (power user defaults).
**Triggers when:** Finalizing UX defaults.

### 10. Mobile Support Priority
**Status:** RESOLVED — Mobile responsive already built (3 breakpoints).
**Triggers when:** Major mobile UX changes.

## Trigger Phrases

When Claude sees ANY of these, pause and check decision points:
- "real trading" / "real money" / "real account"
- "production deployment" / "go live" / "launch"
- "user accounts" / "login" / "registration"
- "compliance" / "regulation" / "KYC"
- "mobile" / "responsive"
- "branding" / "product name"

## Question Format

Present options as:
- Clear header tagging the decision category
- 3-4 concrete options with implications
- The recommended option marked "(Recommended)" when there's a best practice
- Single choice per question

## After Answer Received

1. Record the decision in [[broker-integration-architecture]] under "Key Design Decisions"
2. Implement following the user's choice exactly
3. Do NOT second-guess or override the decision later

## Related Memories
- [[broker-integration-architecture]] — Where decisions are recorded and implemented
- [[broker-protocol-study]] — Competitor protocol reference (how other brokers do it)
- [[broker-gap-audit]] — 46 features to implement (27 done, 19 remaining)
