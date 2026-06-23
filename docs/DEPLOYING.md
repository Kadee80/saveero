# Saveero Deployment Guide

## Architecture

| Layer | Platform | URL |
|-------|----------|-----|
| Frontend | Vercel | saveero-demo-4-10.vercel.app |
| Backend API | Render | saveero-7nu9.onrender.com |
| Database + Auth | Supabase | oabxgprjdqyhnqoeffkv.supabase.co |

---

## Backend (Render)

### First-time setup
1. Go to [render.com](https://render.com) → sign up with GitHub
2. **New → Web Service** → connect your `saveero` repo
3. Set:
   - **Root Directory:** `saveero`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Add environment variables (see below)
5. Click **Deploy**

### Environment variables (Render dashboard)

| Variable | Where to find it |
|----------|-----------------|
| `SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role key (the long `eyJ...` JWT) |
| `SUPABASE_JWT_AUDIENCE` | Set to `authenticated` |
| `SUPABASE_JWT_JWK` | Run `curl https://<project>.supabase.co/auth/v1/.well-known/jwks.json` and paste the single key object from the `keys` array |
| `OPENROUTER_API_KEY` | openrouter.ai → Keys |
| `BRIDGE_SERVER_KEY` | Optional — leave blank if not using Bridge RESO |

### Redeploying
Render auto-deploys on every `git push` to `main`. To trigger manually:
Render dashboard → your service → **Manual Deploy → Deploy latest commit**

---

## Frontend (Vercel)

### First-time setup
```bash
cd ~/Desktop/VAN/saveero/webapp
npm run build
vercel --prod
```
Follow the prompts. When asked for output directory, enter `dist`.

### Environment variables (Vercel dashboard)
Go to Vercel → your project → **Settings → Environment Variables** and add:

| Variable | Value |
|----------|-------|
| `VITE_SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon/public key |
| `VITE_API_URL` | Your Render URL e.g. `https://saveero-7nu9.onrender.com` |
| `VITE_FRED_API_KEY` | fred.stlouisfed.org → API Keys (free) |

> ⚠️ Vite bakes env vars into the build at compile time. Vercel builds on their servers using dashboard vars — your local `webapp/.env` is only for local dev.

### Redeploying after code changes
```bash
cd ~/Desktop/VAN/saveero/webapp
vercel --prod
```
No need to run `npm run build` separately — Vercel handles it.

### Redeploying after env var changes only
Just run `vercel --prod` again after updating the Vercel dashboard — no code commit needed.

---

## Local development

### Backend
```bash
cd ~/Desktop/VAN/saveero
python3 -m uvicorn main:app --reload
```
Reads from `saveero/.env`. Make sure all vars are filled in there.

### Frontend
```bash
cd ~/Desktop/VAN/saveero/webapp
npm run dev
```
Reads from `webapp/.env`. Set `VITE_API_URL=` (blank) so requests go to the Vite proxy at `localhost:8000`.

---

## Supabase setup (one-time)

1. Create project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the contents of `db/migrations/001_initial_schema.sql`
3. Go to **Authentication → Settings** → turn off **Enable email confirmations** (for easy dev/demo login)
4. Copy keys from **Settings → API** into your `.env` files and Render/Vercel dashboards

---

## Gotchas learned the hard way

- **Render, not Railway** — Railway's DNS cannot resolve Supabase hostnames. Use Render.
- **Service role key** — must be the long `eyJ...` JWT from Supabase, not the `sb_publishable_...` key.
- **SUPABASE_JWT_JWK** — Railway/Render can't fetch this at runtime; pre-fetch it locally with `curl` and paste the value as an env var.
- **VITE_ prefix** — all frontend env vars must start with `VITE_` or Vite won't expose them to the browser.
- **Build on Vercel** — always let Vercel build (`vercel --prod`), never deploy a locally-built `dist/` to Vercel, or the Vercel dashboard env vars won't be baked in.
