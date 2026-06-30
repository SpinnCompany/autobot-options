---
name: design-check
description: Verify PIT-TERMINAL design system compliance — no raw colors, correct spacing, font rules
---

# Design System Compliance Check

Verify that all UI changes follow the PIT-TERMINAL design system rules from `CLAUDE.md` and `src/index.css`.

## Check Items

### 1. No Raw Colors
```bash
grep -rn '#[0-9a-fA-F]\{3,6\}' autobot-options/src/ --include='*.jsx' --include='*.css' | grep -v 'index.css' | grep -v '//'
```
Any hit is a **violation** — use `var(--token-name)` instead. The only file allowed to define hex colors is `index.css`.

### 2. Font Size Floor
```bash
grep -rn 'fontSize:\s*\([0-9]\|10\)\b' autobot-options/src/ --include='*.jsx'
```
No font size below 11px anywhere.

### 3. No 100vh/dvh in Non-Root Elements
```bash
grep -rn '100vh\|100dvh' autobot-options/src/ --include='*.jsx' --include='*.css'
```
Only acceptable in `html, body, #root` — use `height: 100%` elsewhere.

### 4. No Monospace Fonts
```bash
grep -rn 'monospace\|Consolas\|Fira Code\|JetBrains\|mono' autobot-options/src/ --include='*.jsx' --include='*.css'
```
Inter is the only allowed font family.

### 5. No Emojis in UI
```bash
grep -rn '✅\|❌\|📋\|▶\|⚠️' autobot-options/src/ --include='*.jsx'
```
Use words or lucide-react icons instead. (Emojis in toast messages from `App.jsx` lines 170-171 are the only exception — they're user-facing trade results.)

### 6. Correct Token Usage
- Backgrounds: `var(--bg-base)`, `var(--bg-surface)`, `var(--bg-elevated)`, `var(--bg-input)`
- Text: `var(--text-primary)`, `var(--text-secondary)`, `var(--text-muted)`
- Brand: `var(--brand)`, `var(--brand-light)`, `var(--brand-dark)` — used sparingly
- Semantic: `var(--success)` for profit/wins, `var(--danger)` for loss/errors

### 7. Animation Compliance
- Only `opacity` and `transform` animated
- Duration ≤ 300ms (prefer 150ms)
- No height/width/margin animations
- `transition: all 0.15s` is fine for interactive elements

## Report Format

```
Design Check Report
✅ Passed: [items]
⚠️  Warnings: [items]
❌ Violations: [items — must fix]
```
