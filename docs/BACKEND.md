# Saveero Backend Architecture

A comprehensive guide to the saveero FastAPI backend, covering architecture, API endpoints, database layer, authentication, external integrations, and development workflows.

---

## Overview

The saveero backend is a **FastAPI-based Python service** that powers the core business logic for a real estate agent platform. Its primary responsibilities are:

1. **AI-Powered Listing Generation** — Analyze property photos using vision models, extract features, and generate complete MLS listings with pricing
2. **Property & Listing Management** — Store and retrieve user properties, pricing data, and comparable properties
3. **Authentication & Authorization** — Secure JWT-based auth via Supabase with row-level security (RLS)
4. **External Integrations** — Connect to OpenRouter (AI), Supabase (database), FRED API (mortgage rates), and optional MLS data sources
5. **Image Analysis & Caching** — Process property photos through vision models with disk-based caching to reduce API costs

The backend serves a React/Vite frontend and handles both synchronous and asynchronous workflows. It's designed for horizontal scalability on Render.com with PostgreSQL backing via Supabase.

---

## Tech Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Framework** | FastAPI | High-performance async web server |
| **Language** | Python 3.11 | Core application language |
| **Async Runtime** | asyncio + uvicorn | Async I/O for external API calls |
| **Database** | Supabase (PostgreSQL) | Relational data + JWT auth |
| **ORM/Query** | Supabase Python client | Low-level SQL via PostgreSQL |
| **AI Models** | OpenRouter | Vision (Gemini 2.5-Flash) + LLMs (Claude Sonnet, Perplexity) |
| **Auth** | Supabase JWT | Token generation + verification (ES256) |
| **Vision Library** | LangChain + OpenAI SDK | Multimodal model calls |
| **External APIs** | FRED API (optional), Bridge RESO | Mortgage rates, MLS data |
| **Deployment** | Render.com | Container-based Python hosting |

---

## Architecture & Design

### High-Level Data Flow

```
User (React Frontend)
    ↓ [JWT + Photos]
FastAPI Router (auth dependency validates JWT)
    ↓
ListingGenerator (orchestrates AI pipeline)
    ├→ AsyncImageDescriber (vision → image analysis)
    ├→ ListingLLM (Claude Sonnet → structured JSON)
    ├→ SearchLLM (Perplexity → comparable properties)
    └→ PricingLLM (Claude Sonnet → valuation)
    ↓
Supabase (store user data, properties, comps)
    ↓
Response JSON → React Frontend
```

### Key Architectural Decisions

1. **Async-First Design** — All external API calls (OpenRouter, Supabase) are async to maximize throughput
2. **Cached Vision Analysis** — Image descriptions are hashed and cached to disk (.image_cache/) to avoid re-analyzing the same photos
3. **Service Role + User JWT** — Backend uses service_role key for admin ops, passes user JWT to Supabase for RLS enforcement
4. **Separation of Concerns** — Auth (core/auth.py), config (core/config.py), database (core/database.py), and business logic (listing_wizard/) are isolated
5. **Pydantic Models** — Type-safe data validation with GeneratedListing, PropertyFeature, SimilarProperty, etc.
6. **Router-Based Organization** — Each domain (listings, mortgages, scenarios) gets its own router file under api/
7. **Environment-Driven Config** — All secrets and URLs live in .env, loaded via Pydantic Settings once at startup

---

## Folder Structure

```
saveero/
├── main.py                           # FastAPI app entry point + routes mounting
├── requirements.txt                  # Python dependencies
├── .env.example                      # Template for environment variables
│
├── core/                             # Core utilities
│   ├── __init__.py
│   ├── config.py                     # Pydantic Settings (loads .env)
│   ├── auth.py                       # JWT validation + CurrentUser dependency
│   └── database.py                   # Supabase client singletons
│
├── api/                              # Route handlers (FastAPI routers)
│   ├── __init__.py
│   └── listing_wizard_routes.py      # POST/GET /api/listings/... endpoints
│
├── listing_wizard/                   # AI listing generation pipeline
│   ├── __init__.py
│   ├── models.py                     # Pydantic data models (GeneratedListing, etc.)
│   ├── image_describer.py            # AsyncImageDescriber (vision model calls)
│   └── listing_generator.py          # ListingGenerator (orchestrator)
│
├── mortgage/                         # Mortgage calculation logic (future)
│   └── __init__.py
│
├── db/                               # Database schema & migrations
│   └── migrations/
│       └── 001_initial_schema.sql    # PostgreSQL schema definition
│
├── tests/                            # Unit + integration tests
│   ├── conftest.py                   # Pytest fixtures
│   ├── test_auth.py
│   └── test_listing_routes.py
│
└── webapp/                           # React frontend (Vite)
    ├── src/
    │   ├── pages/                    # Route-level components
    │   ├── components/               # Reusable UI components
    │   └── api/                      # Frontend API clients
    └── dist/                         # Built frontend (mounted as static files)
```

### File Purposes

| File | Purpose |
|------|---------|
| **main.py** | FastAPI app init, CORS setup, router registration, static file mounting |
| **core/config.py** | Load .env variables into a Settings object (cached singleton) |
| **core/auth.py** | JWT validation dependency; returns user claims dict on success |
| **core/database.py** | Supabase client factories (service_role and user-scoped) |
| **api/listing_wizard_routes.py** | FastAPI router with POST /listings/generate, /save, GET /listings, etc. |
| **listing_wizard/models.py** | Pydantic models for type-safe data contracts |
| **listing_wizard/image_describer.py** | Vision model client (base64/URL → JSON descriptions) |
| **listing_wizard/listing_generator.py** | Orchestrator; runs the full photo → listing pipeline |
| **db/migrations/001_initial_schema.sql** | PostgreSQL table definitions, indexes, RLS policies |

---

## Environment Configuration

### Required Environment Variables

Create a `.env` file in the project root (never commit it). Copy from `.env.example`:

```bash
cp .env.example .env
```

#### Backend Variables (saveero/.env)

| Variable | Example | Description |
|----------|---------|-------------|
| **SUPABASE_URL** | `https://xxxxx.supabase.co` | Supabase project URL (Settings → API) |
| **SUPABASE_SERVICE_ROLE_KEY** | `eyJhbGc...` | Service role JWT (Settings → API → service_role key) |
| **SUPABASE_JWT_AUDIENCE** | `authenticated` | Audience claim in JWT tokens (default: authenticated) |
| **SUPABASE_JWT_JWK** | `{"kty": "EC", ...}` | Public key JSON for JWT validation (copy from `/auth/v1/.well-known/jwks.json`) |
| **OPENROUTER_API_KEY** | `sk-or-...` | OpenRouter API key (get from openrouter.ai) |
| **BRIDGE_SERVER_KEY** | `(optional)` | Bridge RESO API key for MLS data (fallback to Perplexity if not set) |
| **FRONTEND_DIST** | `webapp/dist` | Path to built frontend assets (for serving from backend) |

### How to Get Each Key

**Supabase:**
1. Create a free project at supabase.com
2. Go to Settings → API
3. Copy "Project URL" → **SUPABASE_URL**
4. Copy "service_role key" → **SUPABASE_SERVICE_ROLE_KEY**
5. Fetch the JWK public key:
   ```bash
   curl https://<your-project>.supabase.co/auth/v1/.well-known/jwks.json | jq '.keys[0]' > jwk.json
   ```
   Copy the JSON object into **SUPABASE_JWT_JWK**

**OpenRouter:**
1. Sign up at openrouter.ai
2. Go to Settings → API Keys
3. Generate a new key, copy it → **OPENROUTER_API_KEY**

**FRED API (optional, for mortgage rates):**
1. Register at fred.stlouisfed.org
2. Get API key from Account → API Keys
3. This is needed on the **frontend**, not the backend

---

## Database Layer

### Supabase Setup & Connection

The backend uses the **Supabase Python client** to interact with PostgreSQL. The client is initialized once per process:

```python
# core/database.py
from supabase import create_client, Client
from core.config import settings

def get_db() -> Client:
    """Returns a cached Supabase client (service_role key)."""
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
```

**Two connection modes:**

1. **Service Role (Admin)** — Used by backend internally
   - Bypasses row-level security (RLS)
   - Used for admin operations and migrations
   ```python
   db = get_db()  # Returns client with service_role key
   ```

2. **User-Scoped** — Respects RLS policies
   - Created per-request with user's JWT
   - Ensures users can only see their own data
   ```python
   db = get_user_db(jwt)  # Returns client scoped to user's JWT
   ```

### Database Schema Overview

The schema (in `db/migrations/001_initial_schema.sql`) defines these core tables:

#### 1. **users** — User profiles

```sql
CREATE TABLE public.users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  role USER_ROLE (seller|agent|admin),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**RLS Policy:** Users can only read their own row (id = auth.uid())

#### 2. **properties** — Property listings

```sql
CREATE TABLE public.properties (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id),
  address TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  beds INTEGER,
  baths INTEGER,
  sqft INTEGER,
  year_built INTEGER,
  status PROPERTY_STATUS (draft|published|active),
  price_min_suggested NUMERIC(14,2),
  price_max_suggested NUMERIC(14,2),
  price_mid NUMERIC(14,2),
  price_confidence NUMERIC(5,2),
  description_ai TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

**RLS Policy:** Users can only read/write properties they own (owner_id = auth.uid())

#### 3. **comps** — Comparable properties

```sql
CREATE TABLE public.comps (
  id UUID PRIMARY KEY,
  property_id UUID NOT NULL REFERENCES properties(id),
  source COMP_SOURCE (mls|llm),
  address TEXT,
  price NUMERIC(14,2),
  beds INTEGER,
  baths NUMERIC(4,1),
  sqft INTEGER,
  raw_json JSONB  -- Store full comp data as JSON
);
```

**RLS Policy:** Inherited from parent property (users see comps for their own properties)

#### 4. **property_photos** — Photo metadata

```sql
CREATE TABLE public.property_photos (
  id UUID PRIMARY KEY,
  property_id UUID NOT NULL REFERENCES properties(id),
  url TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  labels_json JSONB
);
```

#### 5. **offers** — Purchase offers (future)

```sql
CREATE TABLE public.offers (
  id UUID PRIMARY KEY,
  property_id UUID NOT NULL REFERENCES properties(id),
  buyer_info JSONB,
  offer_price NUMERIC(14,2),
  contingencies JSONB
);
```

### Row-Level Security (RLS) Policies

All user-facing tables have RLS enabled and policies:

**Enable RLS:**
```sql
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
```

**Create policy (users can only see their own properties):**
```sql
CREATE POLICY users_own_properties
  ON public.properties
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);
```

**Check RLS:**
```sql
-- In Supabase SQL editor, verify policies are in place:
SELECT * FROM pg_policies WHERE schemaname = 'public';
```

### Migrations & How to Run Them

**Initial setup:**
1. Log into your Supabase dashboard
2. Go to SQL Editor → "New Query"
3. Copy the contents of `db/migrations/001_initial_schema.sql`
4. Paste and run

**For future migrations:**
1. Create a new file: `db/migrations/002_add_new_table.sql`
2. Run the same way in Supabase SQL Editor
3. Or use a migration tool like Alembic (not currently set up)

---

## Authentication & Authorization

### JWT Token Structure

Supabase generates ES256-signed JWT tokens. A decoded token looks like:

```json
{
  "sub": "550e8400-e29b-41d4-a716-446655440000",  // User ID (UUID)
  "email": "user@example.com",
  "email_confirmed_at": "2024-01-15T10:30:00Z",
  "aud": "authenticated",
  "iat": 1705316400,
  "exp": 1705402800,
  "iss": "https://xxxxx.supabase.co/auth/v1"
}
```

**Key claims:**
- `sub` — User ID (used in RLS policies via `auth.uid()`)
- `email` — User's email address
- `aud` — Audience ("authenticated" for regular users)
- `exp` — Expiration time (typically 1 hour)

### JWT Validation Flow

The backend validates every request using the `/core/auth.py` dependency:

```python
# Request comes in with Authorization header:
# Authorization: Bearer eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9...

# FastAPI dependency extracts and validates:
from core.auth import CurrentUser

@router.get("/listings")
async def list_listings(user: CurrentUser):
    # 'user' is a dict of JWT claims
    user_id = user["sub"]  # UUID
    email = user["email"]  # String
    ...
```

**Validation steps:**
1. Check Authorization header exists and starts with "Bearer "
2. Extract token after "Bearer "
3. Use pre-loaded EC public key from env (SUPABASE_JWT_JWK)
4. Verify signature using ES256 algorithm
5. Check audience ("authenticated")
6. Check expiration time
7. Return claims dict or raise HTTP 401

**Why no runtime JWKS fetch?** The public key is cached in SUPABASE_JWT_JWK at startup, so no network call is needed per-request. This is faster and more resilient than fetching from Supabase's JWKS endpoint each time.

### Protected Endpoints

All endpoints requiring authentication use the CurrentUser dependency:

```python
from core.auth import CurrentUser

@router.get("/api/listings")
async def list_listings(user: CurrentUser) -> List[Dict]:
    """Only authenticated users can list their properties."""
    user_id = user["sub"]
    # Fetch from database, RLS enforces user can only see their own rows
    ...
```

**Unprotected endpoints:**
- `GET /api/health` — Health check (no auth needed)
- `GET /` — Serve frontend index.html
- `POST /auth/signup` — (would be added in future)

### Token Refresh & Expiration

Tokens expire after ~1 hour. The **frontend** is responsible for:
1. Storing the token (in memory or localStorage)
2. Calling Supabase's refresh endpoint when expired
3. Re-sending the new token in future requests

The backend doesn't issue or refresh tokens — Supabase handles this.

---

## API Endpoints

### POST /api/listings/generate

**Generate an AI-powered listing from property photos.**

**Request:**
```bash
curl -X POST http://localhost:8000/api/listings/generate \
  -H "Authorization: Bearer {JWT_TOKEN}" \
  -F "images=@kitchen.jpg" \
  -F "images=@living_room.jpg" \
  -F "address=123 Main St, San Francisco, CA 94102" \
  -F "notes=Recently updated kitchen, hardwood floors throughout"
```

**Form Parameters:**
- `images[]` (File, required) — Property photos (jpg, png, webp). At least one required.
- `address` (String, required) — Full property address
- `notes` (String, optional) — Agent or seller notes about the property

**Response (200 OK):**
```json
{
  "title": "Stunning Victorian in Mission District",
  "address": "123 Main St, San Francisco, CA 94102",
  "address_line1": "123 Main St",
  "address_line2": "",
  "city": "San Francisco",
  "region": "CA",
  "zip_code": "94102",
  "country": "USA",
  "property_type": "Single Family Home",
  "bedrooms": 3,
  "bathrooms": 2,
  "bathrooms_full": 2,
  "bathrooms_half": 0,
  "square_feet": 2100,
  "living_area": 2100,
  "lot_size_value": 2500,
  "lot_size_unit": "sqft",
  "year_built": 1920,
  "parking_total": 2.0,
  "parking_garage": 2,
  "parking_covered": 0,
  "parking_open": 0,
  "heating_type": ["Forced Air"],
  "cooling_type": ["Central AC"],
  "water_type": ["Municipal"],
  "foundation_type": ["Wood Pier"],
  "roof_type": ["Composition Shingle"],
  "exterior_material": ["Painted Wood"],
  "description": "Step into charm and character. This 1920s Victorian home in the heart of the Mission District features original hardwood floors throughout, a recently renovated kitchen with quartz counters and stainless appliances, and two full bathrooms. The spacious living areas offer plenty of natural light. Two-car garage provides convenient parking. Move-in ready.",
  "features": [
    {
      "feature_type": "Kitchen",
      "count": 1,
      "description": "Renovated kitchen with quartz counters, stainless steel appliances, glass backsplash, and walk-in pantry",
      "square_feet": 150,
      "features": ["Island seating", "Hardwood floors"],
      "dimensions": "12' x 15'"
    },
    {
      "feature_type": "Master Bedroom",
      "count": 1,
      "description": "Spacious master with hardwood floors and large bay window",
      "square_feet": 200,
      "dimensions": "14' x 16'"
    }
  ],
  "amenities": ["Hardwood floors", "Bay windows", "High ceilings", "Fireplace"],
  "highlights": ["Recently updated kitchen", "Two-car garage", "Hardwood throughout"],
  "neighborhood_info": "Vibrant Mission District location near restaurants and transit",
  "location_features": ["Close to public transportation", "Walk to shops and restaurants"],
  "latitude": 37.7599,
  "longitude": -122.4148,
  "similar_properties": [
    {
      "address": "456 Oak St, San Francisco, CA",
      "price": 1200000,
      "bedrooms": 3,
      "bathrooms": 2.0,
      "property_type": "Single Family Home",
      "description": "Similar Victorian, recently renovated",
      "square_feet": 2050,
      "distance": "0.3 miles"
    }
  ],
  "price_range": "$1,150,000 – $1,280,000",
  "recommended_price": 1215000.0,
  "price_confidence": 0.85,
  "image_descriptions": [
    {
      "photo_type": "Inside",
      "description": "Modern kitchen with quartz countertops, stainless appliances...",
      "text": "",
      "filename": "kitchen.jpg"
    }
  ],
  "wide_image_analysis": {
    "beds": 3,
    "total_baths": 2,
    "year_built_estimate": 1920,
    "description": "Three-bedroom Victorian home with original character..."
  }
}
```

**Error Responses:**
- `400 Bad Request` — Missing images, invalid file format, or no relevant property images found
- `401 Unauthorized` — Missing or invalid JWT token
- `500 Internal Server Error` — AI pipeline failure (see logs)

**Example with curl (multipart):**
```bash
curl -X POST http://localhost:8000/api/listings/generate \
  -H "Authorization: Bearer eyJhbGc..." \
  -F "images=@photo1.jpg" \
  -F "images=@photo2.jpg" \
  -F "address=123 Main St, San Francisco, CA 94102" \
  -F "notes=Hardwood floors, recently renovated"
```

---

### POST /api/listings/save

**Save a generated listing to the database.**

**Request:**
```bash
curl -X POST http://localhost:8000/api/listings/save \
  -H "Authorization: Bearer {JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "address": "123 Main St, San Francisco, CA 94102",
    "headline": "Stunning Victorian in Mission District",
    "description": "Step into charm and character...",
    "price_min": 1150000,
    "price_max": 1280000,
    "price_mid": 1215000,
    "price_confidence": 0.85,
    "beds": 3,
    "baths": 2.0,
    "sqft": 2100,
    "features": [
      "Hardwood floors",
      "Two-car garage",
      "Recently renovated kitchen"
    ],
    "comps": [
      {
        "address": "456 Oak St, San Francisco, CA",
        "price": 1200000,
        "beds": 3,
        "sqft": 2050,
        "source": "llm"
      }
    ]
  }'
```

**Request Body (SaveListingRequest):**
```python
class SaveListingRequest(BaseModel):
    address: str                              # Property address
    headline: str                             # Listing title
    description: str                          # Full listing description
    price_min: Optional[float] = None         # Min suggested price
    price_max: Optional[float] = None         # Max suggested price
    price_mid: Optional[float] = None         # Mid price (recommended)
    price_confidence: Optional[float] = None  # Confidence score (0-1)
    beds: Optional[int] = None                # Bedroom count
    baths: Optional[float] = None             # Bathroom count (can be .5)
    sqft: Optional[int] = None                # Square footage
    features: List[str] = []                  # Feature list (strings)
    comps: List[Dict[str, Any]] = []          # Comparable properties
```

**Response (200 OK):**
```json
{
  "success": true,
  "id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Side Effects:**
- Creates user profile in `public.users` if not exists
- Inserts property into `public.properties`
- Inserts comparable properties into `public.comps`

**Error Responses:**
- `401 Unauthorized` — Missing or invalid JWT
- `500 Internal Server Error` — Database insert failed

---

### GET /api/listings

**Fetch all properties for the current user.**

**Request:**
```bash
curl -X GET http://localhost:8000/api/listings \
  -H "Authorization: Bearer {JWT_TOKEN}"
```

**Response (200 OK):**
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "address": "123 Main St, San Francisco, CA 94102",
    "status": "draft",
    "price_mid": 1215000,
    "price_min_suggested": 1150000,
    "price_max_suggested": 1280000,
    "beds": 3,
    "baths": 2,
    "description_ai": "Step into charm and character...",
    "created_at": "2024-01-15T10:30:00Z"
  },
  {
    "id": "660f9411-f3ac-52e5-b827-557766551111",
    "address": "456 Oak St, San Francisco, CA 94103",
    "status": "published",
    "price_mid": 950000,
    "price_min_suggested": 900000,
    "price_max_suggested": 1000000,
    "beds": 2,
    "baths": 1,
    "description_ai": "Charming Edwardian in Haight...",
    "created_at": "2024-01-10T15:45:00Z"
  }
]
```

**Query Parameters:** None (uses authenticated user's ID)

**Ordering:** Newest first (created_at DESC)

---

### GET /api/listings/{listing_id}

**Fetch a single property with all comparables.**

**Request:**
```bash
curl -X GET http://localhost:8000/api/listings/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer {JWT_TOKEN}"
```

**Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "owner_id": "user-uuid-here",
  "address": "123 Main St, San Francisco, CA 94102",
  "lat": 37.7599,
  "lng": -122.4148,
  "beds": 3,
  "baths": 2,
  "sqft": 2100,
  "year_built": 1920,
  "status": "draft",
  "price_mid": 1215000,
  "price_min_suggested": 1150000,
  "price_max_suggested": 1280000,
  "description_ai": "Step into charm and character...",
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z",
  "comps": [
    {
      "id": "comp-uuid-1",
      "property_id": "550e8400-e29b-41d4-a716-446655440000",
      "source": "llm",
      "address": "456 Oak St, San Francisco, CA",
      "price": 1200000,
      "beds": 3,
      "baths": 2.0,
      "sqft": 2050,
      "raw_json": { "full": "comp data" }
    }
  ]
}
```

**Error Responses:**
- `401 Unauthorized` — Missing JWT
- `404 Not Found` — Listing doesn't exist or user doesn't own it (RLS enforced)

---

### DELETE /api/listings/{listing_id}

**Delete a property (future endpoint).**

*Not yet implemented. Will require authentication and ownership verification.*

---

### GET /api/health

**Health check endpoint (no authentication required).**

**Request:**
```bash
curl http://localhost:8000/api/health
```

**Response (200 OK):**
```json
{
  "status": "ok",
  "version": "0.1.0"
}
```

---

### GET /api/listings/cache

**Retrieve image analysis cache statistics (development use).**

**Request:**
```bash
curl http://localhost:8000/api/listings/cache
```

**Response (200 OK):**
```json
{
  "enabled": true,
  "cache_dir": ".image_cache",
  "files": 47,
  "size_mb": 123.45
}
```

---

### POST /api/listings/cache/clear

**Flush the image analysis cache (development use).**

**Request:**
```bash
curl -X POST http://localhost:8000/api/listings/cache/clear
```

**Response (200 OK):**
```json
{
  "removed": 47,
  "message": "Cleared 47 cached results."
}
```

---

## External Service Integration

### OpenRouter (Vision + LLM Models)

The backend uses **OpenRouter** as a unified API gateway for multiple AI models.

**Models used:**
| Task | Model | Cost | Speed |
|------|-------|------|-------|
| Image analysis | google/gemini-2.5-flash | ~$0.02/image | Fast (2-3s) |
| Listing generation | anthropic/claude-sonnet-4 | ~$0.01/call | Medium (5-10s) |
| Comparable search | perplexity/sonar-pro | ~$0.02/call | Slow (10-20s) |
| Pricing analysis | anthropic/claude-sonnet-4 | ~$0.01/call | Medium (5-10s) |

**Why OpenRouter?**
- Unified API for multiple model providers
- No vendor lock-in (easy to swap models)
- Built-in rate limiting and fallback handling
- Automatic routing to cheapest/fastest provider

### Listing Generation Workflow (Photo → MLS)

The `/api/listings/generate` endpoint orchestrates a 7-step pipeline:

**Step 1: Individual Image Analysis (Parallel)**
```
For each photo:
  → AsyncImageDescriber.describe_image_file()
  → OpenRouter (Gemini 2.5-Flash)
  → Returns: { photo_type, description, text }
  → Cached to .image_cache/{hash}.pkl
```

**Step 2: Batch Image Analysis (Parallel)**
```
All photos together:
  → AsyncImageDescriber.describe_images_batch()
  → OpenRouter (Gemini 2.5-Flash)
  → Returns: { beds, baths, year_built_estimate, description }
```

**Step 3: Filter Irrelevant Images**
```
Remove aerial, aerial/useless photos
Keep: Inside, Outside, Plan photos
```

**Step 4: Generate Listing Structure (Claude Sonnet)**
```
Input:
  - Individual image descriptions
  - Batch analysis summary
  - Property address
  - Agent notes

Output:
  - GeneratedListing JSON (title, beds, baths, price_range, features, etc.)
```

**Step 5: Find Comparable Properties (Perplexity)**
```
Input:
  - Property address (stripped of house number for privacy)
  - Generated listing details (beds, baths, area)

Output:
  - List of similar properties (address, price, beds, sqft)
  - Either via Bridge RESO API (if configured) OR Perplexity web search (fallback)
```

**Step 6: Price the Listing (Claude Sonnet)**
```
Input:
  - Generated listing details
  - Comparable properties + their prices

Output:
  - { recommended_price, price_min, price_max, confidence_score }
```

**Step 7: Refine Description (Claude Sonnet)**
```
Input:
  - Original listing description
  - Location features (from batch analysis)

Output:
  - Enhanced description with neighborhood context
```

**Caching Strategy:**
- Image descriptions cached by MD5 hash of file content
- Cache survives across requests (persisted to disk)
- Saves ~$0.02 per re-analyzed image
- Clear cache manually via POST /api/listings/cache/clear

### Error Handling & Retries

```python
# Listing generation retries up to 3 times on failure
async def _generate_listing_with_retry(
    self,
    descriptions: List[Dict[str, Any]],
    address: str,
    notes: str,
    max_attempts: int = 3,
) -> GeneratedListing:
    for attempt in range(max_attempts):
        try:
            return await self._generate_listing(...)
        except Exception as exc:
            logger.warning("Attempt %d/%d failed: %s", attempt + 1, max_attempts, exc)
            if attempt == max_attempts - 1:
                raise
    raise RuntimeError("Listing generation failed after all retries")
```

**Fallback behavior:**
- If Bridge RESO API fails → Use Perplexity for comp search
- If batch analysis fails → Continue with individual image descriptions only
- If pricing fails → Return listing without price recommendation
- If description refinement fails → Return original description

---

### Supabase (Database + Auth)

**Authentication Flow:**

1. **Frontend** calls Supabase `auth.signUp()` or `auth.signInWithPassword()`
2. **Supabase** issues JWT token (ES256-signed)
3. **Frontend** stores token in memory/state
4. **Frontend** includes token in Authorization header for all API calls
5. **Backend** validates token using cached EC public key from SUPABASE_JWT_JWK
6. **Backend** extracts user_id (sub claim) and passes it to RLS policies

**Database Operations:**

```python
from core.database import get_db
from core.auth import CurrentUser

@router.get("/listings")
async def list_listings(user: CurrentUser):
    db = get_db()
    result = (
        db.table("properties")
        .select("id, address, status, price_mid")
        .eq("owner_id", user["sub"])  # RLS enforces this
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []
```

**Row-Level Security (RLS):**

All tables have RLS enabled. Example policy:

```sql
CREATE POLICY users_own_properties
  ON public.properties
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);
```

This means:
- SELECT queries automatically filtered to (owner_id = auth.uid())
- INSERT/UPDATE/DELETE requires ownership check
- Supabase enforces at the database level (no sneaking around in code)

---

### FRED API (Optional – Mortgage Rates)

*This integration lives on the frontend, but documented here for completeness.*

The FRED API provides live mortgage rates:
- 15-year fixed
- 30-year fixed
- 5/1 ARM

**Endpoint:** `https://api.stlouisfed.org/fred/series/data?series_id=MORTGAGE30US&api_key=...`

**Usage (Frontend):**
```typescript
const response = await fetch(
  `https://api.stlouisfed.org/fred/series/data?series_id=MORTGAGE30US&api_key=${apiKey}`
);
const data = await response.json();
const rate = data.observations.at(-1).value; // Latest rate
```

**Backend Note:** The mortgage calculation logic (monthly payments, amortization) is pure math in `mortgage/__init__.py`. No API calls from backend.

---

## Core Features & Workflows

### Listing Wizard Flow (Detailed)

The listing wizard is the heart of the platform. Here's the detailed flow:

**Entry Point:**
```
User uploads 3-5 property photos via frontend
  ↓
POST /api/listings/generate
  → FastAPI route receives multipart request
  → Saves photos to temporary directory
  → Calls ListingGenerator.run()
```

**Step 1: Validate & Save Photos**
```python
with tempfile.TemporaryDirectory() as tmp:
    for upload in images:
        if not upload.content_type.startswith("image/"):
            raise HTTPException(400, "Not an image")
        dest = Path(tmp) / f"image_{i}{ext}"
        dest.write_bytes(upload.file.read())
        image_paths.append(dest)
```

**Step 2: Analyze Photos**
```python
# Individual analysis (parallel)
descriptions = await asyncio.gather(*[
    image_describer.describe_image_file(path)
    for path in image_paths
])

# Batch analysis (parallel)
batch_analysis = await image_describer.describe_images_batch(image_paths)
```

**Step 3: Filter Relevant Images**
```python
relevant = [
    d for d in descriptions
    if d["photo_type"] not in {"Unknown", "Useless", "Aerial"}
]
if not relevant:
    raise ValueError("No relevant property images found")
```

**Step 4: Generate Listing**
```python
# Prompt Claude Sonnet with image descriptions
listing_json = await llm.ainvoke([
    SystemMessage(content=listing_system_prompt),
    HumanMessage(content=listing_user_prompt),
])

# Parse JSON and hydrate into GeneratedListing object
listing = GeneratedListing(**json_data)
```

**Step 5: Search for Comparables**
```python
# Use Perplexity to search for similar properties
search_prompt = f"""
Find 5 properties similar to:
  Address: {listing.address}
  Beds: {listing.bedrooms}
  Baths: {listing.bathrooms}
  Sqft: {listing.square_feet}

Return JSON with address, price, beds, baths, sqft for each.
"""

comps = await search_llm.ainvoke([...])
listing.similar_properties = comps
```

**Step 6: Price from Comparables**
```python
# Use Claude to analyze comps and suggest price
pricing_json = await pricing_llm.ainvoke([
    SystemMessage("You are a real estate pricing expert"),
    HumanMessage(f"Price this property based on comps: {comps_data}"),
])

listing.recommended_price = pricing_json["price"]
listing.price_range = f"${min_price:,.0f} – ${max_price:,.0f}"
```

**Step 7: Refine Description**
```python
# Use neighborhood info to enhance description
refined = await llm.ainvoke([
    SystemMessage("Refine the listing description with neighborhood context"),
    HumanMessage(f"Location features: {listing.location_features}\nCurrent description: {listing.description}"),
])

listing.description = refined.content
```

**Return to Frontend:**
```json
{
  "title": "...",
  "address": "...",
  "bedrooms": 3,
  "bathrooms": 2,
  "square_feet": 2100,
  "price_min": 1150000,
  "price_max": 1280000,
  "recommended_price": 1215000,
  "description": "...",
  "features": [...],
  "similar_properties": [...]
}
```

### Mortgage Calculations

*Currently a placeholder in `mortgage/__init__.py`. Future endpoint will calculate:*

- **Monthly payment** — (principal × rate) / (1 - (1 + rate)^-months)
- **Principal & interest** — Monthly P&I breakdown
- **PMI** — Private mortgage insurance (if down payment < 20%)
- **Property tax** — Estimated annual tax
- **Amortization schedule** — Full payment breakdown by month

These are pure math functions, no API calls needed.

---

## Error Handling

The backend uses FastAPI's built-in error handling with custom details:

**Standard HTTP errors:**
```python
from fastapi import HTTPException

# 400 Bad Request
raise HTTPException(status_code=400, detail="At least one image is required.")

# 401 Unauthorized
raise HTTPException(status_code=401, detail="Missing or invalid token.")

# 404 Not Found
raise HTTPException(status_code=404, detail="Listing not found.")

# 500 Internal Server Error
raise HTTPException(status_code=500, detail="Database error.")
```

**Custom exception handling:**
```python
try:
    listing = await generator.run(image_paths, address, notes)
except ValueError as exc:
    # Client error — bad input
    raise HTTPException(status_code=400, detail=str(exc))
except Exception as exc:
    # Server error — log and return 500
    logger.exception("Listing generation failed")
    raise HTTPException(status_code=500, detail=f"Listing generation failed: {exc}")
```

**Logging:**
```python
import logging
logger = logging.getLogger(__name__)

logger.info("Starting listing pipeline for %s (%d images)", address, len(image_paths))
logger.warning("Batch analysis failed: %s — continuing", exc)
logger.exception("Listing generation failed")
```

All errors are logged to stdout (captured by container logs on Render).

---

## Security Considerations

### JWT Validation

- Token is validated on every request using the `CurrentUser` dependency
- No endpoint accepts user_id from request body — always extracted from JWT claims
- Expiration is checked (typically 1 hour)
- Signature verified using EC public key from environment

**Key point:** The public key is cached, so no network call to Supabase on every request.

### Input Validation (Pydantic)

All request bodies are validated with Pydantic models:

```python
class SaveListingRequest(BaseModel):
    address: str
    headline: str
    description: str
    price_min: Optional[float] = None
    # etc.

@router.post("/listings/save")
async def save_listing(body: SaveListingRequest, user: CurrentUser):
    # 'body' is validated by Pydantic before the function is called
    # Invalid JSON or types raise 422 Unprocessable Entity
    ...
```

### SQL Injection Prevention

The Supabase Python client uses parameterized queries:

```python
# SAFE — uses parameterized query
result = db.table("properties").eq("id", user_id).execute()

# NOT directly concatenating SQL strings
```

### API Key Management

All API keys live in `.env`, never in code or frontend:

- **SUPABASE_SERVICE_ROLE_KEY** — Backend only, never sent to frontend
- **OPENROUTER_API_KEY** — Backend only
- **BRIDGE_SERVER_KEY** — Backend only

Frontend only receives:
- SUPABASE_URL (public)
- SUPABASE_ANON_KEY (public, limited to auth operations)
- API_URL (public, points to this backend)
- FRED_API_KEY (public, for public FRED data only)

### Rate Limiting

*Not currently implemented, but should be added before production.*

Consider using:
- FastAPI's built-in `slowapi` middleware for per-IP rate limiting
- OpenRouter's built-in rate limits (10 req/sec per key)
- Supabase's automatic rate limiting

---

## Performance Considerations

### Async/Await Patterns

All I/O operations are async:

```python
# Parallel image analysis — all requests at once
results = await asyncio.gather(*[
    image_describer.describe_image_file(path)
    for path in image_paths
])

# Parallel batch + individual analysis
individual_task = self._analyze_individually(image_paths)
batch_task = self._analyze_batch(image_paths, notes)
individual_descriptions, batch_analysis = await asyncio.gather(
    individual_task, batch_task, return_exceptions=True
)
```

This means:
- 3 image analyses don't take 3× as long
- Image analysis + batch analysis happen in parallel
- OpenRouter API calls are concurrent (limited by OpenRouter's rate limiting)

### Database Query Optimization

**Selecting only needed columns:**
```python
result = (
    db.table("properties")
    .select("id, address, status, price_mid")  # Only these columns
    .eq("owner_id", user_id)
    .execute()
)
```

**Relational queries (join with comps):**
```python
result = (
    db.table("properties")
    .select("*, comps(*)")  # Include related comps
    .eq("id", listing_id)
    .single()
    .execute()
)
```

**Future optimizations:**
- Add database indexes on owner_id, created_at
- Cache frequently-used data (user profiles, comp lists)
- Use materialized views for reporting

### Image Cache

Images analyzed once are cached to disk:

```python
def _cache_key(self, content: bytes) -> str:
    return hashlib.md5(content + self.model.encode()).hexdigest()

# Cache hit — no API call
cached = self._read_cache(cache_key)
if cached:
    logger.debug("Cache hit: %s", path.name)
    return cached

# Cache miss — call OpenRouter, then save
result = await self.describe_image(data_url)
self._write_cache(cache_key, result)
```

**Cache storage:** `.image_cache/` directory (disk-based, pickle format)

**Clear cache:** `POST /api/listings/cache/clear` (development use)

---

## Deployment

### Render.com Setup

1. **Connect repo** — Link GitHub repo to Render
2. **Create Web Service** — Select Python environment
3. **Configure environment:**
   - Set all variables from `.env` as environment variables
   - Use Render's PostgreSQL database (or Supabase)
4. **Deploy script:**
   ```bash
   pip install -r requirements.txt
   python3 -m uvicorn main:app --host 0.0.0.0 --port 8000
   ```
5. **Health check:** `GET /api/health`

### Environment Variables (Production)

Set these on Render (or any host):

```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
SUPABASE_JWT_JWK={"kty": "EC", ...}
OPENROUTER_API_KEY=sk-or-...
BRIDGE_SERVER_KEY=(optional)
FRONTEND_DIST=webapp/dist
```

### Database Migrations (Production)

1. Run migration in Supabase SQL Editor (one-time, before first deploy)
2. Future migrations: Add new .sql files, run manually
3. Consider Alembic for automated migrations (not set up currently)

### Monitoring & Logging

All logs go to stdout (captured by Render):

```python
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

logger.info("Starting listing pipeline for %s", address)
logger.warning("Image analysis failed: %s", exc)
logger.exception("Unexpected error")
```

View logs on Render dashboard or via CLI:
```bash
render logs --service-id ...
```

---

## Development Workflow

### Local Development Setup

```bash
# 1. Clone repo
git clone https://github.com/Kadee80/saveero.git
cd saveero

# 2. Install dependencies
pip install -r requirements.txt

# 3. Create .env file
cp .env.example .env
# Edit .env with your Supabase and OpenRouter keys

# 4. Run database migrations
# Copy/paste db/migrations/001_initial_schema.sql into Supabase SQL Editor

# 5. Start backend
python3 -m uvicorn main:app --reload

# 6. Start frontend (in another terminal)
cd webapp
npm install
npm run dev
```

Backend runs at `http://localhost:8000`
Frontend runs at `http://localhost:5173`

### Running the Server

```bash
# With auto-reload (development)
python3 -m uvicorn main:app --reload

# Without reload (production)
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000

# Custom host/port
python3 -m uvicorn main:app --host 127.0.0.1 --port 3000 --reload
```

### Testing Strategies

**Unit tests** (core utilities):
```bash
pytest tests/test_auth.py -v
```

**Integration tests** (full endpoints):
```bash
pytest tests/test_listing_routes.py -v
```

**Manual testing with curl:**
```bash
# Get JWT token first (from frontend login)
TOKEN="eyJhbGc..."

curl -X POST http://localhost:8000/api/listings/generate \
  -H "Authorization: Bearer $TOKEN" \
  -F "images=@photo.jpg" \
  -F "address=123 Main St" \
  -F "notes=test"
```

### Adding New Endpoints

1. Create new router in `api/new_routes.py`:
```python
from fastapi import APIRouter, Depends
from core.auth import CurrentUser

router = APIRouter(tags=["New Feature"])

@router.get("/new-endpoint")
async def new_endpoint(user: CurrentUser):
    return {"user_id": user["sub"]}
```

2. Register in `main.py`:
```python
from api.new_routes import router as new_router
app.include_router(new_router, prefix="/api")
```

3. Test with curl:
```bash
curl http://localhost:8000/api/new-endpoint \
  -H "Authorization: Bearer $TOKEN"
```

### Adding New Features

**Example: Add mortgage calculation endpoint**

1. Create `api/mortgage_routes.py`:
```python
from fastapi import APIRouter
from pydantic import BaseModel
from mortgage import calculate_payment

class MortgageRequest(BaseModel):
    principal: float
    rate: float
    months: int

@router.post("/mortgages/calculate")
async def calculate_mortgage(body: MortgageRequest):
    payment = calculate_payment(body.principal, body.rate, body.months)
    return {"monthly_payment": payment}
```

2. Register in `main.py`:
```python
from api.mortgage_routes import router as mortgage_router
app.include_router(mortgage_router, prefix="/api")
```

3. Implement business logic in `mortgage/__init__.py`:
```python
def calculate_payment(principal: float, annual_rate: float, months: int) -> float:
    """Calculate monthly P&I payment."""
    monthly_rate = annual_rate / 100 / 12
    if monthly_rate == 0:
        return principal / months
    return principal * (monthly_rate * (1 + monthly_rate)**months) / ((1 + monthly_rate)**months - 1)
```

---

## Troubleshooting

### Common Issues & Solutions

**Issue: "SUPABASE_JWT_JWK env var is not set"**
- **Cause:** Missing or empty SUPABASE_JWT_JWK in .env
- **Fix:**
  ```bash
  curl https://YOUR_PROJECT.supabase.co/auth/v1/.well-known/jwks.json | jq '.keys[0]'
  # Copy the JSON object into SUPABASE_JWT_JWK in .env
  ```

**Issue: "Invalid or expired token: InvalidSignatureError"**
- **Cause:** JWT signature validation failed (wrong public key or tampered token)
- **Fix:**
  - Verify SUPABASE_JWT_JWK matches your Supabase project
  - Verify token is fresh (not expired)
  - Regenerate token from frontend

**Issue: "Listing not found" (404)**
- **Cause:** User doesn't own the property (RLS enforced)
- **Fix:**
  - Verify property belongs to the logged-in user
  - Check owner_id in database matches user's UUID
  - Verify JWT token is for the correct user

**Issue: OpenRouter rate limit exceeded**
- **Cause:** Too many API calls
- **Fix:**
  - OpenRouter has rate limiting (10 req/sec per key)
  - Add exponential backoff retry logic
  - Clear image cache if re-testing with same photos

**Issue: "No relevant property images found"**
- **Cause:** Photos are aerial, useless, or unrelated to property
- **Fix:**
  - Upload clear interior/exterior/floorplan photos
  - Avoid cropped, blurry, or abstract images
  - Test individual images via GET /api/listings/cache

### Debugging Strategies

**Enable debug logging:**
```python
import logging
logging.basicConfig(level=logging.DEBUG)
logger = logging.getLogger(__name__)
```

**Inspect API requests/responses:**
```bash
# Add -v for verbose output
curl -v -X POST http://localhost:8000/api/listings/generate \
  -H "Authorization: Bearer $TOKEN" \
  -F "images=@photo.jpg" \
  -F "address=123 Main St"
```

**Check image cache:**
```bash
curl http://localhost:8000/api/listings/cache
# Returns: { "enabled": true, "files": 5, "size_mb": 12.34 }
```

**Clear cache and retry:**
```bash
curl -X POST http://localhost:8000/api/listings/cache/clear
# Then re-run generation
```

**Database inspection:**
1. Log into Supabase dashboard
2. Go to SQL Editor
3. Run queries:
   ```sql
   SELECT * FROM public.users LIMIT 5;
   SELECT * FROM public.properties WHERE owner_id = '...';
   SELECT * FROM public.comps WHERE property_id = '...';
   ```

### Log Analysis

Production logs on Render show:
```
INFO:uvicorn.access:127.0.0.1:5000 - "POST /api/listings/generate HTTP/1.1" 200
INFO:__main__:Starting listing pipeline for 123 Main St (3 images)
INFO:listing_wizard.image_describer:Cache hit: image_1.jpg
WARNING:listing_wizard.listing_generator:Batch analysis failed: ... — continuing without it
INFO:__main__:Listing generation complete in 45.2s
```

Look for:
- HTTP status codes (200, 400, 401, 500)
- Timing information ("complete in 45.2s")
- Cache hits/misses
- API failures and fallbacks
- Exceptions (search for "ERROR" or "WARNING")

---

## Future Improvements

### Feature Roadmap

- [ ] **Mortgage Calculator API** — POST /api/mortgages/calculate with full amortization
- [ ] **Scenario Comparison** — Save and compare multiple mortgage offers side-by-side
- [ ] **Property Photos** — Store uploaded photos in Supabase Storage, link to property
- [ ] **Offer Management** — Track and manage purchase offers per property
- [ ] **Email Notifications** — Alert users when comps update or prices change
- [ ] **Admin Dashboard** — Usage analytics, API quota monitoring

### Performance Optimizations

- [ ] Add database indexes on (owner_id, created_at)
- [ ] Implement Redis caching for frequently-accessed data (user profiles, top comps)
- [ ] Use materialized views for reporting queries
- [ ] Batch image uploads and process asynchronously (Celery/RQ)
- [ ] Implement request-level rate limiting (slowapi middleware)
- [ ] Add gzip compression for responses > 1KB

### Security Enhancements

- [ ] Implement rate limiting per IP and per user
- [ ] Add request signing (HMAC) for sensitive operations
- [ ] Implement audit logging (track who accessed what, when)
- [ ] Add CORS tightening (whitelist specific origins)
- [ ] Implement refresh token rotation
- [ ] Add input sanitization for XSS prevention

### Code Quality

- [ ] Increase test coverage (currently ~60%)
- [ ] Add type hints to all functions (mypy strict mode)
- [ ] Implement structured logging (JSON format)
- [ ] Add database migration tool (Alembic)
- [ ] Implement API versioning (v1/, v2/)
- [ ] Add OpenAPI schema documentation (Swagger UI)

### DevOps

- [ ] Docker image with multi-stage build
- [ ] Kubernetes deployment config (if scaling beyond Render)
- [ ] Database backups and point-in-time recovery
- [ ] Monitoring and alerting (Sentry, DataDog)
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Load testing and capacity planning

---

## Summary

The saveero backend is a modern, async-first FastAPI service designed to power AI-driven real estate workflows. It integrates multiple external services (OpenRouter, Supabase, FRED) while maintaining security through JWT validation and RLS policies. The architecture is modular and scalable, with clear separation between routing, business logic, and data access layers.

Key strengths:
- Type-safe with Pydantic models
- Fully async for high concurrency
- Secure JWT + RLS for multi-tenant data isolation
- Flexible external service integration
- Disk-based caching to reduce API costs

For questions or contributions, see CONTRIBUTING.md or contact the team.
