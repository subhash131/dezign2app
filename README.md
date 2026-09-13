# Dezign2App — System Design to Full-Stack Production Code Automation

Welcome to **Dezign2App**—an enterprise-grade visual system design and architecture modeling platform that **compiles visual architecture diagrams directly into production-ready, full-stack monorepos**.

Dezign2App bridges the gap between high-level system architecture design and executable code. It unifies visual drag-and-drop canvas editors, relational database modeling, real-time protocol bindings (WebSockets, WebRTC, SSE), stateful AI graph execution (LangGraph & MCP), an in-memory architecture simulation engine, and an automated code generation compiler—all packaged in a Turborepo + pnpm workspace with both web and native desktop runtimes.

[![Next.js](https://img.shields.io/badge/Next.js-16.0.10-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2.4-blue?style=flat-square&logo=react)](https://react.dev/)
[![Convex](https://img.shields.io/badge/Convex-1.31.6-EE742F?style=flat-square)](https://convex.dev/)
[![Better Auth](https://img.shields.io/badge/Auth-Better_Auth-black?style=flat-square)](https://better-auth.com/)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS-v4.1-38B2AC?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)
[![Electron](https://img.shields.io/badge/Electron-34.5-47848F?style=flat-square&logo=electron)](https://electronjs.org/)
[![LangGraph](https://img.shields.io/badge/AI-LangGraph_%26_MCP-orange?style=flat-square)](https://langchain.dev/)
[![pnpm Workspace](https://img.shields.io/badge/pnpm-Workspace-F69220?style=flat-square&logo=pnpm)](https://pnpm.io/)
[![Turborepo](https://img.shields.io/badge/Turborepo-2.6-EF4444?style=flat-square&logo=turborepo)](https://turbo.build/repo)
[![Fumadocs](https://img.shields.io/badge/Docs-Fumadocs-blueviolet?style=flat-square)](https://fumadocs.vercel.app)

---

## 🏗️ Monorepo Architecture

The workspace is organized as a high-performance **pnpm Workspace** orchestrated by **Turborepo**, enabling fast builds, smart remote/local caching, and strict boundaries across applications and shared packages.

```
dezign2app/
├── apps/
│   ├── web/                    # Next.js 16 web app, interactive canvas & compiler studio
│   ├── desktop/                # Electron 34 native app, PTY terminal & local Docker runner
│   ├── system-design-engine/   # AI engine with LangGraph, Google Gemini, Groq & MCP tools
│   └── docs/                   # Developer documentation site built with Fumadocs
├── packages/
│   ├── backend/                # Convex database schema, Better Auth & Creem billing
│   ├── canvas/                 # Pure domain models, Zod validation schemas & graph rules
│   ├── ui/                     # Shared React 19 UI component library (Tailwind CSS v4)
│   ├── eslint-config/          # Shared ESLint 9 configurations
│   └── typescript-config/      # Shared strict TypeScript compiler configurations
```

---

## 📱 Applications (`/apps`)

| App Directory                                                  | Core Technologies                                                                                           | Port    | Description                                                                                                                                                                                                                                                                                    |
| :------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------- | :------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [**`apps/web`**](./apps/web)                                   | Next.js 16 (Turbopack), React 19, Tailwind v4, `@xyflow/react`, Tldraw, Better Auth, Monaco Editor, Zustand | `46500` | **Visual Studio & Web Portal**: Interactive multi-tenant architecture canvas, visual database entity modeling, page-level UI hierarchies, full-stack compiler studio with multi-file diffing, in-memory simulation engine, and billing management.                                             |
| [**`apps/desktop`**](./apps/desktop)                           | Electron 34, `node-pty`, `electron-builder`, Docker CLI bridge                                              | —       | **Native Desktop Application**: Self-contained Electron application featuring an embedded native PTY terminal (PowerShell / bash), local Docker Compose orchestrator, local filesystem project writer, deep-linking auth (`dezign2app://`), and separated Dev/Prod side-by-side installations. |
| [**`apps/system-design-engine`**](./apps/system-design-engine) | Express.js, `@langchain/langgraph`, LangChain Core, Model Context Protocol (MCP) SDK, Gemini, Groq          | `3002`  | **AI System Design & MCP Engine**: Microservice computing architecture recommendations, node and pipeline generation, LangGraph state-machine workflows, and Model Context Protocol (MCP) tool integrations.                                                                                   |
| [**`apps/docs`**](./apps/docs)                                 | Next.js 16, React 19, Fumadocs UI / Core / MDX, Tailwind v4                                                 | `3500`  | **Technical Documentation Portal**: Developer guides, system design patterns, runtime specifications, desktop building, and monorepo command references.                                                                                                                                       |

---

## 📦 Packages (`/packages`)

| Package Directory                                                | Core Technologies                                                                     | Description                                                                                                                                                                                                                      |
| :--------------------------------------------------------------- | :------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [**`packages/backend`**](./packages/backend)                     | Convex 1.31, `@convex-dev/better-auth`, Better Auth, Zod, Cron Parser, Creem Payments | **Core Database & Backend Layer**: Reactive Convex database schemas, atomic mutations, Better Auth authentication with OAuth handlers, API key management, and Creem subscription billing.                                       |
| [**`packages/canvas`**](./packages/canvas)                       | Zod 3.25, TypeScript 5, `@xyflow/react` contracts                                     | **Shared Pure Domain Models**: Canonical Zod schemas and validation rules for nodes (Services, Gateways, Databases, Event Brokers, State Stores, WebSockets, WebRTC, LangGraph), edges, step pipelines, and simulation fixtures. |
| [**`packages/ui`**](./packages/ui)                               | React 19, Tailwind CSS v4, Radix Primitives, Lucide Icons, Hugeicons                  | **Shared Design System**: Reusable React component package built on Tailwind CSS v4 and accessible Radix primitives.                                                                                                             |
| [**`packages/eslint-config`**](./packages/eslint-config)         | ESLint 9                                                                              | Monorepo-wide code style and linting rules.                                                                                                                                                                                      |
| [**`packages/typescript-config`**](./packages/typescript-config) | TypeScript 5                                                                          | Strict compiler configurations shared across apps and packages.                                                                                                                                                                  |

---

## 🌟 Key Capabilities

### 1. Visual Drag-and-Drop Architecture Canvas

- **Fluid Visual Workspace**: Built on `@xyflow/react` and Tldraw with custom connectors, interactive ports, and automatic edge routing (`@dagrejs/dagre`, `elkjs`).
- **Rich Node Ecosystem**:
  - **Microservices & API Gateways**: REST, GraphQL, route endpoints, middleware, and request/response schema specifications.
  - **Database Entities & Relational Modeling**: PostgreSQL, MySQL, SQLite, MongoDB, and DynamoDB with visual schema definitions (primary keys, foreign keys, relationships, column types, and indexes).
  - **Real-Time & Streaming**: Full-stack WebSocket connections, WebRTC peer-to-peer media controls, Server-Sent Events (SSE), Kafka topics, RabbitMQ queues, and Redis Pub/Sub.
  - **State Store Nodes**: Unified client-side state models powered by **Zustand** (with persistent storage, custom action bindings, selectors, and Convex synchronization).
  - **Step Pipelines & Transformers**: Step-by-step pipeline validation, data mapping, and payload transformations.
  - **LangGraph AI Workflows**: Stateful multi-step agent graphs, LLM prompts, and tool attachments.
- **Frontend Page Hierarchy**: Visual tree and component layout mapping for generated Next.js pages and forms bound directly to backend endpoints.

### 2. Full-Stack Monorepo Code Compiler (`lib/compiler`)

- **Visual Design → Executable Code**: Compiles the entire visual architecture diagram into a production-ready, clean TypeScript monorepo structured with Turborepo and pnpm.
- **Next.js 16 Web Applications**:
  - Config-driven pages with App Router, Tailwind CSS v4, and React 19.
  - Pre-wired forms, inputs, and UI components bound to backend endpoints.
  - Client state stores (Zustand) with selectors and persistence.
  - Integrated real-time client hooks (WebSocket clients, WebRTC audio/video handlers, SSE listeners).
- **Node.js / Express Microservices**:
  - Typed routers and controller handlers with Zod schema validation.
  - Database client connections and entity models.
  - Message broker consumers and producers (Kafka, RabbitMQ, Redis).
  - WebRTC signaling servers and WebSocket broadcast hubs.
- **Shared Contracts & Schemas**: Auto-generated shared packages holding TypeScript interfaces and validation schemas shared between client and server.
- **Docker Compose Orchestration**: Auto-generates `docker-compose.yml` pre-configured with all necessary databases, Redis instances, Kafka brokers, and service containers for 1-click startup.
- **In-Browser Monaco Code Studio**: Virtual file explorer, multi-file diff view, syntax highlighting, instant ZIP download, StackBlitz export, or 1-click disk export.

### 3. Native Desktop Studio (`apps/desktop`)

- **Electron 34 Shell**: Wraps the visual studio into a native desktop application with full hardware and filesystem access.
- **Integrated PTY Terminal**: Real native pseudo-terminal emulation powered by `node-pty` (PowerShell on Windows; bash/zsh on macOS and Linux) with multi-session terminal tabs.
- **1-Click Local Docker Runner**: Writes the generated monorepo to your chosen folder and triggers `docker compose up` to run the entire distributed architecture locally.
- **Seamless Deep-Link Authentication**: Native `dezign2app://` protocol handling for secure OAuth handoffs via Better Auth.
- **Side-by-Side Dev & Prod Environments**:
  - **`D2A Dev`**: Runs on development configurations and connects to the development Convex/Auth environment.
  - **`D2A`**: Production build connecting to production cloud deployments. Both can be installed and run concurrently without conflicts.

### 4. In-Memory Architecture Simulation Engine (`lib/simulation`)

- **Interactive Verification**: Validate system design connectivity and message propagation before compiling code.
- **Step Tracing & Test Cases**: Simulate endpoint calls, execute test assertions, trace messages across brokers and transformers, and inspect state transitions in real time.

### 5. Durable AI System Design Engine (`apps/system-design-engine`)

- **LangGraph State Machine**: Orchestrates multi-agent system design generation, architecture auditing, and node creation.
- **Multi-Model Provider Support**: Dual-provider setup supporting **Google Gemini** (`gemini-3.6-flash`) and **Groq** (`openai/gpt-oss-20b`).
- **Model Context Protocol (MCP)**: Native MCP tool interfaces to inspect architectures, query context, and run automated analysis.

### 6. Reactive Backend & Better Auth

- **Convex Real-Time Database**: Reactive queries and ACID-compliant atomic mutations with zero boilerplate.
- **Better Auth Integration**: Multi-provider authentication supporting Google and GitHub OAuth, email/password, session tokens, and desktop deep-linking.
- **Creem Subscription Billing**: Automated subscription lifecycle management, webhooks, and tier-based quota enforcement.

---

## 🚀 Quick Start Guide

### 1. Prerequisites

Ensure your development environment meets the following requirements:

- **Node.js**: `>= 20.0.0`
- **pnpm**: `>= 10.4.1`
- **Docker Desktop**: Required for the Desktop App "Run Locally" Docker Compose feature.
- **C++ Build Tools** _(Windows only, for `node-pty` native compilation)_: Visual Studio Build Tools (C++ workload) or `npm install --global windows-build-tools`.

### 2. Environment Variables Configuration

Copy the example environment files for the workspace layers:

#### `apps/web/.env.local`

```env
# Convex Backend
NEXT_PUBLIC_CONVEX_URL=https://your-convex-deployment.convex.cloud
NEXT_PUBLIC_CONVEX_SITE_URL=https://your-convex-deployment.convex.site

# Better Auth Configuration
BETTER_AUTH_SECRET=your-better-auth-secret-min-32-chars
BETTER_AUTH_URL=http://localhost:46500
BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:46500,https://dezign2app.com,dezign2app://

# Application URLs
NEXT_PUBLIC_APP_URL=http://localhost:46500
NEXT_PUBLIC_DESKTOP_AUTH_URL=http://localhost:46500
NEXT_PUBLIC_SYSTEM_DESIGN_ENGINE_URL=http://localhost:3002

# OAuth Providers
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Email & Notifications (Resend)
RESEND_API_KEY=re_your_resend_api_key
EMAIL_FROM=onboarding@resend.dev

# Payments & Billing (Creem)
CREEM_API_KEY=creem_test_your_api_key
TEST_MODE=true

# Redis / Upstash (Optional)
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_token_here

# AI / Groq
GROQ_API_KEY=gsk_your_groq_api_key
```

#### `packages/backend/.env.local`

```env
CONVEX_DEPLOYMENT=dev:your-project-name
CONVEX_URL=https://your-convex-deployment.convex.cloud
CONVEX_SITE_URL=https://your-convex-deployment.convex.site

BETTER_AUTH_SECRET=your-better-auth-secret-min-32-chars
BETTER_AUTH_URL=http://localhost:46500
BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:46500,https://dezign2app.com,dezign2app://
NEXT_PUBLIC_APP_URL=http://localhost:46500

GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

CREEM_SUBSCRIPTION_WEBHOOK_SECRET=your_webhook_secret_here
```

#### `apps/system-design-engine/.env`

```env
PORT=3002
CONVEX_URL=https://your-convex-deployment.convex.cloud
GEMINI_API_KEY=your-gemini-api-key
GOOGLE_API_KEY=your-google-api-key
GEMINI_LLM_MODEL=gemini-3.6-flash
GROQ_API_KEY=your-groq-api-key
GROQ_LLM_MODEL=openai/gpt-oss-20b
SUPERMEMORY_API_KEY=your-supermemory-api-key
```

### 3. Installation

Run at the root of the workspace:

```bash
pnpm install
```

### 4. Running the Development Ecosystem

Start services across the workspace using **Turborepo**:

```bash
pnpm dev
```

This starts:

- **Next.js Visual Studio**: `http://localhost:46500`
- **AI System Design Engine**: `http://localhost:3002`
- **Documentation Portal**: `http://localhost:3500`
- **Convex Backend**: Reactive sync connected to your Convex deployment

---

## 🖥️ Desktop Application (`apps/desktop`)

Dezign2App delivers a first-class native desktop experience powered by **Electron 34**. The desktop shell embeds a self-contained Next.js production runtime (~50MB clean bundle) and exposes local hardware capabilities via typed IPC:

```
┌─────────────────────────────────────────────────────────────┐
│                   Electron Main Process                     │
│  ├─ Lifecycle Management & Deep-Linking (dezign2app://)     │
│  ├─ Self-Contained Next.js Web Server (Port 46500)          │
│  ├─ PTY Terminal Subsystem (node-pty)                       │
│  ├─ Docker Compose Local Engine                             │
│  └─ Native File System Project Writer                       │
└──────────────────────────────┬──────────────────────────────┘
                               │ ContextBridge (IPC)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 Chromium Renderer Window                    │
│  ├─ Interactive Architecture Canvas                         │
│  ├─ Integrated Monaco Code Studio & File Tree               │
│  ├─ Real-Time Terminal Viewport (@wterm/react)              │
│  └─ window.electronAPI Bridge                               │
└─────────────────────────────────────────────────────────────┘
```

### Running the Desktop App in Development

```bash
# Start Next.js web portal and the Electron shell together
pnpm desktop:dev

# Or in separate terminal sessions:
pnpm --filter web dev          # Terminal 1 (Next.js on 46500)
pnpm --filter desktop dev      # Terminal 2 (Electron window)
```

### Side-by-Side Dev & Prod Desktop Builds

Dezign2App supports dual-target desktop builds so developers can test bleeding-edge local features alongside stable production builds:

| Build Type      | Command                   | Product Name | Application ID               | Target Environment                                          |
| :-------------- | :------------------------ | :----------- | :--------------------------- | :---------------------------------------------------------- |
| **Development** | `pnpm build:desktop:dev`  | **D2A Dev**  | `com.dezign2app.desktop.dev` | Development Convex (`neighborly-setter-541`) & local auth   |
| **Production**  | `pnpm build:desktop:prod` | **D2A**      | `com.dezign2app.desktop`     | Production Convex (`gregarious-quail-82`) & production auth |

Both builds can be installed on the same machine simultaneously with independent shortcuts, user data folders, and identity profiles.

### Packaging Desktop Executables

#### Windows Symlink Note (First Build Only)

On Windows, `electron-builder` requires Developer Mode or pre-caching `winCodeSign` symlinks. Enable **Windows Developer Mode** (`Settings → For Developers → Developer Mode ON`) to permit symlink creation smoothly.

#### Desktop Build Commands

```bash
# Full production packaging (Next.js build + Electron installer)
pnpm build:desktop

# Target specific environments:
pnpm build:desktop:prod        # Production packaging
pnpm build:desktop:dev         # Development packaging (D2A Dev)

# Target specific platforms & architectures:
pnpm build:desktop:win         # Windows NSIS installer (x64)
pnpm build:desktop:win:x64     # Windows 64-bit setup
pnpm build:desktop:win:ia32    # Windows 32-bit (x32) setup
pnpm build:desktop:mac         # macOS DMG & Zip archive
pnpm build:desktop:linux       # Linux AppImage & tarball
pnpm build:desktop:all         # All platforms supported by host
pnpm build:desktop:dir         # Unpacked portable directory (fast test)
```

#### Output Artifacts (`apps/desktop/release/`)

```
apps/desktop/release/
├── win-unpacked/
│   └── D2A.exe / D2A Dev.exe         # Portable executable (~180 MB)
├── D2A-Setup-*-x64.exe               # Windows 64-bit NSIS installer
├── D2A-Setup-*-ia32.exe              # Windows 32-bit NSIS installer
├── D2A-*.dmg                         # macOS installer
├── D2A-*.mac.zip                     # macOS zip archive
├── D2A-*.AppImage                    # Linux AppImage
└── D2A-*.tar.gz                      # Linux tarball
```

### Automated CI/CD Desktop Releases

Pushing a semver version tag triggers [`.github/workflows/release-desktop.yml`](./.github/workflows/release-desktop.yml):

```bash
git tag v1.0.0
git push origin v1.0.0
```

GitHub Actions spins up a matrix build (`windows-latest`, `macos-latest`, `ubuntu-latest`), packages native installers, and attaches them directly to the GitHub Release.

---

## 🛠️ Monorepo Scripts Reference

### Global Scripts

| Command                  | Description                                                             |
| :----------------------- | :---------------------------------------------------------------------- |
| `pnpm dev`               | Starts development servers across apps and packages via Turborepo.      |
| `pnpm build`             | Production build across all workspace projects.                         |
| `pnpm desktop:dev`       | Runs the Next.js web application and Electron desktop app concurrently. |
| `pnpm build:desktop`     | Builds Next.js production bundle and packages the desktop installer.    |
| `pnpm build:desktop:dev` | Builds and packages the side-by-side **D2A Dev** desktop installer.     |
| `pnpm lint`              | Runs ESLint 9 checks across all apps and packages.                      |
| `pnpm format`            | Formats the entire codebase using Prettier.                             |
| `pnpm test`              | Runs unit tests across all packages via Vitest.                         |
| `pnpm test:e2e`          | Runs Playwright end-to-end tests for canvas and compiler workflows.     |

### Workspace Filtering (`--filter`)

Target individual projects without running the entire workspace:

```bash
# Web application
pnpm --filter web dev
pnpm --filter web build:prod
pnpm --filter web test
pnpm --filter web test:e2e

# Desktop application
pnpm --filter desktop dev
pnpm --filter desktop build:electron:prod
pnpm --filter desktop build:electron:dev

# System Design AI Engine
pnpm --filter system-design-engine dev
pnpm --filter system-design-engine build

# Convex Backend
pnpm --filter backend dev

# Documentation Portal
pnpm --filter docs dev
```

---

## 🧪 Testing Guidelines

- **Unit & Domain Testing**: Powered by **Vitest** for instant feedback loops (`.test.ts` / `.spec.ts`). Validates canvas schemas, node/edge sync rules, step pipeline transformations, and compiler generators.
- **End-to-End Visual Testing**: Built using **Playwright** (`apps/web/playwright.config.ts`) to test canvas interactions, node creation, state persistence, code compilation, and auth flows.

```bash
# Run all unit tests
pnpm test

# Run Playwright E2E browser tests
pnpm test:e2e

# Run Playwright E2E with interactive UI
pnpm --filter web test:e2e:watch
```

---

## 🎨 Design System & UI (`packages/ui`)

The shared component library resides in `packages/ui` and is built on React 19, Tailwind CSS v4, and Radix UI primitives.

To add new shadcn/ui components to the shared design system:

```bash
pnpm dlx shadcn@latest add button -c apps/web
```

Import reusable components anywhere across workspace applications:

```tsx
import { Button } from "@workspace/ui/components/button";
import { Dialog, DialogContent } from "@workspace/ui/components/dialog";
```

---

## 📜 License

This project is licensed under an **Open Source Non-Compete License**. You are free to inspect, fork, learn from, and build non-competing personal or educational projects with this codebase. However, hosting, deploying, or distributing this software as a direct commercial competitor to **Dezign2App** is strictly prohibited.

For complete terms, please read the [LICENSE.md](./LICENSE.md).

Created by **Subhash Nayak**.
