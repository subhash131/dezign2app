import React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Blockchain04Icon } from "@hugeicons/core-free-icons";
import Link from "next/link";

const navLinks = [
  { name: "Features", href: "/#features" },
  { name: "Pricing", href: "/#pricing" },
  // { name: "Templates", href: "/workflows" },
  // { name: "Docs", href: "/docs" },
  { name: "About", href: "/about" },
];

export const Header = () => {
  return (
    <header className="h-14 sticky top-0 w-full flex justify-center px-4 lg:px-0 items-center z-50 backdrop-blur-xl border-b bg-transparent">
      <div className="size-full max-w-6xl flex justify-between items-center px-6 bg-transparent">
        {/* Logo */}
        <Link href="/" className="flex gap-2 items-center group">
          <div className="w-7 h-7 bg-black rounded-md flex items-center justify-center">
            <HugeiconsIcon icon={Blockchain04Icon} className="text-white size-4" />
          </div>
          <span className="text-sm font-bold tracking-tight text-black">dezign2app</span>
        </Link>

        {/* Nav */}
        <nav className="hidden lg:flex items-center gap-6">
          {navLinks.map((link) => (
            <Link
              key={link.name}
              href={link.href}
              className="text-xs text-gray-600 hover:text-black transition-colors font-medium"
            >
              {link.name}
            </Link>
          ))}
        </nav>

        {/* Actions */}
        <div className="flex gap-2 items-center">
          <Link
            href="/sign-in"
            className="text-xs px-4 py-2 text-gray-600 hover:text-black transition-colors font-medium"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="text-xs px-4 py-2 rounded-full bg-black text-white hover:bg-gray-800 transition-colors font-medium"
          >
            Get Started
          </Link>
        </div>
      </div>
    </header>
  );
};
