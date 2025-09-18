# QR Order Admin — Vercel Edition

This folder is ready to deploy the **Admin UI server** on **Vercel** (Express mode). UI stays the same.

## What changed vs Render?
- No UI changes. Added `vercel.json` and this README.
- Admin fetches its API base from `GET /admin-config` (same origin). Configure via envs below.

## Environment variables (set these in Vercel → Project → Settings → Environment Variables)
- `API_BASE` — The deployed API base URL (e.g., `https://qrorder-api-yourid.vercel.app`)
- `ORDER_BASE` — (Optional) If different from `API_BASE`, set your QR order base URL.

## Deploy
1. Push this folder to GitHub (e.g., `qrorder-admin`), then import as a new Vercel project.
2. Add envs above and **Deploy**.

## Local dev
```bash
npm i
node admin_server.js
# open http://localhost:4001
```
