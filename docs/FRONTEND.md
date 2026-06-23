# Saveero Frontend Architecture

**Version:** 0.1.0  
**Tech Stack:** React 18 + Vite 5 + TypeScript 5 + Tailwind CSS 3  
**Status:** Active Development

---

## Table of Contents

1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Folder Structure](#folder-structure)
4. [Architecture & Data Flow](#architecture--data-flow)
5. [Pages & Features](#pages--features)
6. [Components](#components)
7. [API Layer](#api-layer)
8. [State Management](#state-management)
9. [Utilities & Helpers](#utilities--helpers)
10. [Development Workflow](#development-workflow)
11. [Key Design Patterns](#key-design-patterns)
12. [Deployment](#deployment)
13. [Future Improvements](#future-improvements)

---

## Overview

The Saveero frontend is a React/Vite single-page application (SPA) designed to help real estate agents:

- **Upload property photos** and generate AI-powered MLS listings
- **Calculate mortgage scenarios** with live rates from the Federal Reserve
- **Compare loan options** side-by-side to help clients make decisions
- **Manage saved listings** in a centralized dashboard with status tracking
- **Authenticate securely** via Supabase email/password or social sign-in

The frontend is fully type-safe with TypeScript, styled with Tailwind CSS, and communicates with a FastAPI backend via REST API. The app is hosted on **Vercel** and supports production-grade features like JWT token refresh, error handling, and graceful fallbacks.

### Key Characteristics

- **Responsive design** — Mobile-first Tailwind CSS, works on all devices
- **Type-safe** — Full TypeScript coverage, no `any` types
- **Async-first** — Handles API calls, loading states, and errors gracefully
- **Dark theme** — Slate-based color palette with high contrast
- **Zero state management library** — Uses React hooks (useState, useEffect) for simplicity
- **CORS-aware** — Proxies FRED API calls to work around browser restrictions

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Framework** | React 18.3 | UI components and state management |
| **Build Tool** | Vite 5 | Fast development server and optimized production builds |
| **Language** | TypeScript 5 | Type safety and developer experience |
| **Styling** | Tailwind CSS 3 | Utility-first CSS, responsive design |
| **UI Components** | Radix UI + shadcn/ui patterns | Accessible, unstyled primitives |
| **Icons** | Lucide React 0.469 | Consistent icon library |
| **Routing** | React Router 6 | Client-side routing with lazy loading ready |
| **Forms** | React Hook Form 7 | Lightweight form state and validation |
| **File Upload** | React Dropzone 14 | Drag-and-drop file uploads |
| **Image Gallery** | React Photo View 1.2 | Lightbox for property photos |
| **Auth** | Supabase (@supabase/supabase-js 2.49) | JWT tokens, session management, email auth |
| **HTTP** | Fetch API | Native browser HTTP client |
| **CSS Utilities** | clsx, tailwind-merge | Dynamic class merging |

### Dev Dependencies

- `@types/react`, `@types/react-dom` — TypeScript definitions
- `@vitejs/plugin-react` — Fast Refresh for HMR (Hot Module Replacement)
- `postcss`, `autoprefixer` — CSS processing
- Radix UI primitives — `@radix-ui/react-*`

---

## Folder Structure

```
webapp/
├── src/
│   ├── main.tsx                 # Entry point, React 18 createRoot
│   ├── App.tsx                  # Main app shell with routing and auth check
│   ├── index.css                # Global Tailwind + custom styles
│   ├── vite-env.d.ts            # Vite environment type definitions
│   │
│   ├── pages/                   # Page components (route-level)
│   │   ├── Login.tsx            # Sign-in / Sign-up page
│   │   ├── Dashboard.tsx        # View saved listings, sort, filter
│   │   ├── ListProperty.tsx     # 3-step listing wizard
│   │   ├── MortgageCalculator.tsx  # Interactive rate + payment calculator
│   │   └── ScenarioComparison.tsx  # Compare up to 3 loan options
│   │
│   ├── components/
│   │   └── ui/                  # Reusable UI component library
│   │       ├── button.tsx       # Button with variants (primary, outline, ghost)
│   │       ├── card.tsx         # Card container, header, content, footer
│   │       ├── input.tsx        # Text input with placeholder, error states
│   │       ├── label.tsx        # Form label with required indicator
│   │       ├── textarea.tsx     # Multi-line text input
│   │       └── badge.tsx        # Small labeled badge/pill
│   │
│   ├── api/                     # REST API client modules
│   │   ├── auth.ts              # Supabase auth: sign-in, sign-up, logout
│   │   ├── listingApi.ts        # POST /api/listings/generate, /save, GET /list
│   │   └── ratesApi.ts          # Fetch mortgage rates from FRED API
│   │
│   └── lib/                     # Utility functions and helpers
│       ├── mortgage.ts          # Pure mortgage calculation functions
│       └── utils.ts             # cn() for class merging, formatCurrency()
│
├── public/                      # Static assets (favicon, etc.)
├── index.html                   # HTML entry point
├── package.json                 # Dependencies and scripts
├── tsconfig.json                # TypeScript configuration
├── tsconfig.node.json           # TypeScript for Vite config
├── vite.config.ts               # Vite build and dev server config
├── tailwind.config.js           # Tailwind CSS configuration
├── postcss.config.js            # PostCSS plugins
└── .env.example                 # Environment variables template

```

### Directory Details

**pages/** — Route-level components, one per main route. Each page:
- Handles its own async data fetching with useEffect
- Manages local state (form inputs, loading, errors)
- May render multiple sub-components
- Should be lazy-loaded in production for code splitting

**components/ui/** — Reusable, unstyled UI primitives following shadcn/ui patterns:
- No business logic, only presentation
- Fully accessible (ARIA, keyboard navigation)
- Styled via `cn()` utility for Tailwind classes
- Each component exports a single default export

**api/** — HTTP clients organized by resource:
- `auth.ts` — Supabase authentication
- `listingApi.ts` — Listing CRUD operations
- `ratesApi.ts` — Mortgage rates from Federal Reserve
- All requests include JWT token automatically via `authHeader()`

**lib/** — Pure functions with no side effects:
- `mortgage.ts` — Mortgage math (calculations only, no API calls)
- `utils.ts` — String formatting, CSS utilities

---

## Architecture & Data Flow

### High-Level Data Flow

```
User Browser
    ↓
[App.tsx]
├─ Check auth state (Supabase session)
├─ If logged out → show Login page
├─ If logged in → show main UI with routing
│
├─ [Router]
│  ├─ / → Dashboard (list listings)
│  ├─ /list-property → ListProperty (3-step wizard)
│  ├─ /mortgage-calculator → MortgageCalculator (rates + calc)
│  └─ /scenarios → ScenarioComparison (side-by-side)
│
├─ [Sidebar Nav] (persistent)
│  ├─ Links to pages
│  ├─ Show user email
│  └─ Sign out button
│
└─ [Main Content]
   └─ Renders current page
```

### Request/Response Cycle

```
Component
  ↓
API Module (api/auth.ts, api/listingApi.ts)
  ├─ Add Authorization header (JWT token)
  ├─ Serialize request body (FormData or JSON)
  ↓
[Vite Proxy in dev] OR [Vercel backend in prod]
  ↓
FastAPI Backend (localhost:8000 or https://api.saveero.com)
  ├─ Validate JWT token via Supabase
  ├─ Process request (AI, database, rates API)
  ↓
Response
  ├─ JSON response with data or error
  ↓
API Module
  ├─ Parse JSON
  ├─ Throw error if !response.ok
  ↓
Component
  ├─ Update local state (data or error)
  ├─ Re-render UI
  ↓
User sees result
```

### Session & Token Management

```
App.tsx
  ├─ On mount: supabase.auth.getSession()
  │  └─ Hydrate session state from localStorage
  │
  └─ Subscribe to auth state changes
     ├─ On sign-in: Supabase stores JWT locally, fires onAuthStateChange
     ├─ On sign-out: JWT removed from localStorage, session = null
     ├─ On token refresh: Supabase auto-refreshes expired tokens
     └─ Component updates, user sees new UI
```

### Supabase Client Setup

The Supabase client is configured in `src/api/auth.ts`:

```typescript
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnon)
```

The client:
- Stores JWT in localStorage automatically
- Refreshes expired tokens automatically
- Broadcasts auth state changes via `onAuthStateChange()`
- Sends JWT with every Supabase-authenticated request

---

## Pages & Features

### 1. Login Page (`/pages/Login.tsx`)

**Route:** None (shown when not authenticated)

**Purpose:** Sign up or sign in with email/password.

**Features:**
- Toggle between "Sign In" and "Sign Up" modes
- Email validation (basic)
- Password minimum 6 characters
- Error and info message banners
- Loading state during auth operations
- Signup confirmation notice (check email)

**Data Flow:**

```
User enters email/password
  ↓
Click "Sign In" or "Sign Up"
  ↓
[handleSubmit]
  ├─ Call signIn() or signUp() from auth.ts
  ├─ Supabase creates session or returns error
  ↓
On success:
  ├─ App.tsx's onAuthStateChange fires
  ├─ session state updates from undefined → Session
  ├─ Main UI renders (Login unmounts)
  ↓
On error:
  ├─ Error message shown in banner
  ├─ User can retry
```

**Key Code:**

```typescript
// From Login.tsx
async function handleSubmit(e: React.FormEvent) {
  setLoading(true)
  const { error } = await signIn(email, password)
  if (error) setError(error.message)
  // On success, no explicit redirect — onAuthStateChange triggers App re-render
}
```

---

### 2. Dashboard (`/pages/Dashboard.tsx`)

**Route:** `/`

**Purpose:** View all saved listings with metadata, status, and pricing.

**Features:**
- Summary cards (total, active, draft counts)
- Table view of all listings
  - Address, status badge, price, beds, baths, created date
  - Color-coded status (draft, published, active)
- "New Listing" button links to ListProperty
- Loading and error states
- Empty state prompt if no listings
- User email display

**Data Flow:**

```
Dashboard mounts
  ↓
useEffect:
  ├─ getUser() → fetch current user email
  ├─ listingApi.list() → GET /api/listings
  └─ Store in state: listings, loading, error
  ↓
While loading: Show spinner
  ↓
On error: Show error banner (except 401, which is expected if not logged in)
  ↓
On success: Render listing table with each row showing key details
```

**Listing Status:**
- **draft** — Not yet published, can be edited
- **published** — Live, visible to buyers
- **active** — Currently being marketed

---

### 3. List Property (3-Step Wizard) (`/pages/ListProperty.tsx`)

**Route:** `/list-property`

**Purpose:** Upload property photos and generate an AI-powered MLS listing.

**Features:**
- **Step 1: Photos & Address**
  - Drag-and-drop or click to upload photos
  - Preview gallery with lightbox
  - Text field for property address
  - Optional notes for AI context (renovations, pricing targets, etc.)
  - "Next" button validates and generates listing
  
- **Step 2: Review & Edit**
  - Display generated listing with all AI-detected details
  - Editable description field
  - Show price range, beds, baths, sqft, features, highlights
  - Display comparable properties and their prices
  - "Edit" and "Next" buttons
  
- **Step 3: Confirm & Save**
  - Final review of key details
  - "Save Listing" button calls POST /api/listings/save
  - Success message and link back to dashboard

**Data Flow:**

```
Step 1: User uploads photos + enters address
  ↓
Click "Next"
  ↓
API Call: listingApi.generate({ images, address, notes })
  ├─ POST multipart/form-data to /api/listings/generate
  ├─ Backend analyzes photos with vision AI
  ├─ Returns GeneratedListing with all fields
  ↓
Move to Step 2: Show generated listing
  ↓
User reviews/edits description
  ↓
Click "Next"
  ↓
Move to Step 3: Final review
  ↓
Click "Save Listing"
  ↓
API Call: listingApi.save(listing)
  ├─ POST JSON to /api/listings/save
  ├─ Backend stores in database
  ├─ Returns { success: true, id: '...' }
  ↓
Show success message + link to Dashboard
```

**State Management:**

```typescript
const [step, setStep] = useState(1)  // 1, 2, or 3
const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([])
const [address, setAddress] = useState('')
const [notes, setNotes] = useState('')
const [generated, setGenerated] = useState<GeneratedListing | null>(null)
const [loading, setLoading] = useState(false)
const [error, setError] = useState<string | null>(null)
```

---

### 4. Mortgage Calculator (`/pages/MortgageCalculator.tsx`)

**Route:** `/mortgage-calculator`

**Purpose:** Calculate monthly payments and loan costs with live Federal Reserve rates.

**Features:**
- **Input Section:**
  - Purchase price, down payment, interest rate, loan term (15/20/30 yr)
  - Property tax rate, homeowner insurance, HOA dues
  - Rate buttons to fetch live FRED rates for selected term
  
- **Output Section:**
  - Monthly payment breakdown (P&I, tax, insurance, PMI, HOA)
  - Loan-to-value (LTV) percentage
  - PMI warning if LTV > 80%
  - Total interest and total cost of loan
  - Month to PMI payoff
  
- **Amortization Schedule:**
  - Expandable annual snapshots (show first year in detail)
  - Year-by-year summary table
  - Shows principal, interest, balance for each year

**Data Flow:**

```
MortgageCalculator mounts
  ├─ Set default form values (e.g., 30-yr, 6.5% rate)
  ├─ Call fetchCurrentRates() to get live FRED rates
  │  └─ If available: show "Live rates from Federal Reserve"
  │  └─ If unavailable: show fallback rates + warning
  ├─ Store rates in state
  ↓
User changes any form field (purchase price, down payment, rate, term)
  ├─ React Hook Form updates form state
  ├─ useEffect watches form values
  ├─ Call analyzeMortgage() from lib/mortgage.ts (pure function)
  ├─ Update summary state with calculations
  ↓
Render summary:
  ├─ Monthly payment breakdown
  ├─ Total costs
  ├─ Amortization schedule
  ↓
User clicks "Get Live Rates"
  ├─ Fetch new rates for selected term from FRED
  ├─ Update rate field
  ├─ Summary recalculates automatically
```

**Mortgage Math:**

The calculator uses pure functions in `lib/mortgage.ts`:

- `calcMonthlyPayment(loanAmount, rate, years)` — Standard amortization formula
- `calcPmi(balance, purchasePrice, loanAmount)` — ~0.5% annually if LTV > 80%
- `buildAmortization(loanAmount, rate, years)` — 360 rows for 30-yr, etc.
- `analyzeMortgage(inputs)` — Comprehensive summary with all metrics

---

### 5. Scenario Comparison (`/pages/ScenarioComparison.tsx`)

**Route:** `/scenarios`

**Purpose:** Compare up to 3 loan options side-by-side (e.g., 15yr vs 30yr, or different down payments).

**Features:**
- Up to 3 scenarios shown in columns
- Each scenario has input fields (purchase price, down, rate, term, taxes, insurance, HOA)
- Real-time comparison of:
  - Monthly payment
  - Total interest
  - Total cost
  - LTV
  - PMI status
  - Years to pay off
- "Remove" button to delete a scenario
- "Add Scenario" button to add a new one (max 3)

**Data Flow:**

```
ScenarioComparison mounts
  ├─ Initialize 2 default scenarios
  ├─ Fetch live rates once on mount
  ↓
User edits any field in any scenario
  ├─ Update scenario state
  ├─ Call analyzeMortgage() for that scenario
  ├─ All scenarios stay in sync on re-render
  ↓
Render 3 columns (up to 3 scenarios)
  ├─ Side-by-side input forms
  ├─ Summary cards with key metrics
  ├─ Colored highlights for best value (lowest payment, etc.)
  ↓
User clicks "Add Scenario" or "Remove"
  ├─ Modify scenarios array
  ├─ Re-render with new count
```

---

## Components

### UI Component Library (`components/ui/`)

All UI components follow **shadcn/ui patterns** — accessible, unstyled primitives combined with Tailwind CSS. Each component:
- Exports a single default component
- Accepts standard HTML props
- Uses `cn()` to merge Tailwind classes
- Supports variants via `class-variance-authority`

#### Button (`button.tsx`)

**Variants:** primary, outline, ghost, destructive  
**Sizes:** sm, md, lg  
**States:** disabled, loading

**Usage:**

```typescript
<Button onClick={handleClick}>Click me</Button>
<Button variant="outline">Outline</Button>
<Button disabled>Disabled</Button>
<Button className="w-full">Full width</Button>
```

#### Card (`card.tsx`)

**Parts:**
- `<Card>` — Container
- `<CardHeader>` — Top section (title, description)
- `<CardTitle>` — Card heading
- `<CardDescription>` — Subtitle/helper text
- `<CardContent>` — Main content area
- `<CardFooter>` — Bottom section (buttons, etc.)

**Usage:**

```typescript
<Card>
  <CardHeader>
    <CardTitle>My Card</CardTitle>
    <CardDescription>A brief description</CardDescription>
  </CardHeader>
  <CardContent>Main content here</CardContent>
  <CardFooter>
    <Button>Action</Button>
  </CardFooter>
</Card>
```

#### Input (`input.tsx`)

Standard text input with placeholder, disabled, error states.

**Usage:**

```typescript
<Input
  type="text"
  placeholder="Enter text..."
  value={value}
  onChange={(e) => setValue(e.target.value)}
  disabled={isLoading}
/>
```

#### Label (`label.tsx`)

Form label with optional required indicator.

**Usage:**

```typescript
<Label htmlFor="email">Email Address *</Label>
<Input id="email" type="email" />
```

#### Textarea (`textarea.tsx`)

Multi-line text input with resize control.

**Usage:**

```typescript
<Textarea
  placeholder="Enter description..."
  value={description}
  onChange={(e) => setDescription(e.target.value)}
  rows={5}
/>
```

#### Badge (`badge.tsx`)

Small pill-shaped labels with variant styling.

**Usage:**

```typescript
<Badge>draft</Badge>
<Badge variant="success">active</Badge>
<Badge variant="secondary">secondary</Badge>
```

---

## API Layer

### Overview

The API layer provides thin, typed wrappers around HTTP requests. All modules:
- Automatically include JWT authorization header
- Parse JSON responses
- Throw errors on non-2xx responses
- Are fully typed with TypeScript interfaces

### API Base URL

Determined by environment:
- **Development:** Empty string (Vite proxy to `http://localhost:8000`)
- **Production:** `VITE_API_URL` env var (e.g., `https://api.saveero.com`)

```typescript
// From listingApi.ts
const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
```

### Authentication Module (`api/auth.ts`)

**Singleton:** `supabase` client instance

**Functions:**

| Function | Purpose | Returns |
|----------|---------|---------|
| `signIn(email, password)` | Sign in with email/password | `{ data, error }` |
| `signUp(email, password)` | Create new account | `{ data, error }` |
| `signOut()` | Logout, clear session | `{ error }` |
| `getSession()` | Get current session (no refresh) | `Session \| null` |
| `getUser()` | Get current user (refreshes token) | `User \| null` |
| `authHeader()` | Get `Authorization: Bearer <token>` | `string \| null` |

**Key Patterns:**

```typescript
// Always check errors
const { data, error } = await signIn('user@example.com', 'password')
if (error) {
  console.error('Sign-in failed:', error.message)
}

// Use authHeader() to include JWT in API calls
const auth = await authHeader()
fetch('/api/listings', {
  headers: { Authorization: auth ?? '' }
})

// Or use apiFetch() helper (see listingApi.ts for example)
```

### Listing API (`api/listingApi.ts`)

**Endpoints:**

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/listings/generate` | Upload photos, get AI listing |
| `POST` | `/api/listings/save` | Save listing to database |
| `GET` | `/api/listings` | Fetch user's listings |

**Main Types:**

```typescript
// Input for listing generation
interface ListingFormData {
  images: File[]
  address: string
  notes: string
}

// Output from generation
interface GeneratedListing {
  title: string
  address: string
  price_range: string
  recommended_price: number
  bedrooms: number
  bathrooms: number
  square_feet?: number
  features: PropertyFeature[]
  highlights: string[]
  description: string
  similar_properties: SimilarProperty[]
  // ... 30+ other fields
}

// Saved listing from GET /api/listings
interface SavedListing {
  id: string
  address: string
  status: 'draft' | 'published' | 'active'
  price_mid: number | null
  beds: number | null
  baths: number | null
  description_ai: string | null
  created_at: string
}
```

**API Client:**

```typescript
export const listingApi = {
  async generate(data: ListingFormData): Promise<GeneratedListing> {
    // Multipart/form-data for images
  },

  async save(listing: GeneratedListing): Promise<{ success: boolean; id?: string }> {
    // JSON body with listing fields
  },

  async list(): Promise<SavedListing[]> {
    // GET request, no body
  }
}
```

**Usage Example:**

```typescript
// In ListProperty.tsx
const listing = await listingApi.generate({
  images: [photo1, photo2],
  address: '123 Main St, Anytown, CA',
  notes: 'Recently renovated'
})

// Later, save to database
await listingApi.save(listing)
```

### Rates API (`api/ratesApi.ts`)

**Purpose:** Fetch current US mortgage rates from the Federal Reserve FRED API.

**Main Type:**

```typescript
interface CurrentRates {
  rate30yr: number    // e.g., 6.82
  rate15yr: number    // e.g., 6.13
  rate20yr: number    // interpolated (6.48)
  asOf: string        // ISO date of latest data
  source: 'fred' | 'fallback'  // live or estimated
}
```

**Function:**

```typescript
export async function fetchCurrentRates(): Promise<CurrentRates>
```

**Behavior:**

- Fetches latest 30yr and 15yr rates from FRED API
- Interpolates 20yr as average of 15yr and 30yr (FRED doesn't publish 20yr)
- Falls back to hardcoded estimates if FRED unavailable
- Never throws — always returns `CurrentRates`

**CORS Workaround:**

Browsers block direct CORS requests to api.stlouisfed.org, so:
- Dev: Vite proxy routes `/fred-proxy/*` to `https://api.stlouisfed.org/fred/*`
- Prod: Vercel routes requests through backend to avoid CORS

**Fallback Rates:**

```typescript
// Updated April 2026
rate30yr: 6.82
rate15yr: 6.13
rate20yr: 6.48
```

**Usage:**

```typescript
const rates = await fetchCurrentRates()
console.log(`30-year rate: ${rates.rate30yr}%`)
console.log(`Source: ${rates.source}`)

// Fallback to estimated if API unavailable
if (rates.source === 'fallback') {
  console.warn('Using estimated rates — check API key')
}
```

---

## State Management

### Philosophy

**No global state library** — the codebase is simple enough for React hooks alone:
- Component-level state via `useState()`
- Side effects via `useEffect()`
- Context API for session/auth (if needed in future)

This keeps dependencies minimal and code easy to understand.

### Common Patterns

#### Loading States

```typescript
const [loading, setLoading] = useState(false)

async function handleAction() {
  setLoading(true)
  try {
    const result = await listingApi.generate(data)
    setListing(result)
  } catch (err) {
    setError(err.message)
  } finally {
    setLoading(false)
  }
}

return (
  <>
    {loading && <Spinner />}
    {error && <Alert>{error}</Alert>}
    {listing && <ListingDisplay listing={listing} />}
  </>
)
```

#### Effect Dependencies

```typescript
useEffect(() => {
  // Fetch listings on mount
  listingApi.list().then(setListings).catch(setError)
}, []) // Empty deps = run once on mount

useEffect(() => {
  // Recalculate when form changes
  const summary = analyzeMortgage(formValues)
  setSummary(summary)
}, [JSON.stringify(formValues)]) // Stringify to detect value changes
```

#### Form State with React Hook Form

```typescript
import { useForm } from 'react-hook-form'

const { register, watch, handleSubmit } = useForm({
  defaultValues: { address: '', notes: '' }
})

const address = watch('address')

return (
  <form onSubmit={handleSubmit(onSubmit)}>
    <input {...register('address')} placeholder="Address" />
  </form>
)
```

#### Session State in App.tsx

```typescript
const [session, setSession] = useState<Session | null | undefined>(undefined)

useEffect(() => {
  // Hydrate session from storage
  supabase.auth.getSession().then(({ data }) => setSession(data.session))

  // Subscribe to auth changes
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    setSession(session)
  })
  return () => subscription.unsubscribe()
}, [])

// Show loading screen while checking session
if (session === undefined) return <LoadingScreen />
if (session === null) return <Login />
return <MainApp />
```

---

## Utilities & Helpers

### Mortgage Library (`lib/mortgage.ts`)

Pure functions for mortgage math. No side effects, fully deterministic, easily testable.

#### Main Functions

**calcMonthlyPayment()**
```typescript
calcMonthlyPayment(300000, 6.75, 30)  // Returns 1979.73
// Uses standard amortization formula: M = P * r(1+r)^n / ((1+r)^n - 1)
```

**calcPmi()**
```typescript
calcPmi(270000, 300000, 270000)  // Returns 112.50 (0.5% annually)
// PMI drops to $0 when balance <= 80% of purchase price
```

**buildAmortization()**
```typescript
const schedule = buildAmortization(300000, 6.75, 30)
// Returns 360 rows (30 years * 12 months)
// Each row: month, payment, principal, interest, balance
```

**analyzeMortgage()**
```typescript
const summary = analyzeMortgage({
  purchasePrice: 500000,
  downPayment: 100000,
  annualRatePercent: 6.75,
  termYears: 30,
  annualPropertyTaxPercent: 1.2,
  annualInsuranceDollars: 1800,
  monthlyHoa: 300
})

console.log(summary.monthly.total)       // Total monthly payment
console.log(summary.totalInterestPaid)   // Total interest over 30 years
console.log(summary.ltv)                 // Loan-to-value percentage
console.log(summary.amortization[0])     // First month details
```

#### Key Assumptions

- Fixed-rate mortgages only (no ARMs)
- Monthly payments
- PMI = ~0.5% of loan amount annually (industry average)
- PMI drops when balance <= 80% of purchase price
- Property tax and insurance are fixed rates (not adjusted for inflation)

### Utils Library (`lib/utils.ts`)

#### cn() — Tailwind Class Merging

Combines `clsx` + `tailwind-merge` to intelligently merge Tailwind classes, handling specificity conflicts.

```typescript
cn('px-2 py-1', 'px-4')  // px-4 wins: 'py-1 px-4'
cn('text-sm', { 'font-bold': isActive })  // Conditional classes
cn(['bg-blue-500', 'rounded-lg'], 'hover:bg-blue-600')

// In components:
<div className={cn('p-4', isActive && 'bg-blue-500')}>
```

#### formatCurrency() — Dollar Formatting

Formats numbers as US currency with no decimal places.

```typescript
formatCurrency(1500)      // "$1,500"
formatCurrency(1500.75)   // "$1,501" (rounded)
formatCurrency(0)         // "$0"
formatCurrency(-5000)     // "-$5,000"
```

---

## Development Workflow

### Setup

1. **Install dependencies:**
   ```bash
   cd webapp
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your Supabase and FRED API keys
   ```

3. **Start dev server:**
   ```bash
   npm run dev
   # Opens at http://localhost:5173
   ```

### Adding a New Page

1. **Create component in `pages/`:**
   ```bash
   touch src/pages/MyNewPage.tsx
   ```

2. **Implement component:**
   ```typescript
   // src/pages/MyNewPage.tsx
   import { useState, useEffect } from 'react'
   import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
   import { Button } from '@/components/ui/button'

   export default function MyNewPage() {
     const [data, setData] = useState(null)
     const [loading, setLoading] = useState(false)
     const [error, setError] = useState<string | null>(null)

     useEffect(() => {
       setLoading(true)
       // Fetch data
       setLoading(false)
     }, [])

     return (
       <div className="space-y-4">
         <h1 className="text-2xl font-bold">My New Page</h1>
         {/* Content */}
       </div>
     )
   }
   ```

3. **Add route in `App.tsx`:**
   ```typescript
   // In navItems array:
   { to: '/my-new-page', label: 'My Page', icon: MyIcon }

   // In Routes:
   <Route path="/my-new-page" element={<MyNewPage />} />
   ```

4. **Test in browser:**
   - Navigate to `/my-new-page`
   - Check console for errors
   - Verify loading/error states

### Adding an API Endpoint Call

1. **Extend API module (`api/listingApi.ts`, etc.):**
   ```typescript
   // At the end of listingApi.ts
   export async function myNewFunction(params: MyParams): Promise<MyResponse> {
     return apiFetch<MyResponse>('/api/my-endpoint', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify(params)
     })
   }
   ```

2. **Define types:**
   ```typescript
   interface MyParams {
     field1: string
     field2: number
   }

   interface MyResponse {
     success: boolean
     data?: string
   }
   ```

3. **Use in component:**
   ```typescript
   import { listingApi } from '@/api/listingApi'

   const result = await listingApi.myNewFunction({ field1: 'value', field2: 42 })
   ```

4. **Test with backend:**
   - Verify backend endpoint exists and is deployed
   - Test error cases (invalid input, 500 errors)
   - Check JWT token is sent correctly

### Adding a UI Component

1. **Create component in `components/ui/`:**
   ```bash
   touch src/components/ui/mycomponent.tsx
   ```

2. **Implement with TypeScript + Tailwind:**
   ```typescript
   // src/components/ui/mycomponent.tsx
   import { cn } from '@/lib/utils'

   interface MyComponentProps {
     className?: string
     onClick?: () => void
     children: React.ReactNode
   }

   export default function MyComponent({ className, onClick, children }: MyComponentProps) {
     return (
       <div
         className={cn('p-4 rounded-lg bg-slate-100', className)}
         onClick={onClick}
       >
         {children}
       </div>
     )
   }
   ```

3. **Export and test:**
   ```typescript
   import MyComponent from '@/components/ui/mycomponent'

   <MyComponent className="bg-blue-500">Hello</MyComponent>
   ```

4. **Document variants and props:**
   - Add JSDoc comments
   - List optional props
   - Include usage examples

### Running Tests

**Currently:** No tests yet (todo for future)

When adding tests:
- Use Vitest (lightweight, Vite-native)
- Test pure functions (mortgage.ts, utils.ts)
- Mock API calls in page tests
- Aim for >80% coverage

---

## Key Design Patterns

### Error Handling in Async Operations

```typescript
// Pattern: try-catch-finally with state management
async function doSomething() {
  setLoading(true)
  setError(null)
  try {
    const result = await apiCall()
    setState(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    setError(message)
  } finally {
    setLoading(false)
  }
}

// In UI:
{error && <Alert className="bg-red-50 text-red-900">{error}</Alert>}
{loading && <Spinner />}
{data && <Display data={data} />}
```

### Loading States

Three states for async operations:

```typescript
const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
const [data, setData] = useState(null)
const [error, setError] = useState<string | null>(null)

async function fetch() {
  setStatus('loading')
  try {
    const result = await api()
    setData(result)
    setStatus('success')
  } catch (err) {
    setError(err.message)
    setStatus('error')
  }
}

return (
  <>
    {status === 'loading' && <Spinner />}
    {status === 'error' && <Alert>{error}</Alert>}
    {status === 'success' && <Display data={data} />}
  </>
)
```

### Authentication Token Management

**Supabase handles token refresh automatically:**

1. Client stores JWT in localStorage
2. On each API call, check if token expired
3. If expired and refresh token available, refresh automatically
4. If refresh fails, logout user
5. Use `authHeader()` to get current valid token

```typescript
// Always use authHeader() to ensure token is fresh
const auth = await authHeader()
fetch('/api/protected', { headers: { Authorization: auth ?? '' } })
```

### API Response Handling

**Pattern: Throw on error, parse on success**

```typescript
async function apiFetch<T>(url: string, init: RequestInit): Promise<T> {
  const auth = await authHeader()
  const headers = { ...(init.headers as Record<string, string> ?? {}) }
  if (auth) headers['Authorization'] = auth

  const res = await fetch(`${API_BASE}${url}`, { ...init, headers })

  // Throw error if not 2xx
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`${res.status} ${res.statusText}: ${text}`)
  }

  // Parse and return
  return res.json() as Promise<T>
}
```

### Conditional Rendering

```typescript
// Ternary for simple conditionals
return data ? <Display data={data} /> : <Empty />

// && for single condition
return loading && <Spinner />

// Multi-state
return (
  <>
    {!data && !loading && <Empty />}
    {loading && <Spinner />}
    {error && <Alert>{error}</Alert>}
    {data && <Display data={data} />}
  </>
)

// switch for complex logic
const content = (() => {
  switch (status) {
    case 'loading': return <Spinner />
    case 'error': return <Alert>{error}</Alert>
    case 'success': return <Display data={data} />
    default: return <Empty />
  }
})()
return <>{content}</>
```

### Form Validation

```typescript
// React Hook Form pattern
const { register, watch, formState: { errors }, handleSubmit } = useForm()

<input {...register('email', { required: 'Email is required' })} />
{errors.email && <span className="text-red-600">{errors.email.message}</span>}

// Manual validation
function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

if (!validateEmail(email)) {
  setError('Invalid email')
  return
}
```

---

## Deployment

### Vercel (Frontend)

**Configuration:** `vercel.json` routes all requests to `index.html` for client-side routing.

**Environment Variables:**

Set in Vercel project settings:
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase public key
- `VITE_API_URL` — Backend URL (e.g., `https://api.saveero.com`)
- `VITE_FRED_API_KEY` — Federal Reserve API key

**Deployment:**

```bash
# From repo root
# Push to main branch → Vercel auto-deploys
git push origin main
```

See [DEPLOYING.md](./DEPLOYING.md) for full instructions.

---

## Future Improvements

### Performance

- [ ] **Code splitting:** Lazy-load pages with `React.lazy()` and `Suspense`
- [ ] **Image optimization:** Use `<img srcSet>` for responsive images, WebP format
- [ ] **Caching:** Implement React Query for automatic API caching and deduplication
- [ ] **Bundle analysis:** Monitor bundle size with `webpack-bundle-analyzer`

### Features

- [ ] **Advanced search/filter:** Dashboard listing search by address, status, date range
- [ ] **Bulk actions:** Select multiple listings, batch update status
- [ ] **Listing editing:** Open saved listings in wizard to make changes
- [ ] **Photo management:** Delete/reorder/add photos to existing listings
- [ ] **Export:** Download listings as PDF or CSV
- [ ] **Social sharing:** Share listing links or scenarios with clients
- [ ] **Notifications:** Toast alerts for API errors, success messages

### State Management

- [ ] **React Query:** Replace manual fetch patterns with automatic caching
- [ ] **Context API:** Extract session/auth state to context for nested access
- [ ] **Zustand (if needed):** Lightweight alternative to Redux for complex state

### Testing

- [ ] **Unit tests:** Vitest for pure functions (mortgage.ts, utils.ts)
- [ ] **Component tests:** React Testing Library for pages and components
- [ ] **E2E tests:** Playwright or Cypress for full workflows
- [ ] **Coverage:** Aim for >80% coverage

### Accessibility

- [ ] **Keyboard navigation:** Ensure all interactive elements are keyboard-accessible
- [ ] **Screen readers:** Test with NVDA/JAWS
- [ ] **Color contrast:** Verify WCAG AA compliance
- [ ] **ARIA labels:** Add to dynamic content and form fields

### Developer Experience

- [ ] **Storybook:** Component library for isolated development and testing
- [ ] **ESLint + Prettier:** Automated linting and formatting
- [ ] **Husky + lint-staged:** Pre-commit hooks for code quality
- [ ] **API mocking:** MSW (Mock Service Worker) for offline development

### Monitoring

- [ ] **Sentry:** Error tracking in production
- [ ] **Analyt ics:** Track user actions, feature usage
- [ ] **Performance monitoring:** Web Vitals, Core Web Vitals tracking
- [ ] **Uptime monitoring:** Alert on backend outages

---

## Troubleshooting

### Common Issues

**Issue:** "VITE_SUPABASE_URL is not set"
- **Solution:** Copy `.env.example` to `.env` and fill in values

**Issue:** API calls return 401 Unauthorized
- **Solution:** Check JWT token is valid, login again, verify `authHeader()` is used

**Issue:** Rates page shows fallback rates
- **Solution:** Check `VITE_FRED_API_KEY` is set, verify API key is valid at `fred.stlouisfed.org`

**Issue:** Photos not uploading
- **Solution:** Check file size limits on backend, verify backend is running, check console for CORS errors

**Issue:** Vite dev server won't start
- **Solution:** Kill process on port 5173, clear `node_modules` and reinstall, check Node version (18+)

---

## Quick Reference

### File Locations

| Task | File |
|------|------|
| Add/remove page | `src/App.tsx` (routes) + `src/pages/` |
| Add API endpoint | `src/api/auth.ts`, `listingApi.ts`, or `ratesApi.ts` |
| Add UI component | `src/components/ui/` |
| Mortgage calculations | `src/lib/mortgage.ts` |
| Tailwind config | `tailwind.config.js` |
| Vite config | `vite.config.ts` |

### Key Imports

```typescript
// Components
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

// API
import { signIn, signOut, getUser, authHeader } from '@/api/auth'
import { listingApi } from '@/api/listingApi'
import { fetchCurrentRates } from '@/api/ratesApi'

// Utilities
import { cn, formatCurrency } from '@/lib/utils'
import { analyzeMortgage } from '@/lib/mortgage'

// React + third-party
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
```

### Environment Variables

**Development (`.env`):**
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_FRED_API_KEY=your-fred-key
VITE_API_URL=  # empty for localhost:8000 proxy
```

**Production (Vercel):**
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_FRED_API_KEY=your-fred-key
VITE_API_URL=https://api.saveero.com
```

---

## Getting Help

- **Vite docs:** https://vitejs.dev
- **React docs:** https://react.dev
- **Tailwind docs:** https://tailwindcss.com
- **TypeScript:** https://www.typescriptlang.org
- **Supabase auth:** https://supabase.com/docs/guides/auth
- **FRED API:** https://fred.stlouisfed.org/docs/api

---

**Last Updated:** April 2026  
**Maintained By:** Saveero Team
