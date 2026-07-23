"use client";

import React from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Blockchain04Icon } from "@hugeicons/core-free-icons";

export const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <div className="w-full bg-[#f4f5f7] flex flex-col items-center pb-20 overflow-hidden">
      {/* Footer Section */}
      <footer className="w-full relative flex flex-col items-center pt-16 px-4 md:px-8 mt-4 md:-mt-12 z-10">
         {/* Background Watermark Text - positioned relative to the container */}
         <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 text-[22vw] md:text-[18vw] font-black text-[#e5e7eb] leading-none select-none pointer-events-none whitespace-nowrap z-0 tracking-tighter mix-blend-multiply opacity-60">
            dezign2app
         </div>

         {/* Footer Card */}
         <div className="relative z-10 w-full max-w-[1000px] bg-white/95 backdrop-blur-xl rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 p-8 md:p-12">
            {/* Top row */}
            <div className="flex flex-col lg:flex-row justify-between items-start gap-12">
              {/* Brand and Info */}
              <div className="flex flex-col gap-4 max-w-sm">
                <Link href="/" className="flex gap-2 items-center group">
                  <div className="w-7 h-7 bg-black rounded flex items-center justify-center text-white">
                    <HugeiconsIcon icon={Blockchain04Icon} className="size-4" />
                  </div>
                  <span className="text-lg font-bold tracking-tight text-black">dezign2app</span>
                </Link>
                <p className="text-[11px] text-gray-500 leading-relaxed mt-2 md:pr-4">
                  dezign2app empowers teams to transform raw data into clear, compelling visuals — making insights easier to share, understand, and act on.
                </p>
                <div className="flex items-center gap-1.5 text-[11px] text-gray-600 font-medium">
                  <span>Support:</span>
                  <a href="mailto:founder@dezign2app.com" className="text-black hover:underline font-semibold">
                    founder@dezign2app.com
                  </a>
                </div>
                {/* Social Links */}
                <div className="flex gap-3.5 mt-2 text-black">
                  <a href="http://x.com/hash_aidev" target="_blank" rel="noopener noreferrer" className="hover:text-gray-600 transition-colors">
                    <span className="sr-only">X (Twitter)</span>
                    <svg className="w-[14px] h-[14px]" fill="currentColor" viewBox="0 0 24 24"><path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" /></svg>
                  </a>
                  <a href="https://github.com/dezign2app/dezign2app" target="_blank" rel="noopener noreferrer" className="hover:text-gray-600 transition-colors">
                     <span className="sr-only">GitHub</span>
                     <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/></svg>
                  </a>
                </div>
              </div>

              {/* Links Columns */}
              <div className="flex flex-wrap gap-12 md:gap-16">
                <div className="flex flex-col gap-5">
                  <h4 className="text-[12px] font-bold text-black">Product</h4>
                  <div className="flex flex-col gap-3">
                     <Link href="/#features" className="text-[11px] text-gray-500 hover:text-black transition-colors">Features</Link>
                     <Link href="/#pricing" className="text-[11px] text-gray-500 hover:text-black transition-colors">Pricing</Link>
                     <Link href="/changelog" className="text-[11px] text-gray-500 hover:text-black transition-colors">Changelog</Link>
                  </div>
                </div>
                {/* <div className="flex flex-col gap-5">
                  <h4 className="text-[12px] font-bold text-black">Resources</h4>
                  <div className="flex flex-col gap-3">
                     <Link href="/docs" className="text-[11px] text-gray-500 hover:text-black transition-colors">Documentation</Link>
                     <Link href="/tutorials" className="text-[11px] text-gray-500 hover:text-black transition-colors">Tutorials</Link>
                     <Link href="/blog" className="text-[11px] text-gray-500 hover:text-black transition-colors">Blog</Link>
                     <Link href="/support" className="text-[11px] text-gray-500 hover:text-black transition-colors">Support</Link>
                  </div>
                </div> */}
                <div className="flex flex-col gap-5">
                  <h4 className="text-[12px] font-bold text-black">Company</h4>
                  <div className="flex flex-col gap-3">
                     <Link href="/about" className="text-[11px] text-gray-500 hover:text-black transition-colors">About</Link>
                     <Link href="/careers" className="text-[11px] text-gray-500 hover:text-black transition-colors">Careers</Link>
                     <Link href="/contact" className="text-[11px] text-gray-500 hover:text-black transition-colors">Contact</Link>
                     <Link href="/partners" className="text-[11px] text-gray-500 hover:text-black transition-colors">Partners</Link>
                  </div>
                </div>
                <div className="flex flex-col gap-5">
                  <h4 className="text-[12px] font-bold text-black">Legal</h4>
                  <div className="flex flex-col gap-3">
                     <Link href="/privacy" className="text-[11px] text-gray-500 hover:text-black transition-colors">Privacy Policy</Link>
                     <Link href="/terms" className="text-[11px] text-gray-500 hover:text-black transition-colors">Terms & Conditions</Link>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Bar */}
            <div className="border-t border-gray-100 mt-12 pt-6 flex flex-col md:flex-row justify-between items-center gap-4">
              <p className="text-[10px] text-gray-500">
                © {currentYear} dezign2app. All rights reserved.
              </p>
              <div className="flex flex-wrap justify-center items-center gap-4 md:gap-6">
                <Link href="/privacy" className="text-[10px] text-gray-500 hover:text-black underline decoration-gray-300 underline-offset-2 transition-colors">Privacy Policy</Link>
                <Link href="/terms" className="text-[10px] text-gray-500 hover:text-black underline decoration-gray-300 underline-offset-2 transition-colors">Terms & Conditions</Link>
              </div>
            </div>
         </div>
      </footer>
    </div>
  );
};
