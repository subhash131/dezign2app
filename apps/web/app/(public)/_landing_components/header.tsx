"use client";

import React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Blockchain04Icon } from "@hugeicons/core-free-icons";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Monitor, ArrowRight } from "lucide-react";

const navLinks: { name: string; href: string; external?: boolean; badge?: string }[] = [
  { name: "Pricing", href: "/#pricing" },
  { name: "Tutorials", href: "/tutorials" },
  { name: "dpm", href: "/dpm", badge: "RFC" },
];

export const Header: React.FC = () => {
  const pathname = usePathname();

  const handleHashClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (pathname === "/" && href.startsWith("/#")) {
      const targetId = href.slice(2);
      const el = document.getElementById(targetId);
      if (el) {
        e.preventDefault();
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        window.history.replaceState(null, "", `#${targetId}`);
      }
    }
  };
  return (
    <header className="h-14 sticky top-0 w-full flex justify-center px-4 lg:px-8 items-center z-50 backdrop-blur-md border-b border-zinc-800/80 bg-black/75">
      <div className="size-full max-w-6xl flex justify-between items-center">
        {/* Logo */}
        <Link href="/" className="flex gap-2.5 items-center group">
          <div className="w-7 h-7 bg-white rounded-md flex items-center justify-center text-black">
            <HugeiconsIcon icon={Blockchain04Icon} className="size-4" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-white font-mono">
            dezign2app
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-400 border border-zinc-700/60">
            beta
          </span>
        </Link>

        {/* Nav Links */}
        <nav className="hidden lg:flex items-center gap-7">
          {navLinks.map((link) =>
            link.external ? (
              <a
                key={link.name}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-zinc-400 hover:text-white transition-colors flex items-center gap-1.5"
              >
                <span>{link.name}</span>
                {link.badge && (
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                    {link.badge}
                  </span>
                )}
              </a>
            ) : (
              <Link
                key={link.name}
                href={link.href}
                onClick={(e) => handleHashClick(e, link.href)}
                className="text-xs text-zinc-400 hover:text-white transition-colors flex items-center gap-1.5"
              >
                <span>{link.name}</span>
                {link.badge && (
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                    {link.badge}
                  </span>
                )}
              </Link>
            )
          )}
        </nav>

        {/* Action Buttons */}
        <div className="flex gap-2.5 items-center">
          <a
            href="https://github.com/dezign2app/dezign2app/releases"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-900 transition-colors"
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>Desktop</span>
          </a>

          <Link
            href="/sign-in"
            className="text-xs px-3 py-1.5 text-zinc-400 hover:text-white transition-colors"
          >
            Sign in
          </Link>

          <Link
            href="/sign-up"
            className="text-xs px-3 py-1.5 rounded-md bg-white text-black hover:bg-zinc-200 transition-colors font-medium flex items-center gap-1.5"
          >
            <span>Launch Studio</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </header>
  );
};
