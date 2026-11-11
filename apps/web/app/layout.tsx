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
        price: "100",
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
          name: "Is the generated code actually production-ready?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. Dezign2App generates clean, standard TypeScript structured as a Turborepo + pnpm monorepo. It includes Next.js 16 App Router for the frontend, typed Express or FastAPI microservices, Better Auth authentication with RBAC guards, and Docker Compose with database migrations. It is the exact architecture senior engineering teams build by hand.",
          },
        },
        {
          "@type": "Question",
          name: "Do I own the code, or is there vendor lock-in?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "You own 100% of the code. There are zero runtime fees, no proprietary SDKs, and zero vendor lock-in. You can download the project as a ZIP, push it to GitHub, and deploy to AWS, GCP, Vercel, Railway, or your own self-hosted servers. Your code is yours forever.",
          },
        },
        {
          "@type": "Question",
          name: "How is Dezign2App different from pure AI code generators (Cursor, Claude, or 'vibe coding')?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Pure AI means you describe what you want and accept what comes out—which quickly breaks down in full-stack apps when database schemas, API contracts, auth flows, and frontend state drift out of sync. Dezign2App uses an 'Algorithm + AI' approach: we use deterministic algorithms for predictable scaffolding (instant AST compilation of schemas, Turborepo packages, typed routes, and Docker bridges with 0 hallucinations and $0 token burn), and AI for custom domain logic. You decide the architecture first; AI implements a verified spec rather than a guess.",
          },
        },
        {
          "@type": "Question",
          name: "Can I customize the code? What happens to my custom edits on the next canvas sync?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Your custom code is never deleted. Dezign2App separates generated infrastructure contracts (shared schemas, types, and wire protocols) from user business logic (controllers, custom routes, and UI components). When you update your visual canvas, the compiler performs non-destructive incremental updates or emits clean Git PR diffs—ensuring your custom business logic, third-party packages, and manual edits remain 100% intact.",
          },
        },
        {
          "@type": "Question",
          name: "Can I run Dezign2App offline on my local machine?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. With our native Electron 34 Desktop Studio, you get embedded local database runners (PostgreSQL, SQLite, Redis) and an integrated native PTY terminal. You can design, simulate, and compile complete systems offline with zero cloud setup.",
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
