"use client";

import Link from "next/link";
import { Button } from "@workspace/ui/components/button";
import { Home, ArrowLeft, Search } from "lucide-react";
import { motion } from "framer-motion";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#1f1f1f] flex flex-col items-center justify-center p-6 text-white overflow-hidden relative">
      {/* Background Glows */}
      <div className="absolute top-1/4 -left-1/4 w-96 h-96 bg-zinc-600/10 blur-[120px] rounded-full" />
      <div className="absolute bottom-1/4 -right-1/4 w-96 h-96 bg-zinc-600/10 blur-[120px] rounded-full" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 flex flex-col items-center text-center max-w-md"
      >
        <div className="relative mb-8">
          <motion.h1
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-9xl font-bold tracking-tighter bg-gradient-to-b from-white to-white/5 bg-clip-text text-transparent opacity-20"
          >
            404
          </motion.h1>
          <div className="absolute inset-0 flex items-center justify-center">
            <Search size={64} className="text-zinc-500/30 animate-pulse" />
          </div>
        </div>

        <h2 className="text-3xl font-bold mb-4 tracking-tight">
          Page Not Found
        </h2>
        <p className="text-muted-foreground mb-8 text-lg">
          The page you're looking for doesn't exist or has been moved to another
          universe.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 w-full justify-center">
          <Button
            asChild
            variant="default"
            size="lg"
            className="bg-zinc-100 hover:bg-zinc-200 text-black border-none h-12 px-8"
          >
            <Link href="/projects" className="flex items-center gap-2">
              <ArrowLeft size={18} />
              Back to Projects
            </Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="border-white/10 hover:bg-white/5 h-12 px-8 text-white"
          >
            <Link href="/" className="flex items-center gap-2">
              <Home size={18} />
              Home Page
            </Link>
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="border-white/10 hover:bg-white/5 h-12 px-8 text-white"
            onClick={() => window.history.back()}
          >
            Go Back
          </Button>
        </div>

        <div className="mt-16 grid grid-cols-2 gap-8 text-sm text-muted-foreground border-t border-white/5 pt-8 w-full">
          <div className="space-y-2">
            <p className="font-semibold text-white/50 uppercase tracking-widest text-xs">
              Shortcuts
            </p>
            <Link
              href="/projects"
              className="block hover:text-white transition-colors"
            >
              Projects
            </Link>
          </div>
          <div className="space-y-2 text-right">
            <p className="font-semibold text-white/50 uppercase tracking-widest text-xs">
              Support
            </p>
            <Link
              href="mailto:support@flowify.com"
              className="block hover:text-white transition-colors"
            >
              Contact Us
            </Link>
            <Link
              href="/pricing"
              className="block hover:text-white transition-colors"
            >
              Pricing
            </Link>
          </div>
        </div>
      </motion.div>

      {/* Subtle Grid Pattern */}
      <div className="absolute inset-0 z-0 opacity-[0.03] pointer-events-none [mask-image:radial-gradient(ellipse_at_center,black_70%,transparent_100%)]">
        <svg width="100%" height="100%">
          <defs>
            <pattern
              id="grid"
              width="40"
              height="40"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 40 0 L 0 0 0 40"
                fill="none"
                stroke="white"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>
    </div>
  );
}
