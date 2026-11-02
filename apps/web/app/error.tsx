"use client";

import { useEffect } from "react";
import { Button } from "@workspace/ui/components/button";
import { AlertCircle, RefreshCcw, Home } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-[#1f1f1f] flex flex-col items-center justify-center p-6 text-white overflow-hidden relative">
      {/* Background Glows */}
      <div className="absolute top-1/4 -right-1/4 w-96 h-96 bg-zinc-600/10 blur-[120px] rounded-full" />
      <div className="absolute bottom-1/4 -left-1/4 w-96 h-96 bg-zinc-600/10 blur-[120px] rounded-full" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative z-10 flex flex-col items-center text-center max-w-xl"
      >
        <div className="w-20 h-20 bg-zinc-500/10 rounded-full flex items-center justify-center mb-8 border border-white/10">
          <AlertCircle size={40} className="text-zinc-400" />
        </div>

        <h1 className="text-4xl font-bold mb-4 tracking-tight">
          Something went wrong
        </h1>
        <p className="text-muted-foreground mb-8 text-lg">
          An unexpected error occurred. We've been notified and are working to
          fix it.
        </p>

        {error.message && (
          <div className="mb-10 p-4 bg-black/40 border border-white/5 rounded-lg text-left w-full overflow-hidden">
            <p className="text-xs uppercase tracking-widest text-white/30 mb-2 font-mono">
              Error Details
            </p>
            <p className="text-sm font-mono text-zinc-400 break-words opacity-80 line-clamp-3">
              {error.message}
            </p>
            {error.digest && (
              <p className="text-xs text-white/20 mt-2 font-mono">
                ID: {error.digest}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-4 w-full justify-center">
          <Button
            onClick={reset}
            variant="default"
            size="lg"
            className="bg-white text-black hover:bg-white/90 h-12 px-8"
          >
            <RefreshCcw size={18} className="mr-2" />
            Try Again
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="border-white/10 hover:bg-white/5 h-12 px-8"
          >
            <Link href="/projects" className="flex items-center gap-2">
              <Home size={18} />
              Return Home
            </Link>
          </Button>
        </div>

        <div className="mt-12 text-sm text-white/40">
          Ref: {new Date().toISOString()}
        </div>
      </motion.div>

      {/* Subtle Noise/Texture Overlay */}
      <div className="absolute inset-0 z-0 opacity-[0.02] pointer-events-none bg-[url('https://grainy-gradients.vercel.app/noise.svg')] bg-repeat" />
    </div>
  );
}
