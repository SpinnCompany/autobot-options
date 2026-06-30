---
name: broker-guidance
description: Pause and ask clarifying questions before making uncertain decisions about demo/real trading, accounts, price engine, or platform scope
---

# Broker Guidance Protocol

You are building **AutobotOptions — our own broker platform**. This is NOT a multi-broker terminal. Other broker integrations (Deriv, Pocket Option, etc.) live in the separate ATS-Project desktop bot.

When implementing features that touch trading engine, account model, real money, or production deployment, check [[broker-guidance-protocol]] and ask the user about any unresolved decisions.

## When This Skill Triggers

Invoke this skill BEFORE writing code when the user's request contains ANY of:
- "real trading" / "real money" / "real account"
- "production deployment" / "go live" / "launch"
- "user accounts" / "login" / "registration"
- "compliance" / "regulation" / "KYC"
- "mobile" / "responsive"
- "branding" / "product name"
- "demo account" / "account model"
- "price engine" / "price feed" / "market data"

## The Protocol

### Step 1: Read Memory
Read `memory/broker-guidance-protocol.md` for the full decision framework.

### Step 2: Check Resolved Decisions
These are already decided (2026-06-29):
- This is our OWN broker platform
- Other brokers live in ATS-Project desktop bot — OUT OF SCOPE here
- "Paper" = "Demo" — same thing, UI says "Demo Trading"
- Token storage: localStorage encrypted

### Step 3: Identify Unresolved Decisions
Check `memory/broker-integration-architecture.md` section "Key Design Decisions → PENDING" for open questions.

### Step 4: Ask — Don't Assume
Present options clearly. Wait for answer. Do NOT proceed until answered.

### Step 5: Record + Implement
Update memory files with the decision, then implement.

## The 10 Decision Points

1. **Demo Account Model** — Unlimited reset vs timed vs one-per-user
2. **Price Feed for Real Mode** — Synthetic vs aggregated vs licensed feed
3. **Real Account Activation** — Admin vs self-serve KYC vs demo-only
4. **Order Execution Model** — Instant fill vs confirm vs simulated latency
5. **Chart Data Source** — Demo engine vs real engine vs selectable
6. **Multi-Account Support** — One per browser vs login-required vs multiple
7. **Regulatory Scope** — Global vs targeted region vs undecided
8. **Platform Branding** — AutobotOptions vs new name vs decide later
9. **Sound & Notification Defaults** — Safe defaults vs power user
10. **Mobile Support Priority** — Desktop-first vs responsive vs dedicated

## Related
- [[broker-guidance-protocol]] — Full decision framework
- [[broker-integration-architecture]] — Where decisions are recorded
- [[broker-protocol-study]] — Competitor protocol reference
