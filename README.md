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
| Auth Tokens | JWT (HS256, 15-min TTL) |
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

# Copy and configure environment variables
cp .env.example .env
# Edit .env with your actual values (Razorpay, Cloudinary, AI keys, SMTP, etc.)
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
│   ├── server/          # Express.js backend
│   │   └── src/
│   │       ├── config/      # DB, Redis, BullMQ, Cloudinary, Razorpay
│   │       ├── modules/     # Domain modules (auth, tenants, plans, ...)
│   │       ├── shared/      # Middleware, utils, errors, constants
│   │       ├── models/      # Mongoose models
│   │       ├── jobs/        # BullMQ workers
│   │       ├── queues/      # BullMQ queue producers
│   │       ├── sockets/     # Socket.IO namespaces
│   │       ├── cron/        # Scheduled jobs
│   │       ├── app.js       # Express app factory
│   │       └── server.js    # HTTP server bootstrap
│   └── client/          # React.js + Vite frontend
├── docker/              # Nginx config, MongoDB init
├── docker-compose.yml   # Development environment
├── docker-compose.prod.yml  # Production environment
├── CONTEXT.md           # Living architectural decision log
└── README.md
```

---

## Environment Variables

Copy `.env.example` to `.env` and configure all required variables.

See `apps/server/src/config/env.js` for the complete list with validation rules.

---

## Architecture

- **Pattern:** Modular Monolith — single Node.js process, strict inter-module boundaries
- **MVC + Service Layer:** Controllers handle HTTP, Services contain all business logic, Models define data shape
- **Tenant Isolation:** 4-layer enforcement (JWT → Middleware → Service params → Mongoose pre-hooks)
- **Financial data:** All monetary values stored as paise (integer) — no floating-point money arithmetic

---

## API Documentation

Available at `GET /api/docs` (development only) — Swagger UI with interactive API explorer.

---

## Implementation Progress

| Phase | Status |
|-------|--------|
| Phase 0 — Infrastructure & Bootstrap | ✅ Complete |
| Phase 1 — Auth & User Management | 🔲 Pending |
| Phase 2 — Plans & Tenant Management | 🔲 Pending |
| Phase 3 — Subscription Lifecycle | 🔲 Pending |
| Phase 4 — Invoicing & PDF | 🔲 Pending |
| Phase 5 — Payment Processing | 🔲 Pending |
| Phase 6 — Dunning Workflow | 🔲 Pending |
| Phase 7 — Notifications | 🔲 Pending |
| Phase 8 — AI Integration | 🔲 Pending |
| Phase 9 — Admin Dashboard | 🔲 Pending |
| Phase 10 — Frontend Completion | 🔲 Pending |
| Phase 11 — Production Hardening | 🔲 Pending |

---

*Engineering decisions and architectural notes maintained in `CONTEXT.md`.*
