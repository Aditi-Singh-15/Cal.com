# Cal Clone (Node.js + PostgreSQL + React)

This repository implements a deterministic Cal.com-style scheduler with:

- No-login admin/public model with a seeded default host
- PostgreSQL-backed availability and bookings
- Host-wide double-booking prevention at database level
- Admin APIs for event types, bookings, and availability
- React + Vite frontend (`/web`) with Event types, Bookings, Availability, and public booking flow
- Seed data + integration tests

## Tech Stack

- Node.js + Express (API)
- PostgreSQL
- Prisma ORM
- Luxon for timezone handling
- React + Vite (frontend)
- Vitest + Supertest for API integration tests

## Why double-booking is safe here

The API does not rely only on app-layer checks. PostgreSQL enforces conflicts with an exclusion constraint:

```sql
EXCLUDE USING GIST (
  host_user_id WITH =,
  tstzrange(start_at, end_at, '[)') WITH &&
)
WHERE (status = 'confirmed')
```

This blocks overlapping confirmed bookings for the same host, even under concurrent requests.

## Local Setup (Backend + DB)

1. Install backend dependencies:

```bash
npm install
```

2. Create env file:

```bash
cp .env.example .env
```

3. Run migrations and generate Prisma client:

```bash
npm run prisma:generate
npm run prisma:migrate
```

4. Seed sample data:

```bash
npm run prisma:seed
```

5. Start API:

```bash
npm run dev:api
```

Server runs on `http://localhost:3000` by default.

## Frontend Setup (`/web`)

1. Install frontend dependencies:

```bash
npm --prefix web install
```

2. Start frontend dev server:

```bash
npm run dev:web
```

Frontend runs on `http://localhost:5173` and proxies `/api` to backend `http://localhost:3000`.

## Run Full Stack Locally

Use two terminals:

```bash
# Terminal 1 (API)
npm run dev:api
```

```bash
# Terminal 2 (Frontend)
npm run dev:web
```

Then open:
- Admin UI: `http://localhost:5173/event-types`
- Public booking example: `http://localhost:5173/book/intro-call`

## NPM Scripts

- `npm run dev:api` → start backend in watch mode
- `npm run dev:web` → start React/Vite frontend
- `npm run build:web` → production build for frontend
- `npm run prisma:generate` → generate Prisma client
- `npm run prisma:migrate` → apply Prisma migrations
- `npm run prisma:seed` → seed default host/events/bookings
- `npm test` → run API integration tests

## Sample Seed Data

- Host user: `host@calclone.local` (`Asia/Kolkata`)
- Event types:
  - `intro-call` (30 min)
  - `deep-dive` (60 min)
- Availability: Monday-Friday, 09:00-17:00
- Bookings: past, upcoming, and cancelled sample entries

## API Endpoints

- `GET /health`
- `GET /api/event-types`
- `POST /api/event-types`
- `PATCH /api/event-types/:id`
- `DELETE /api/event-types/:id`
- `PATCH /api/event-types/:id/active`
- `GET /api/availability`
- `PUT /api/availability`
- `GET /api/bookings?scope=upcoming|past|cancelled|all`
- `GET /api/bookings/:id`
- `POST /api/bookings/:id/cancel`
- `GET /api/public/:slug` (public event details)
- `GET /api/public/:slug/slots?date=YYYY-MM-DD&tz=Timezone`
- `POST /api/public/:slug/bookings`

### Create Booking Request

```json
{
  "name": "Alice",
  "email": "alice@example.com",
  "startAt": "2026-03-28T10:00:00",
  "timezone": "Asia/Kolkata"
}
```

### Booking Responses

- `201` booking confirmed
- `409 { "code": "SLOT_UNAVAILABLE" }` on overlap/already booked
- `422 { "code": "INVALID_SLOT" }` when outside availability/invalid time

## Run Tests

Integration tests require PostgreSQL running and reachable via `DATABASE_URL`.

```bash
npm test
```

Covered scenarios:

- Successful booking creation
- Parallel same-slot race: only one booking succeeds
- Overlap conflict across different event types of the same host
- Same slot across different hosts succeeds
- Cancelled booking releases the slot
- Slot listing hides booked slots
- Timezone conversion persists UTC correctly
- Event type CRUD and active toggle
- Availability save/read round-trip
- Bookings scope filtering (upcoming/past/cancelled/all)

## Assumptions

- No login UI, but schema is multi-host ready
- Booking conflicts are host-wide (not event-type-only)
- All stored booking times are UTC (`timestamptz`)
- Slot boundaries are half-open `[start, end)` to allow adjacent meetings
- Admin sidebar intentionally includes only Event types, Bookings, and Availability
