---
name: dev
description: Start the AutobotOptions dev server, verify it's running, check for errors
---

# Dev Server

Start and verify the AutobotOptions paper trading terminal in development mode.

## Steps

1. Start the Vite dev server:
   ```bash
   cd autobot-options && npm run dev
   ```

2. Wait for the "ready" message — Vite serves on `http://localhost:5173`

3. Verify the server responds:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/
   ```
   Expected: `200`

4. Check for console errors in the terminal output

5. Open the browser to confirm:
   - 4-panel grid layout loads (sidebar, asset panel, chart, trade panel)
   - Prices are updating (simulated ticks every 1s)
   - Assets list shows 20 assets across 4 categories
   - Trading buttons (CALL/PUT) are clickable

## After Changes

After modifying any source file:
```bash
cd autobot-options && npm run build
```
Must pass with **zero errors** before considering the change complete.

## Troubleshooting

- **"does not provide an export named X"** → Vite HMR cache. Touch the file or restart the dev server.
- **White screen** → Check browser console for import errors.
- **No price updates** → Check `useWebSocket.js` hook is mounted.
- **Port 5173 in use** → Kill existing process or change port in `vite.config.js`.
