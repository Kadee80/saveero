# Saveero

AI-powered home decision platform for real estate agents. Upload property photos, generate complete MLS listings, analyze mortgage scenarios, and manage all your listings from one dashboard.

## Features

- **AI Listing Wizard** — upload photos and get a fully written listing with pricing, comps, and highlights in seconds
- **Mortgage Calculator** — live rates from the Federal Reserve FRED API with payment breakdowns
- **Scenario Comparison** — compare up to 3 loan options side by side
- **Dashboard** — manage all saved listings with status tracking
- **Auth** — secure login/signup via Supabase

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite + TypeScript + Tailwind CSS |
| Backend | FastAPI + Python 3.11 |
| Database + Auth | Supabase (Postgres + JWT) |
| AI | OpenRouter (vision + text models) |
| Frontend hosting | Vercel |
| Backend hosting | Render |

---

## Local Development

### Prerequisites
- Python 3.11 (via pyenv recommended)
- Node.js 18+
- A Supabase project
- An OpenRouter API key

### 1. Clone the repo
```bash
git clone https://github.com/Kadee80/saveero.git
cd saveero
```

### 2. Backend setup
```bash
pip install -r requirements.txt
```

Copy and fill in the backend env file:
```bash
cp .env.example .env
```

Run the schema migration in your Supabase SQL Editor:
```sql
-- paste contents of db/migrations/001_initial_schema.sql
```

Start the backend:
```bash
python3 -m uvicorn main:app --reload
```
API available at `http://localhost:8000`

### 3. Frontend setup
```bash
cd webapp
npm install
```

Copy and fill in the frontend env file:
```bash
cp .env.example .env
```

Start the dev server:
```bash
npm run dev
```
App available at `http://localhost:5173`

---

## Environment Variables

### Backend (`saveero/.env`)

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role JWT (Settings → API) |
| `SUPABASE_JWT_AUDIENCE` | Set to `authenticated` |
| `SUPABASE_JWT_JWK` | Public key JSON from `<supabase-url>/auth/v1/.well-known/jwks.json` |
| `OPENROUTER_API_KEY` | OpenRouter API key |
| `BRIDGE_SERVER_KEY` | Optional — Bridge RESO MLS API key |

### Frontend (`webapp/.env`)

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `VITE_API_URL` | Backend URL (blank for local dev, Render URL for production) |
| `VITE_FRED_API_KEY` | FRED API key for live mortgage rates (free at fred.stlouisfed.org) |

---

## Deployment

See [DEPLOYING.md](./DEPLOYING.md) for full step-by-step instructions covering Render (backend), Vercel (frontend), and Supabase setup.

---

## Project Structure

```
saveero/
├── main.py                  # FastAPI app entry point
├── requirements.txt
├── api/
│   └── listing_wizard_routes.py   # Listing generate/save/list endpoints
├── core/
│   ├── auth.py              # JWT authentication dependency
│   ├── config.py            # Pydantic settings (reads from .env)
│   └── database.py          # Supabase client singleton
├── listing_wizard/
│   ├── listing_generator.py # AI listing generation (OpenRouter + LangChain)
│   ├── image_describer.py   # Vision model image analysis
│   └── models.py            # Pydantic data models
├── mortgage/                # Mortgage calculation logic
├── db/
│   └── migrations/          # SQL schema files
├── webapp/                  # React frontend (Vite)
│   ├── src/
│   │   ├── pages/           # Dashboard, ListProperty, MortgageCalculator, ScenarioComparison, Login
│   │   ├── api/             # Frontend API clients (auth, listings, rates)
│   │   └── components/      # Shared UI components
│   └── vercel.json          # Vercel routing config
├── DEPLOYING.md             # Deployment guide
└── CONTRIBUTING.md          # Local setup and contribution guide
```
