# Dezign2App — System Design Automation Monorepo

Welcome to **Dezign2App**—a state-of-the-art, high-performance, enterprise-grade monorepo designed to build, edit, and analyze system design architectures and cloud infrastructure diagrams.

This platform combines visual canvas editors, stateful AI graph execution, Model Context Protocol (MCP) tooling, real-time streaming, secure multi-tenant authentication, and subscription billing into a unified TypeScript workspace.

[![Next.js](https://img.shields.io/badge/Next.js-16.0.10-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.0.0-blue?style=flat-square&logo=react)](https://react.dev/)
[![Convex](https://img.shields.io/badge/Convex-1.31.6-EE742F?style=flat-square)](https://convex.dev/)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS-v4.0-38B2AC?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)
[![pnpm Workspace](https://img.shields.io/badge/pnpm-Workspace-F69220?style=flat-square&logo=pnpm)](https://pnpm.io/)
[![Clerk](https://img.shields.io/badge/Auth-Clerk-6C47FF?style=flat-square&logo=clerk)](https://clerk.com/)
[![Fumadocs](https://img.shields.io/badge/Docs-Fumadocs-blueviolet?style=flat-square)](https://fumadocs.vercel.app)


## 🏗️ Monorepo Architecture

This repository is powered by a high-performance **pnpm Workspace** and **Turborepo**, optimizing dependency sharing, task caching, and parallel execution across specialized applications and shared packages.

---

## 📱 Applications (`/apps`)

| App Directory                                                  | Core Stack                                                                                               | Port     | Description                                                                                                                                                                                                                        |
| :------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------- | :------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [**`apps/web`**](./apps/web)                                   | Next.js 16 (Turbopack), React 19, Tailwind v4, `@xyflow/react`, Tldraw, Clerk, Creem, Framer Motion      | `46500`  | **Interactive Frontend Canvas & App Portal**: Multi-tenant protected user portal with workspace folders, drag-and-drop system design canvas using React Flow & Tldraw, embedded AI chat panel, and API Key/billing administration. |
| [**`apps/desktop`**](./apps/desktop)                           | Electron 34, node-pty, electron-builder                                                                  | —        | **Native Desktop App**: Wraps the web app in an Electron shell, adds a real PTY terminal (PowerShell/bash), local Docker Compose runner for executing generated monorepos, and native file-system access.                         |
| [**`apps/system-design-engine`**](./apps/system-design-engine) | Express.js, `@langchain/langgraph`, LangChain Core, MCP SDK, Groq SDK, Convex Client                     | Custom   | **High-Performance AI System Design Engine**: Computes system design analysis using LangGraph state machines, coordinates architecture node generation, MCP tools, and custom API limiters.                                        |
| [**`apps/workflow-engine`**](./apps/workflow-engine)           | Express.js, `@langchain/langgraph`, LangChain Core, Inngest SDK, Upstash Redis & Realtime, Convex Client | `3001`   | **Secondary Background Orchestration Service**: Handles background job execution, event queues, and Redis state streaming.                                                                                                         |
| [**`apps/docs`**](./apps/docs)                                 | Next.js 16, React 19, Fumadocs UI / Core / MDX, Tailwind v4                                              | `3500`   | **Technical Documentation Portal**: Integrated developer documentation site covering system design architecture, setup guides, and monorepo scripts.                                                                               |
| [**`apps/inngest-dev`**](./apps/inngest-dev)                   | `inngest-cli`                                                                                            | CLI      | **Inngest Task Dev Server**: CLI runner for background queue testing (`http://localhost:3001/inngest`).                                                                                                                            |
| [**`apps/mcp-inspector-dev`**](./apps/mcp-inspector-dev)       | `@modelcontextprotocol/inspector`                                                                        | CLI / UI | **MCP Dev Console**: Interactive tool interface enabling validation and testing of Model Context Protocol configurations.                                                                                                          |

---

## 📦 Packages (`/packages`)

| Package Directory                                                | Core Technologies                                         | Description                                                                                                                                                      |
| :--------------------------------------------------------------- | :-------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [**`packages/backend`**](./packages/backend)                     | Convex, TypeScript, Svix, Zod, Cron Parser                | **Core Database & Backend Layer**: Type-safe Convex schemas, database indexes, Clerk auth webhooks, API key validators, and Creem subscription billing managers. |
| [**`packages/canvas`**](./packages/canvas)                       | Zod, TypeScript                                           | **Shared Pure Domain Models**: Pure domain models and Zod schemas for canvas nodes, edges, state transitions, and system design structures.                      |
| [**`packages/ui`**](./packages/ui)                               | React 19, Tailwind CSS v4, Radix Primitives, Lucide Icons | **Shared Design System**: Reusable React component package built using Tailwind CSS v4 and shadcn/ui primitives.                                                 |
| [**`packages/eslint-config`**](./packages/eslint-config)         | ESLint 9                                                  | Monorepo-wide code style configurations.                                                                                                                         |
| [**`packages/typescript-config`**](./packages/typescript-config) | TypeScript 5                                              | Monorepo-wide strict TypeScript compiler settings.                                                                                                               |

---

## 🌟 Key Features

1. **Visual Drag-and-Drop System Design Canvas**
   - Built on top of **React Flow (`@xyflow/react`)** and **Tldraw** for fluid diagramming layouts.
   - Design custom node configurations for cloud infrastructure, databases, and microservices.
   - Draw custom edge bindings for data flow, networking, and API connections.

2. **Durable LangGraph AI Execution Engine**
   - Stateful multi-step graph nodes running inside `system-design-engine`.
   - Native integration with LLM providers (Google Gemini, Groq, etc.).
   - Support for **Model Context Protocol (MCP)** standard tools to inspect databases, query systems, or execute commands.

3. **Robust Database & Billing System**
   - Built using **Convex**, providing real-time reactive queries and guaranteed atomic database mutations.
   - Secure and scalable **Clerk** multi-tenant authentication integration.
   - Subscription tier manager leveraging **Creem billing** integration.

4. **Integrated Documentation Portal**
   - Full technical documentation site powered by **Fumadocs** hosted in `apps/docs`.

---

## 🚀 Quick Start Guide

### 1. Prerequisites

Ensure you have the following installed on your machine:

- **Node.js** >= 20.0
- **pnpm** >= 10.4.1

### 2. Configure Environment Variables

Create copies of environment files for each layer:

#### `packages/backend/.env.local`

```env
CONVEX_DEPLOYMENT=your-convex-deployment-url
CLERK_SECRET_KEY=your-clerk-secret
CLERK_JWT_ISSUER_DOMAIN=your-clerk-domain
CREEM_API_KEY=your-creem-key
```

#### `apps/system-design-engine/.env`

```env
PORT=3001
CORS_ORIGIN=http://localhost:46500
CONVEX_URL=your-convex-deployment-url
SYSTEM_CORE_SECRET=your-internal-secret
GEMINI_API_KEY=your-gemini-api-key
GROQ_API_KEY=your-groq-api-key
```

#### `apps/web/.env.local`

```env
NEXT_PUBLIC_CONVEX_URL=your-convex-deployment-url
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your-clerk-publishable-key
CLERK_SECRET_KEY=your-clerk-secret-key
```

### 3. Install Dependencies

Run at the root of the workspace:

```bash
pnpm install
```

### 4. Run Development Ecosystem

Start services using **Turborepo**:

```bash
pnpm dev
```

This command spins up:

- Next.js Web Portal (`http://localhost:46500`)
- AI System Design Engine (`http://localhost:3001`)
- Technical Documentation Portal (`http://localhost:3500`)
- MCP Inspector UI Console & Convex backend

---

## 🖥️ Desktop App (`apps/desktop`)

Dezign2App ships as a native desktop application powered by **Electron 34**. The desktop app wraps the existing Next.js web app and adds:

- 🖥️ **Native PTY terminal** — real PowerShell (Windows) / bash/zsh (macOS & Linux) via `node-pty`
- 🐳 **Docker Compose runner** — write the generated monorepo to disk and spin it up locally
- 📁 **Native file-system access** — pick an output folder, write generated project files directly
- 🔌 **`window.electronAPI` bridge** — typed IPC API available to the web app renderer

### Running in development

> The Electron window loads the web app at `http://localhost:46500`. Start both together:

```bash
# Option A — both together from root
pnpm desktop:dev

# Option B — separately (two terminals)
pnpm --filter web dev          # Terminal 1
pnpm --filter desktop dev      # Terminal 2 (waits for port 46500 then opens Electron)
```

### Building the `.exe` / `.dmg` / `.AppImage`

#### Prerequisites

| Requirement | Notes |
| :---------- | :---- |
| **Node.js ≥ 20** | Already required by the web app |
| **Docker Desktop** | Required at runtime for the "Run Locally" feature |
| **Windows Build Tools** | Required for `node-pty` native compilation (`npm install --global windows-build-tools` or Visual Studio C++) |

#### One-time Windows fix (first build only)

On Windows, `electron-builder` downloads a `winCodeSign` archive containing macOS symlinks that can't be extracted without Developer Mode enabled. Run this **once** to pre-populate the cache:

```powershell
$url = "https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z"
$cacheDir = "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign\winCodeSign-2.6.0"
$tmpFile = "$env:TEMP\winCodeSign-2.6.0.7z"
$7za = "$PSScriptRoot\node_modules\.pnpm\7zip-bin@5.2.0\node_modules\7zip-bin\win\x64\7za.exe"

Invoke-WebRequest -Uri $url -OutFile $tmpFile -UseBasicParsing
New-Item -ItemType Directory -Force -Path $cacheDir | Out-Null
& $7za x $tmpFile "-snl-" -bd "-o$cacheDir" -y
```

> **Alternative**: Enable **Windows Developer Mode** (`Settings → For Developers → Developer Mode ON`) — this permanently allows symlink creation and skips the step above.

#### Build commands

```bash
# Builds Next.js + packages Electron for all platforms (Windows [x64 + x32], macOS, Linux)
pnpm build:desktop

# Or target specific platforms & architectures:
pnpm build:desktop:win         # Windows (both x64 and x32/ia32 setups)
pnpm build:desktop:win:x64     # Windows (x64 setup only)
pnpm build:desktop:win:x32     # Windows (x32/ia32 setup only)
pnpm build:desktop:mac         # macOS (.dmg + .zip)
pnpm build:desktop:linux       # Linux (.AppImage + .tar.gz)
```

Output location:

```
apps/desktop/release/
├── win-unpacked/
│   └── Dezign2App.exe        ← Windows portable executable (~180 MB)
├── D2A Setup *-x64.exe       ← Windows 64-bit NSIS installer
├── D2A Setup *-ia32.exe      ← Windows 32-bit (x32) NSIS installer
├── Dezign2App-*.dmg          ← macOS installer
├── Dezign2App-*.mac.zip      ← macOS zip bundle
├── Dezign2App-*.AppImage     ← Linux AppImage executable
└── Dezign2App-*.tar.gz       ← Linux tarball
```

#### Distributing

- **Local / manual**: Zip the entire `win-unpacked/` folder and share it. Users extract and double-click `Dezign2App.exe`.
- **GitHub Releases (CI)**: Push a version tag — GitHub Actions builds all three platforms automatically and uploads them as release assets:

```bash
git tag v1.0.0
git push origin v1.0.0
```

This triggers [`.github/workflows/release-desktop.yml`](.github/workflows/release-desktop.yml) and attaches:

| File | Platform / Arch |
| :--- | :-------------- |
| `D2A Setup *-x64.exe` | Windows x64 (64-bit NSIS installer) |
| `D2A Setup *-ia32.exe` | Windows x32 (32-bit NSIS installer) |
| `Dezign2App-1.0.0.dmg` | macOS |
| `Dezign2App-1.0.0.AppImage` | Linux |

#### Required GitHub Secrets

Before CI can build, add these in **GitHub → Settings → Secrets → Actions**:

| Secret | Description |
| :----- | :---------- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk frontend key |
| `CLERK_SECRET_KEY` | Clerk backend key |
| `NEXT_PUBLIC_CONVEX_URL` | Convex deployment URL |
| `GROQ_API_KEY` | Groq AI API key |
| `GOOGLE_API_KEY` | Google AI API key |
| `GITHUB_TOKEN` | Auto-provided by GitHub — no setup needed |

---

## 🛠️ Monorepo Commands

### Global Scripts

| Command         | Action                                         |
| :-------------- | :--------------------------------------------- |
| `pnpm dev`      | Starts development services.                   |
| `pnpm build`    | Production build across all workspace targets. |
| `pnpm lint`     | Runs ESLint across all apps and packages.      |
| `pnpm format`   | Formats all files with Prettier.               |
| `pnpm test`     | Runs unit and integration tests.               |
| `pnpm test:e2e` | Runs Playwright E2E browser tests.             |

### Workspace Filtering

Target specific applications with `--filter`:

```bash
# Run web app only
pnpm --filter web dev

# Run system design engine only
pnpm --filter system-design-engine dev

# Run documentation site only
pnpm --filter docs dev

# Start Convex dev backend
pnpm --filter backend dev
```

---

## 🧪 Testing Guidelines

- **Unit & Integration Testing**: Powered by **Vitest** for instant feedback loops (`.test.ts` or `.spec.ts`).
- **End-to-End Visual Testing**: Built using **Playwright** inside `apps/web/e2e/` to test UI states, auth flows, and React Flow canvases.

To run tests:

```bash
pnpm test
pnpm --filter web test:e2e
```

---

## 🎨 Managing Shared UI Components

The shared component library resides inside `packages/ui`. To add new components:

```bash
pnpm dlx shadcn@latest add button -c apps/web
```

Import in your Next.js application:

```tsx
import { Button } from "@workspace/ui/components/button";
```

---

## 📜 License

This project is licensed under an **Open Source Non-Compete License**. You are free to inspect, fork, learn from, and build non-competing personal or educational projects with this codebase. However, hosting, deploying, or distributing this software as a direct commercial competitor to **Dezign2App** is strictly prohibited.

For complete terms, please read the [LICENSE.md](./LICENSE.md). Created by **Subhash Nayak**.
