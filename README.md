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

## Frontend Architecture

The Saveero frontend is a **React 18 + Vite 5 + TypeScript SPA** that provides an intuitive interface for real estate agents to generate AI listings, calculate mortgages, and manage properties.

**Key highlights:**
- **Type-safe** — Full TypeScript coverage with no `any` types
- **Responsive design** — Mobile-first Tailwind CSS with dark theme
- **Real-time calculations** — Interactive mortgage calculator with live Federal Reserve rates
- **AI-powered workflow** — 3-step listing wizard with photo analysis
- **Secure authentication** — Supabase JWT + automatic token refresh

**Main pages:**
- **Dashboard** (`/`) — View all saved listings with status and pricing
- **List Property** (`/list-property`) — 3-step wizard to upload photos and generate AI listings
- **Mortgage Calculator** (`/mortgage-calculator`) — Calculate payments with live rates and full amortization
- **Scenario Comparison** (`/scenarios`) — Compare up to 3 loan options side-by-side
- **Login** — Secure email/password authentication via Supabase

**For comprehensive architecture documentation**, see **[FRONTEND.md](./FRONTEND.md)** which covers:
- Detailed folder structure and component organization
- API layer design (auth, listings, rates)
- State management patterns using React hooks
- Mortgage calculation library
- Development workflow (adding pages, components, API calls)
- Deployment and performance optimization strategies

---

## Backend Architecture

The saveero backend is a **FastAPI-based Python service** that powers the core AI listing generation, property management, and authentication workflows.

**Key highlights:**
- **Async-first design** — Concurrent API calls to OpenRouter, Supabase, and other services
- **Secure authentication** — Supabase JWT with ES256 validation, no runtime JWKS fetches
- **Row-level security** — Multi-tenant data isolation enforced at the database level
- **Image analysis pipeline** — Vision models + LLM orchestration for photo → MLS listing
- **Intelligent caching** — Disk-based image cache prevents re-analyzing the same photos

**Main API endpoints:**
- **POST /api/listings/generate** — Upload photos, receive AI-generated listing with pricing and comps
- **POST /api/listings/save** — Persist listing to database
- **GET /api/listings** — List all user properties
- **GET /api/listings/{id}** — Get single property with comparables
- **GET /api/health** — Health check

**External integrations:**
- **OpenRouter** — Vision (Gemini 2.5-Flash) and LLM models (Claude Sonnet, Perplexity)
- **Supabase** — PostgreSQL database + JWT authentication
- **FRED API** — Live mortgage rates (integrated on frontend)

**Tech stack:**
- FastAPI + Python 3.11
- Supabase (PostgreSQL + Auth)
- OpenRouter (multimodal AI)
- LangChain + asyncio for concurrent processing
- Render.com for hosting

**For comprehensive architecture documentation**, see **[BACKEND.md](./BACKEND.md)** which covers:
- Detailed system architecture and data flow
- Complete folder structure and file purposes
- All API endpoints with request/response examples
- Database schema and row-level security policies
- JWT authentication and authorization
- External service integrations (OpenRouter, Supabase, FRED)
- AI listing generation workflow (7-step pipeline)
- Error handling, security, and performance considerations
- Local development setup and testing
- Deployment instructions for Render.com
- Troubleshooting guide and future improvements

### Quick Start

```bash
cd webapp
npm install

# Copy and fill .env with Supabase and FRED API keys
cp .env.example .env

# Start dev server (opens at http://localhost:5173)
npm run dev
```

### Folder Structure

```
webapp/src/
├── pages/          # Route-level components (Login, Dashboard, ListProperty, etc.)
├── components/ui/  # Reusable UI primitives (Button, Card, Input, etc.)
├── api/            # HTTP clients (auth.ts, listingApi.ts, ratesApi.ts)
└── lib/            # Utilities (mortgage.ts, utils.ts)
```

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
# Install dependencies
pip install -r requirements.txt

# Copy and fill in the backend env file
cp .env.example .env
```

Edit `.env` with your Supabase and OpenRouter keys:
- **SUPABASE_URL** — From Supabase dashboard Settings → API
- **SUPABASE_SERVICE_ROLE_KEY** — From Supabase dashboard Settings → API
- **SUPABASE_JWT_JWK** — Fetch from `https://<your-project>.supabase.co/auth/v1/.well-known/jwks.json`
- **OPENROUTER_API_KEY** — From openrouter.ai

Run the database schema migration:
1. Log into your Supabase dashboard
2. Go to SQL Editor → "New Query"
3. Copy the contents of `db/migrations/001_initial_schema.sql`
4. Paste and execute

Start the backend:
```bash
python3 -m uvicorn main:app --reload
```

Backend API available at `http://localhost:8000`
- Access docs at `http://localhost:8000/docs` (Swagger UI)
- Health check: `curl http://localhost:8000/api/health`

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
