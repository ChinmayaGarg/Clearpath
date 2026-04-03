# Clearpath

Multi-institution SaaS platform for university accessibility centre exam management.

## Architecture

- **Monorepo** — `apps/web` (React) + `apps/api` (Express) + shared `packages/`
- **Database** — Postgres with schema-per-tenant isolation
- **Auth** — Server-side sessions, httpOnly cookies, tenant-scoped
- **Feature gating** — Plan entitlements + per-institution grants

## Quick start

```bash
# 1. Start Postgres
docker-compose up -d

# 2. Install dependencies
npm install

# 3. Set up environment
cp apps/api/.env.example apps/api/.env
# Edit .env with your DATABASE_URL

# 4. Run control plane migration
psql $DATABASE_URL -f database/migrations/standard/001_control_plane.sql

# 5. Provision first institution
node database/scripts/provisioner.js

# 6. Start development servers
npm run dev
```

## Structure

```
clearpath/
├── apps/
│   ├── web/                    React + Tailwind frontend
│   │   └── src/
│   │       ├── components/     Shared UI, book, calendar, email, forms
│   │       ├── pages/          Route-level page components
│   │       ├── hooks/          Custom React hooks
│   │       ├── lib/            API client, utils, constants
│   │       ├── store/          Zustand global state
│   │       └── types/          TypeScript type definitions
│   └── api/                    Express backend
│       └── src/
│           ├── middleware/     auth, tenant router, feature gate, role check
│           ├── routes/         One file per resource
│           ├── services/       Business logic layer
│           ├── db/             Pool + tenant query helpers + SQL queries
│           └── utils/          Crypto, validation, logging
├── packages/
│   ├── pdf-parser/             SARS PDF parsing (extracted, testable)
│   ├── email/                  Email templates and sender
│   └── shared/                 Types, constants, roles, features (web + api)
└── database/
    ├── migrations/
    │   ├── standard/           Runs against ALL tenant schemas on deploy
    │   └── tenants/            Per-institution custom migrations
    ├── seeds/                  Feature, plan, accommodation code seeds
    └── scripts/                provisioner.js, migrate.js, rollback.js
```

## Key concepts

**Schema-per-tenant** — every institution gets an isolated Postgres schema (`dal`, `mta`, `acadia`). No cross-institution data access is possible at the database level.

**Tenant middleware** — every API request resolves the institution from the user's email domain and sets `search_path` to their schema before any query runs.

**Feature gating** — features are defined in `public.feature`, assigned to plans via `public.plan_feature`, and checked at runtime via `public.can_use_feature()`.

**CourseDossier** — institutional memory of professor preferences per course, built up over time.
