import { Geist, Geist_Mono, Ubuntu, IBM_Plex_Mono } from "next/font/google";
import localFont from "next/font/local";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";

import "@workspace/ui/globals.css";
import { Providers } from "@/providers";
import { Metadata } from "next";

import { PaywallModal } from "@/components/paywall-modal";

import "./global.css";

const ubuntu = Ubuntu({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400"],
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const spaceGrotesk = localFont({
  src: "./fonts/space-grotesk.woff2",
  variable: "--font-display",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const baseUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "https://www.dezign2app.com");

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: "Dezign 2 App | System Design to Application",
    template: "%s | Dezign 2 App",
  },
  description:
    "System design as a programming language. Automate your entire software development lifecycle — turning PRDs, architecture topologies, and data schemas into full-stack code, microservices, load tests, and cloud deployments with AI.",
  keywords: [
    "system design",
    "system design as a programming language",
    "AI software engineering",
    "AI software architect",
    "system design platform",
    "system architecture tool",
    "software architecture builder",
    "cloud architecture generator",
    "architecture to code",
    "full-stack code generator",
    "microservices architecture",
    "system design interview",
    "monorepo compiler",
    "kafka node compiler",
    "redis node compiler",
    "infrastructure as code generator",
    "autonomous SDLC",
    "DevOps automation",
    "dezign2app",
    "dezign 2 app",
    "dezign app",
    "design2app",
    "design 2 app",
    "design app",
    "design to app",
    "system design to app"
  ],
  authors: [{ name: "Dezign 2 App Team" }],
  creator: "subhash",
  publisher: "Dezign 2 App",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: baseUrl,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: baseUrl,
    siteName: "Dezign 2 App",
    title: "Dezign 2 App | Describe the system. Ship the product.",
    description:
      "Automating the entire software development lifecycle — combining system architecture design, code generation, automated testing, CI/CD pipelines, and cloud infrastructure into one unified AI platform.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Dezign 2 App | System Design as the Programming Language",
    description:
      "Transform PRDs and architecture topologies into production-ready full-stack microservices, tests, and cloud infrastructure.",
    creator: "@dezign2app",
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${baseUrl}/#organization`,
      name: "Dezign 2 App",
      url: baseUrl,
      logo: `${baseUrl}/favicon.ico`,
      description: "AI-Powered Software Engineering & System Design Platform.",
    },
    {
      "@type": "WebSite",
      "@id": `${baseUrl}/#website`,
      url: baseUrl,
      name: "Dezign 2 App",
      description: "System Design as a Programming Language — AI-Powered Software Architecture & Monorepo Code Compilation.",
      publisher: {
        "@id": `${baseUrl}/#organization`,
      },
    },
    {
      "@type": "SoftwareApplication",
      name: "Dezign 2 App",
      operatingSystem: "Web, macOS, Windows",
      applicationCategory: "DeveloperApplication",
      description:
        "Deterministic visual architecture compiler turning system topologies into production-ready Turborepo monorepos (Next.js 16, Express/FastAPI, Drizzle ORM, Docker Compose) with zero scaffolding token limits.",
      offers: {
        "@type": "Offer",
        name: "Beta Access",
        price: "20",
        priceCurrency: "USD",
        priceValidUntil: "2027-12-31",
        availability: "https://schema.org/InStock",
      },
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "What stack does the generated monorepo use?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Dezign2App generates clean, standard TypeScript, Python, or Go code structured as a Turborepo + pnpm monorepo. It supports Next.js 16 App Router for web clients, Express, FastAPI, or Go services, Better Auth with RBAC guards, PostgreSQL, MySQL, SQLite, Convex, Redis, Kafka, and Docker Compose.",
          },
        },
        {
          "@type": "Question",
          name: "Do I own the code, or is there vendor lock-in?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "You own 100% of the exported code. There are no runtime fees and no proprietary SDK lock-in. You can download the monorepo as a ZIP, export to disk, or open in StackBlitz and deploy to AWS, GCP, Vercel, Railway, or your own servers.",
          },
        },
        {
          "@type": "Question",
          name: "How does Dezign2App compare to pure AI code generators?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Instead of asking an LLM to guess your entire architecture from scratch, Dezign2App compiles the predictable scaffolding (schemas, typed routes, auth middleware, client hooks, and Docker setup) deterministically from your visual graph. That keeps contracts aligned across packages while leaving AI and engineers to focus on custom business logic.",
          },
        },
        {
          "@type": "Question",
          name: "What happens when I edit generated code and change the diagram later?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Dezign2App compiles architecture updates into clean Turborepo packages and computes blast-radius impact and file diffs before applying deletions or structural changes. We recommend exporting to a Git repository and reviewing re-compiled diffs so custom business logic stays under your control.",
          },
        },
        {
          "@type": "Question",
          name: "Can I run Dezign2App locally on my workstation?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. With our Electron 34 Desktop Studio, you get an embedded native PTY terminal, local PostgreSQL, SQLite, and Redis runners, direct disk export, and 1-click Docker Compose execution.",
          },
        },
      ],
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${ubuntu.variable} scroll-smooth`}
      suppressHydrationWarning
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} ${ibmPlexMono.variable} antialiased`}
      >
        <Providers>
          <PaywallModal>{children}</PaywallModal>
        </Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
