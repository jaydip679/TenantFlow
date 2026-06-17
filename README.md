# TenantFlow

> **Production-grade, white-label B2B SaaS billing engine** — managing the complete subscription lifecycle for multi-tenant software products.

---

## What is TenantFlow?

TenantFlow handles:
- **Tenant onboarding** — registration, OTP verification, trial management
- **Plan management** — versioned plan catalog with feature flags
- **Subscription lifecycle** — trial → active → past_due → suspended → cancelled state machine
- **Billing & invoicing** — automated invoice generation, sequential numbering, PDF creation
- **Payment processing** — Razorpay integration with idempotent webhook handling
- **Dunning workflows** — 4-step automated retry system with tenant suspension
- **Seat management** — per-plan seat limits with proration on adds/removes
- **AI churn prediction** — nightly OpenAI/Gemini analysis of usage signals
- **Real-time notifications** — Socket.IO delivery with BullMQ persistence
- **Admin analytics** — MRR, ARR, churn rate, dunning queue, risk dashboard

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20 LTS |
| HTTP Framework | Express.js 4.x |
| Frontend | React.js 18 + Vite 5 + Redux Toolkit |
| Database | MongoDB 7.0 |
| ODM | Mongoose 8.x |
| Cache / Queues | Redis 7.2 |
| Job Queues | BullMQ 4.x |
| Real-time | Socket.IO 4.x |
| Payments | Razorpay Node SDK |
| File Storage | Cloudinary |
| AI | OpenAI GPT-4o / Gemini 1.5 Pro |
| PDF Generation | PDFKit |
| Auth Tokens | JWT HS256 (access, 15min) + Opaque UUID (refresh, 30d) |
| Containerization | Docker + Docker Compose |

---

## Quick Start

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop) installed and running
- [Node.js 20+](https://nodejs.org/) (for local development without Docker)

### 1. Clone and configure

```bash
git clone https://github.com/your-org/tenantflow.git
cd tenantflow

# Configure environment variables
cp apps/server/.env.example apps/server/.env
# Edit apps/server/.env with your actual values (Razorpay, Cloudinary, AI keys, SMTP, etc.)
```

### 2. Start with Docker Compose

```bash
docker compose up
```

This starts:
- **Server** — Express.js API at `http://localhost:5000`
- **Client** — React app at `http://localhost:3000`
- **MongoDB** — at `localhost:27017`
- **Redis** — at `localhost:6379`

### 3. Verify health

```bash
curl http://localhost:5000/health
# Expected: { "status": "ok", "services": { "db": "ok", "redis": "ok" } }
```

### 4. Access Swagger UI (development only)

```
http://localhost:5000/api/docs
```

---

## Project Structure

```
tenantflow/
├── apps/
│   ├── server/              # Express.js backend
│   │   ├── src/
│   │   │   ├── config/      # DB, Redis, BullMQ, Cloudinary, Razorpay, env validation
│   │   │   ├── modules/     # Domain modules (auth, tenants, plans, subscriptions, ...)
│   │   │   │   └── auth/    # ✅ Register, verify-email, login, refresh, logout,
│   │   │   │                #    forgot/reset-password, /me, /me/avatar
│   │   │   ├── shared/      # Middleware, utils, errors, constants
│   │   │   │   ├── errors/  # AppError, errorCodes
│   │   │   │   ├── middleware/ # authenticate, authorize, rateLimiter, validate, upload
│   │   │   │   └── utils/   # logger, jwtService, otpService, cryptoUtils, slugify,
│   │   │   │                #    auditLogService, asyncHandler
│   │   │   ├── models/      # Mongoose models (User, Tenant, RefreshToken, AuditLog)
│   │   │   ├── jobs/        # BullMQ workers + email HTML templates
│   │   │   ├── queues/      # BullMQ queue producers
│   │   │   ├── sockets/     # Socket.IO namespaces (Phase 7)
│   │   │   ├── cron/        # Scheduled jobs (Phase 6+)
│   │   │   ├── app.js       # Express app factory — 11-step middleware chain
│   │   │   └── server.js    # HTTP server bootstrap + graceful shutdown
│   │   ├── .env             # Local env (never committed)
│   │   └── package.json
│   └── client/              # React.js + Vite frontend (Phase 10)
├── docker/                  # Nginx config, MongoDB init scripts
├── docker-compose.yml       # Development environment
├── docker-compose.prod.yml  # Production environment
└── README.md
```

---

## API Reference

All endpoints are documented in Swagger UI at `GET /api/docs` (development only).

### Phase 1 — Auth Endpoints (✅ Implemented)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/v1/auth/register` | None | Register tenant admin — creates Tenant + User atomically, sends OTP |
| `POST` | `/api/v1/auth/verify-email` | None | Verify OTP, auto-login, get access token + refresh cookie |
| `POST` | `/api/v1/auth/login` | None | Login with email + password |
| `POST` | `/api/v1/auth/refresh` | Cookie | Rotate refresh token, get new access token |
| `POST` | `/api/v1/auth/logout` | Bearer | Blacklist JTI, invalidate refresh token, clear cookie |
| `POST` | `/api/v1/auth/forgot-password` | None | Request password reset OTP (always 200) |
| `POST` | `/api/v1/auth/reset-password` | None | Reset password, invalidate all sessions |
| `GET`  | `/api/v1/auth/me` | Bearer | Get current user profile |
| `PATCH`| `/api/v1/auth/me` | Bearer | Update firstName, lastName, notification preferences |
| `POST` | `/api/v1/auth/me/avatar` | Bearer | Upload avatar (Cloudinary, 150×150 WebP crop) |

### Rate Limiting

| Tier | Limit | Applied To |
|------|-------|------------|
| Auth | 10 requests / 15 min per IP | `/auth/register`, `/auth/login`, `/auth/verify-email`, `/auth/forgot-password`, `/auth/reset-password` |
| Global | 100 requests / 15 min per IP | All other endpoints |

---

## Security Highlights

- **Timing-safe login** — dummy `bcrypt.compare` executed when user not found (prevents email enumeration)
- **Refresh token rotation** — every `/auth/refresh` issues a new token; old one is invalidated
- **Reuse detection** — if a consumed refresh token is replayed, the entire token family is invalidated
- **HttpOnly refresh cookie** — scoped to `/api/v1/auth/refresh`, never sent on other requests
- **JTI blacklist** — logout blacklists the access token's JWT ID in Redis until natural expiry
- **OTP one-time use** — deleted from Redis on first successful verify (max 3 attempts)
- **bcrypt cost 12** — ~200ms per hash (balanced security vs. performance)

### Phase 2 — Plans & Tenant Management Endpoints (✅ Implemented)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/v1/plans` | None | List all public active plans (sorted by sortOrder) |
| `GET` | `/api/v1/plans/:planId` | None | Get plan details |
| `POST` | `/api/v1/plans` | `super_admin` | Create plan (also creates initial PlanVersion v1) |
| `PATCH` | `/api/v1/plans/:planId` | `super_admin` | Update plan (creates PlanVersion snapshot first) |
| `DELETE` | `/api/v1/plans/:planId` | `super_admin` | Archive plan (409 if active subscriptions exist) |
| `GET` | `/api/v1/tenants/:tenantId` | Bearer + scope | Get tenant profile |
| `PATCH` | `/api/v1/tenants/:tenantId` | Bearer + `tenant_admin` | Update profile (name, billingEmail, address, taxId, timezone) |
| `POST` | `/api/v1/tenants/:tenantId/logo` | Bearer + `tenant_admin` | Upload logo (200×200 WebP, Cloudinary) |
| `GET` | `/api/v1/tenants/:tenantId/members` | Bearer + `tenant_admin` | List members (paginated) |
| `POST` | `/api/v1/tenants/:tenantId/members/invite` | Bearer + `tenant_admin` | Invite member (seat check first) |
| `POST` | `/api/v1/tenants/:tenantId/members/accept-invite` | None | Accept invite (auto-login) |
| `DELETE` | `/api/v1/tenants/:tenantId/members/:userId` | Bearer + `tenant_admin` | Remove member (soft-delete) |
| `PATCH` | `/api/v1/tenants/:tenantId/members/:userId/role` | Bearer + `tenant_admin` | Change member role |

### Phase 3 — Subscription Lifecycle Endpoints (✅ Implemented)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/v1/subscriptions/:tenantId` | Bearer + scope | Get current subscription (populated planVersion) |
| `POST` | `/api/v1/subscriptions/:tenantId/upgrade` | Bearer + `tenant_admin` | Upgrade plan (MongoDB transaction, proration invoice) |
| `POST` | `/api/v1/subscriptions/:tenantId/downgrade` | Bearer + `tenant_admin` | Schedule downgrade to cheaper plan |
| `DELETE` | `/api/v1/subscriptions/:tenantId/cancel-downgrade` | Bearer + `tenant_admin` | Cancel pending downgrade |
| `POST` | `/api/v1/subscriptions/:tenantId/cancel` | Bearer + `tenant_admin` | Cancel (immediate or at period end) |
| `POST` | `/api/v1/subscriptions/:tenantId/reactivate` | Bearer + `tenant_admin` | Reactivate cancelled subscription |
| `POST` | `/api/v1/subscriptions/:tenantId/pause` | Bearer + `tenant_admin` | Pause subscription |
| `POST` | `/api/v1/subscriptions/:tenantId/resume` | Bearer + `tenant_admin` | Resume paused subscription |
| `GET` | `/api/v1/subscriptions/:tenantId/events` | Bearer + scope | Subscription event history (paginated) |

### Phase 4 — Invoicing & PDF Endpoints (✅ Implemented)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/v1/invoices/admin/all` | Bearer + `super_admin` | All invoices across tenants |
| `GET` | `/api/v1/invoices/tenant/:tenantId` | Bearer + `tenant_admin` | List tenant invoices (filterable) |
| `GET` | `/api/v1/invoices/:invoiceId` | Bearer | Get invoice detail |
| `GET` | `/api/v1/invoices/:invoiceId/pdf` | Bearer | Get signed PDF URL (202 if not ready) |
| `POST` | `/api/v1/invoices/:invoiceId/void` | Bearer + `super_admin` | Void an open invoice |
| `POST` | `/api/v1/invoices/:invoiceId/send` | Bearer + `tenant_admin` | Resend invoice email |


- **Pattern:** Modular Monolith — single Node.js process, strict inter-module boundaries
- **Layers:** Route → Controller (HTTP) → Service (business logic) → Model (data)
- **Rule:** Services never accept `req` or `res` objects — plain JS data in, plain data out
- **Tenant Isolation:** 4-layer enforcement — JWT payload → `tenantScope` middleware → Service params → Mongoose pre-hooks
- **Financial data:** All monetary values stored as **paise (integer)** — no floating-point money arithmetic

---

## Environment Variables

Copy `apps/server/.env.example` to `apps/server/.env` and configure all required variables.

| Category | Variables |
|----------|-----------|
| App | `NODE_ENV`, `PORT`, `CLIENT_URL` |
| Database | `MONGODB_URI`, `REDIS_URL` |
| Auth | `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` |
| Payments | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` |
| File Storage | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` |
| AI | `AI_PROVIDER`, `OPENAI_API_KEY` or `GEMINI_API_KEY` |
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` |
| Admin | `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, `BULL_BOARD_USERNAME`, `BULL_BOARD_PASSWORD` |

See `apps/server/src/config/env.js` for full list with Joi validation rules.

---

## Running Tests

```bash
cd apps/server
npm test                    # Run all tests
npm run test:coverage       # Generate coverage report
```

**Phase 4 test results:** 16/16 tests passing
**Total across all phases:** 84/84 tests passing

---

## Implementation Progress

| Phase | Status | Key Deliverables |
|-------|--------|-----------------|
| **Phase 0** — Infrastructure & Bootstrap | ✅ **Complete** | Docker, MongoDB, Redis, BullMQ, Swagger, health endpoint, error handling, rate limiting |
| **Phase 1** — Auth & User Management | ✅ **Complete** | JWT auth, OTP email verify, refresh token rotation + reuse detection, avatar upload, super admin seed, 18 tests |
| **Phase 2** — Plans & Tenant Management | ✅ **Complete** | Plan catalog (versioned), default plans seeder, tenantScope middleware (Redis cache), member invite + seat enforcement, 25 tests |
| **Phase 3** — Subscription Lifecycle | ✅ **Complete** | State machine, proration (integer paise), upgrade/downgrade/cancel/pause/resume, MongoDB transactions, 25 tests |
| **Phase 4** — Invoicing & PDF | ✅ **Complete** | Invoice model, atomic INV number, PDFKit A4 template, Redis lock idempotency, billing cron, 16 tests |
| Phase 5 — Payment Processing | 🔲 Pending | Razorpay orders + webhooks, idempotency |
| Phase 6 — Dunning Workflow | 🔲 Pending | 4-step retry, tenant suspension, dunning emails |
| Phase 7 — Notifications | 🔲 Pending | Socket.IO real-time, notification persistence |
| Phase 8 — AI Integration | 🔲 Pending | Nightly churn scoring, OpenAI/Gemini |
| Phase 9 — Admin Dashboard | 🔲 Pending | MRR/ARR analytics, Bull Board |
| Phase 10 — Frontend Completion | 🔲 Pending | React dashboard, billing portal |
| Phase 11 — Production Hardening | 🔲 Pending | CI/CD, monitoring, security audit |

---

*Engineering decisions and architectural notes maintained in `docs/CONTEXT.md`.*
