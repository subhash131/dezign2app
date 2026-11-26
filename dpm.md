# dpm — Dezign Package Manager

> **The universal, language-agnostic visual abstraction layer for package managers.**
> Package managers (`npm`, `PyPI`, `Go modules`, `Cargo`) manage code libraries. `dpm` gives software packages across every ecosystem a visual, syntax-free contract layer for the Dezign canvas.

---

## What is dpm?

`dpm` is a package manager that creates a **universal visual layer on top of existing package managers** (`npm`, `PyPI`, `Go modules`, `Cargo`, and more), built from the ground up to **solve the fundamental breakdown between AI-generated code and human verification**—while eliminating language lock-in.

> **"Design once... switch to any language."**

### 1. The Machine Dilemma: Why AI Models Fail at Raw Code

Today's AI coding agents (Claude, Cursor, Devin, Copilot) are tasked with generating thousands of lines of raw text syntax from scratch. When LLMs write raw library implementations directly against package APIs, they consistently hit the same critical walls:

1. **Syntax & Parameter Hallucination**: Models frequently invent non-existent SDK methods, hallucinate config flags, or mix up deprecated methods from older training data (e.g., using obsolete Stripe charge methods in modern APIs).
2. **Boilerplate & Token Exhaustion**: Up to 70% of an agent's context window and compute tokens are burned writing boilerplate—repetitive route handlers, import statements, headers, types, and middleware chains.
3. **Fragile Glue Code**: Code looks syntactically flawless on the surface, but crashes at runtime due to broken async lifecycles, unhandled stream backpressure, or missing signature verifications.
4. **Zero Architectural Validation**: When generating text files in isolation, an AI cannot visually inspect or verify whether an endpoint's output schema actually matches what the database or downstream consumer expects.
5. **Dependency, Version & Language Drift**: Agents constantly emit imports for packages that aren't installed, fail to configure required environment variables, misalign dependency versions, or lock an entire codebase to one language's idioms.
6. **Unoptimized & Naive Code**: LLMs default to the simplest brute-force code to satisfy a prompt. They generate N+1 database queries, leave out connection pooling, omit cache layers, and create memory leaks in stream listeners. It works functionally, but runs terribly.
7. **The Token Billing Spiral**: When an AI makes a small mistake in a 400-line file, fixing it requires feeding the entire file back into the context window and re-generating it repeatedly. A single feature can burn millions of tokens in recursive self-healing loops, causing AI billing to explode.

### 2. The Human Dilemma: The Verification & Review Bottleneck

Even when an AI agent produces code that compiles, it introduces an unsustainable crisis for human engineers:

1. **Inability to Verify High-Volume Code (Review Fatigue)**: An AI can spit out 5,000 lines of code across 15 files in 10 seconds. No human engineer can realistically read, audit, and verify that volume of code line-by-line. Reviewers inevitably skim, rubber-stamp PRs, and miss silent security holes or edge-case bugs.
2. **The Loss of Mental Model (The Black-Box Codebase)**: When developers write code by hand, they build an internal spatial and architectural map of how the system works. When AI generates the code, the team loses that mental model. The codebase becomes an alien black box.
3. **Debugging Code Nobody Wrote**: When an AI-generated service fails in production at 2 AM, the developer has zero context. They are forced to reverse-engineer thousands of lines of machine-generated boilerplate that no human ever designed with intention.
4. **Architectural Erosion & Spaghetti Drift**: LLMs solve prompt-by-prompt in isolation. They lack systemic architectural discipline. Over multiple AI iterations, codebases suffer from duplicated utilities, conflicting state patterns, and unmaintainable glue code.
5. **The Illusion of Working Software**: AI-written code often passes basic happy-path checks but conceals subtle concurrency bugs, memory leaks, missing idempotency keys, or unauthenticated handles that only surface under real production load.
6. **Cloud & Infrastructure Billing Shock**: Because unoptimized code slips past exhausted reviewers, hidden resource hogs (unbounded database queries, runaway serverless invocations, un-debounced polling, missing Redis caching) run quietly in production until sudden, exponential cloud and database bills arrive as customer traffic scales.

---

### How dpm Solves Both Sides

**`dpm` replaces probabilistic text generation and language-locked boilerplate with deterministic, language-agnostic visual contracts.**

- **For AI Agents:** They no longer generate fragile syntax. Agents manipulate **typed visual nodes** with rigid, language-neutral input/output schemas. If an agent tries to make an invalid connection, the `dpm` schema engine rejects it immediately, allowing the agent to self-correct in milliseconds.
- **For Human Engineers:** It completely eliminates code-review fatigue. Instead of auditing 5,000 lines of raw boilerplate, a human verifies a **clean visual graph** where node capabilities, data flows, and configurations are instantly self-evident.
- **Battle-Tested, Pre-Optimized Codegen:** Instead of an AI hallucinating naive code, `@dpm/*` packages compile using performance-hardened templates authored by domain experts (built-in connection pooling, zero N+1 queries, automated caching, streaming backpressure handling) in Node.js/TypeScript, Python, Go, or Rust.
- **Kills the Token & Cloud Billing Explosion:**
  - **Slashes LLM token costs by 95%+:** Agents don't rewrite 500 lines of code in recursive prompt loops. They emit compact graph operations.
  - **Eliminates cloud billing shocks:** Architectural boundaries, caching nodes, rate limits, and connection pools are visually defined and enforced on the canvas before code is ever deployed.

The Dezign compiler then takes the verified graph and deterministically outputs 100% verified, production-ready code in the target language and framework you choose.

---

### The Package Ecosystem ➔ dpm Mapping

Every software package—whether from `npm`, `PyPI`, `Go modules`, or `Cargo`—is a code library. **`dpm` wraps capabilities across package managers with unified visual contracts**—typed input/output handles, structured property sidebars, and multi-target codegen rules—making them drag-and-drop primitives on the Dezign canvas:

| Underlying Package Ecosystem Gives You... | dpm Gives You... |
|---|---|
| Payment SDKs (`stripe` on npm / PyPI / Go) | A **Stripe node** (`@dpm/stripe`) with typed handles: `on_payment_success`, `create_checkout`, `on_subscription_cancelled` |
| Database / ORM (`prisma`, `drizzle`, `gorm`, `sqlalchemy`) | A **Database node** (`@dpm/database`) with entity models, migration hooks, and query handles |
| Web Service (`express`, `fastapi`, `gin`, `axum`) | A **Service node** (`@dpm/service`) with route slots, middleware chains, and lifecycle hooks |
| Agent Runtime (`@langchain/langgraph`, `langgraph` on PyPI) | An **Agent node** (`@dpm/langgraph`) with state channels, tool slots, memory config, and streaming outputs |

```text
npm / PyPI / Go / Cargo  ➔  @dpm/service
npm / PyPI / Go / Cargo  ➔  @dpm/stripe
npm / PyPI / Go / Cargo  ➔  @dpm/database
npm / PyPI / Go          ➔  @dpm/auth
npm / PyPI               ➔  @dpm/langgraph
```

**`dpm` does not replace your native package managers.** When you use `@dpm/stripe` or `@dpm/database` on the canvas, the Dezign compiler still resolves native dependencies via `pnpm`/`npm`, `pip`/`uv`, `go mod`, or `cargo` under the hood and generates real idiomatic production code. `dpm` is the universal visual abstraction layer *above* package managers—the same way TypeScript's `@types/*` packages are an abstraction layer above JavaScript.

---

## The DefinitelyTyped Analogy

When TypeScript arrived, JavaScript libraries didn't rewrite themselves. The community created **DefinitelyTyped**—a repository of `@types/*` packages that added type contracts on top of existing JS code:

```text
lodash   ➔  @types/lodash   (type definitions)
express  ➔  @types/express  (type definitions)
react    ➔  @types/react    (type definitions)
```

This didn't change how lodash or Express worked. It added a **contract layer** that made them safer, more discoverable, and self-documenting.

**`dpm` is DefinitelyTyped for the language-agnostic visual canvas era:**

```text
express / fastapi / gin       ➔  @dpm/service   (universal visual node definition)
stripe (Node / Python / Go)   ➔  @dpm/stripe    (universal visual node definition)
prisma / gorm / sqlalchemy    ➔  @dpm/database  (universal visual node definition)
```

- `@types/*` added **type safety** to JavaScript
- `@dpm/*` adds **universal visual architecture contracts** across package ecosystems (`npm`, `PyPI`, `Go modules`, `Cargo`)

Both follow the same model:
- Package authors can ship definitions natively inside their packages
- Or the community can publish universal wrapper adapters independently

---

## How It Changes Development

### Without dpm (Raw Prompting & Language Lock-in)

```text
Developer: "Add Stripe billing with subscription management"

AI Agent:
  → Writes 300 lines of language-locked code (e.g., TypeScript or Python)
  → Misses webhook signature verification
  → Uses deprecated charge methods instead of PaymentIntents
  → Forgets to add the package to package.json / requirements.txt / go.mod
  → Imports from wrong path
  → Takes 15 minutes of debugging—and requires a full rewrite if switching languages
```

### With dpm (Design Once, Switch to Any Language)

```text
Developer: "Add Stripe billing with subscription management"

AI Agent:
  → Places @dpm/stripe node on canvas
  → Connects @dpm/stripe.on_payment_success ➔ @dpm/database.update_user_tier
  → Canvas validates: schemas match ✓, handles compatible ✓
  → Dezign compiler generates verified production code for your chosen stack
  → Native package manager installs dependencies automatically (npm, pip, go mod, cargo)
  → Working in seconds. Zero syntax. Zero hallucination. Zero language lock-in.
```

The agent operates on **visual graph operations** instead of raw text:

```text
connect(@dpm/stripe.on_payment_success ➔ @dpm/database.update_user_tier)
```

This single graph operation replaces hundreds of lines of hand-written glue code. The `dpm` contract guarantees schema compatibility. The Dezign compiler emits idiomatic production code for whatever target stack you choose—Next.js, Express, NestJS, FastAPI, Go, or Rust.

---

## What Every @dpm Package Exposes

A `dpm` package wraps underlying libraries across ecosystems and exposes:

| Layer | What It Provides |
|---|---|
| **Universal Handles & Ports** | Visual connection points (`req_in`, `event_out`, `db_bind`) that wire together regardless of the underlying language. |
| **Language-Neutral Port Schemas** | Strict I/O contracts. The canvas rejects invalid connections at design time, not runtime. |
| **Visual Property Sidebars** | Structured settings—API keys, timeouts, pool sizes, and modes—shown in the canvas sidebar without syntax-specific config editing. |
| **Pipeline Transformers & Middleware** | Pre-built middleware and transformers—signature validation, auth checks, data mapping—ready to drop into any pipeline. |
| **Multi-Target Codegen Adapters** | Hardened rules defining how to compile the visual node into idiomatic code for Node.js/TypeScript, Python, Go, or Rust. |

This means:
- A **Service node** (`@dpm/service`) compiles to Express, NestJS, FastAPI, or Go Gin
- A **Stripe node** (`@dpm/stripe`) emits typed webhook handlers and checkout actions in your target runtime
- A **Database node** (`@dpm/database`) maps cleanly to Prisma/Drizzle, SQLAlchemy, or GORM with migration hooks
- An **Agent node** (`@dpm/langgraph`) compiles stateful graphs with tool slots, memory config, and streaming outputs

---

## Two Ways to Ship dpm Packages

### 1. Multi-Language Native Embedding — Package author includes dpm support

```text
redis-capability/
├── dezign/
│   └── dezign.json     ← dpm visual contract
├── targets/node        ➔ npm: ioredis
├── targets/go          ➔ go.mod: go-redis
└── targets/py          ➔ pip: redis-py
```

Packages ship with their own `dezign/dezign.json` visual contract defining visual ports and multi-target language bindings.

### 2. Community Ecosystem Adapters — Like `@types/*`

```text
@dpm/database           ← universal community-maintained visual contract
  node: @prisma/client / drizzle-orm
  go:   gorm.io/gorm / jmoiron/sqlx
  py:   sqlalchemy / tortoise-orm
```

If an upstream package hasn't added native `dpm` support, the community (or the Dezign team) publishes a `@dpm/*` adapter that binds existing libraries across `npm`, `Go modules`, `PyPI`, and `Cargo`.

---

## Why This Matters

### For Developers

- **Stop writing glue code.** The same webhook → validate → transform → store pipeline you've written 50 times is now a visual pattern you install once.
- **Design once, switch languages anytime.** Your architecture stays pure while the compiler targets Node.js, Python, Go, or Rust.
- **See your architecture.** Glance at the canvas and instantly understand how services, databases, auth, and payments connect.

### For Package Authors

- **Your library becomes a visual building block.** Developers and AI agents can adopt your package in seconds, without reading long docs.
- **Self-documenting APIs.** Input handles, output events, and config properties communicate capabilities clearly.
- **Massively increased adoption surface.** Every Dezign canvas user—human or AI agent—becomes a potential consumer across languages.

### For AI Agents

- **Zero token waste.** Emit compact graph operations instead of generating thousands of lines of boilerplate.
- **No hallucination.** Port schemas enforce valid connections at design time. The agent cannot wire incompatible types.
- **Self-correcting.** If a connection is invalid, the `dpm` contract returns a structured error so the agent fixes it immediately.
- **Language & framework agnostic.** The agent builds architecture once; the compiler targets Next.js, NestJS, Express, FastAPI, Go, or Rust.

---

## The Registry

`dpm` packages are published to and resolved from registries:

- **`registry.dezign.dev`** — the default public registry for universal visual packages.
- **Self-hosted registries** — any team can run their own private registry. Private packages resolve locally; public packages proxy through to the default registry.
- **Scoped packages** — `@org/package` namespacing with per-scope registry routing.

---

## Summary

**Package managers** (`npm`, `PyPI`, `Go modules`, `Cargo`) gave ecosystems a way to share code.
**DefinitelyTyped** gave JavaScript packages type safety.
**`dpm`** gives package managers a universal, language-agnostic visual architecture layer—for syntax-free, deterministic, agentic development.

```text
Code Era:      Developer writes syntax     ➔  hopes it works at runtime
Type Era:      Developer writes typed code ➔  compiler catches type errors
Visual Era:    Developer connects nodes    ➔  compiler generates verified multi-language code
```

`dpm` is the **visual era's universal package manager**.
