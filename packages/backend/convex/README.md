# Convex Backend (`@workspace/backend`)

This directory contains the database schemas, serverless functions, HTTP endpoints, and AI integrations for the Convex backend service powered by [Convex](https://www.convex.dev/).

---

## 📁 Directory Structure

```text
packages/backend/convex/
├── _generated/         # Auto-generated Convex types and API wrappers (do not edit manually)
├── ai/                 # AI conversation & chat message handlers
├── lib/                # Internal utility modules
├── schema/             # Modularized table schema definitions
│   ├── auth.ts         # User, subscription, API keys, early believer schemas
│   ├── canvasValidators.ts # Node/edge validators for system canvas
│   ├── features.ts     # Project features schema
│   ├── langgraph.ts    # LangGraph agent state/run schemas
│   └── requirements.ts # Project requirements schema
├── api_keys.ts         # API Key management queries & mutations
├── auth.config.ts      # Clerk auth provider configuration
├── billing.ts          # Subscription & payment processing logic (Creem)
├── canvas.ts           # Visual workspace / canvas queries & mutations
├── convex.config.ts    # Convex app configuration
├── convex.json         # Convex project configuration
├── http.ts             # Custom HTTP endpoints & webhook handlers (Clerk, Creem)
├── langgraph.ts        # LangGraph execution triggers & queries
├── project_chat.ts     # Real-time project chat backend
├── projects.ts         # Project creation, listing, and updates
├── requirements.ts     # Requirement tracking handlers
├── schema.ts           # Main schema composition combining `schema/*` modules
├── users.ts            # User sync and subscription status queries/mutations
└── README.md           # This documentation file
```

---

## 🚀 Local Setup Instructions

### 1. Prerequisites

- **Node.js**: `>= 20`
- **Package Manager**: `pnpm` (v10.4.1+)
- **Accounts**: Convex Account & Clerk Dashboard (for authentication dev keys).

### 2. Install Dependencies

Run from the repository root:

```bash
pnpm install
```

### 3. Configure Environment Variables

Create a `.env.local` file in `packages/backend/` based on [.env.local.example](../.env.local.example):

```bash
# In packages/backend/
cp .env.local.example .env.local
```

Fill in the required environment variables:

```env
# Convex Deployment Credentials
CONVEX_DEPLOYMENT=dev:your-project-name
CONVEX_URL=https://your-project.convex.cloud
CONVEX_SITE_URL=https://your-project.convex.site

# Auth (Clerk)
CLERK_ISSUER_URL=https://your-clerk-domain.accounts.dev
CLERK_WEBHOOK_SECRET=whsec_...

# Webhooks & Payments (Creem)
CREEM_SUBSCRIPTION_WEBHOOK_SECRET=your_webhook_secret_here
```

> 💡 **Convex Dashboard Setup**:
> Set `CLERK_ISSUER_URL`, `CLERK_WEBHOOK_SECRET`, and `CREEM_SUBSCRIPTION_WEBHOOK_SECRET` in your [Convex Dashboard](https://dashboard.convex.dev/) environment variables for your dev deployment so functions can access them via `process.env`.

### 4. Running Local Development

#### Option A: Full Monorepo Development (Recommended)

From the workspace root, start the web frontend and Convex backend:

```bash
pnpm dev
```

This triggers `turbo dev` which automatically runs `convex dev` in parallel with the web application.

#### Option B: Standalone Backend Development

To run only the Convex backend service and sync function changes:

```bash
# From workspace root:
pnpm --filter @workspace/backend dev

# Or directly inside packages/backend:
cd packages/backend
pnpm dev
```

If initializing a new Convex deployment for the first time:

```bash
pnpm --filter @workspace/backend setup
```

### 5. Type Generation

Types are automatically regenerated when `convex dev` is running. To manually generate types without running a watcher:

```bash
pnpm --filter @workspace/backend build
```

---

## 📜 Contribution Rules & Guidelines ("Rulez")

### 1. Database Schema Guidelines (`schema/` & `schema.ts`)

- **Modular Schema**: Place table definitions in domain-specific files inside `packages/backend/convex/schema/` (e.g., `auth.ts`, `features.ts`).
- **Composition**: Re-export all schema modules into `packages/backend/convex/schema.ts` using `defineSchema`.
- **Always Index Queried Fields**: Define indexes using `.index("by_field", ["fieldName"])` for fields used in queries. Avoid unindexed table scans (`ctx.db.query(...).filter(...)`).
- **Strict Validation**: Always specify explicit type validators using `v` from `convex/values` (e.g., `v.string()`, `v.optional(v.number())`, `v.id("tableName")`).

### 2. Server Functions: Right Function for the Right Job

- **Queries (`query` / `internalQuery`)**:
  - Must be pure and read-only.
  - Must use `.withIndex(...)` whenever fetching filtered data.
  - Never place side-effects or external API requests in queries.
- **Mutations (`mutation` / `internalMutation`)**:
  - Use exclusively for modifying the database (`ctx.db.insert`, `ctx.db.patch`, `ctx.db.replace`, `ctx.db.delete`).
  - Execute atomically in a transaction.
- **Actions (`action` / `internalAction`)**:
  - Use for non-deterministic code, external HTTP requests (e.g., OpenAI, Anthropic, payment APIs), or file storage operations.
  - Do NOT modify the DB directly inside actions. Use `ctx.runMutation(...)` or `ctx.runQuery(...)` to interact with the database.
- **Internal Functions**: Mark functions as internal (`internalQuery`, `internalMutation`, `internalAction`) if they should not be directly callable from the client frontend.

### 3. Authentication & Security

- **Identity Check**: Always check `const identity = await ctx.auth.getUserIdentity();` at the start of public queries/mutations that require authentication.
- **Tenant Isolation**: Always scope document queries to the authenticated user ID or organization ID (e.g. `.withIndex("by_user", (q) => q.eq("userId", userId))`).
- **Never Trust Client Inputs**: Validate inputs with strict `v.*` argument validators in function definitions.

### 4. HTTP Endpoints & Webhooks (`http.ts`)

- Register HTTP routes in `packages/backend/convex/http.ts` using `httpRouter()`.
- **Webhook Verification**: Always verify webhook signatures (e.g. Svix for Clerk webhooks, Web Crypto HMAC-SHA256 for Creem webhooks) before executing business logic.

### 5. Automated Codegen & Import Rules

- Import server helpers from `./_generated/server` or `../_generated/server`.
- Import the `api` object from `./_generated/api` when calling queries/mutations across functions.
- Do NOT edit files inside `_generated/` directly.

### 6. Deployment & CI/CD

- **Production Deployment**: Deployments to Convex production are automated via `.github/workflows/deploy-convex.yml` on push to the `main` branch.
- **Secrets Management**: Never commit secret keys or tokens into git. Use environment variables managed via the Convex Dashboard or GitHub Secrets (`CONVEX_DEPLOY_KEY`).
