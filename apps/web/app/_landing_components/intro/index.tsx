"use client";
import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";

const Intro = () => {
  return (
    <div className="w-full flex flex-col items-center">
      {/* ── Hero ───────────────────────────────────────── */}
      <section className="w-full flex flex-col items-center text-center px-6 pt-24 pb-20 relative overflow-hidden">
        {/* Soft gradient background matching mockup */}
        <div
          className="absolute inset-0 z-0 pointer-events-none"
          style={{
            background: "radial-gradient(circle at 50% 0%, #fff7e6 0%, #e6f7ff 50%, white 100%)",
            opacity: 0.8
          }}
        />

        <div className="relative z-10 flex flex-col items-center gap-6 max-w-4xl w-full">
          {/* Headline */}
          <h1 className="text-3xl lg:text-5xl font-semibold leading-[1.1] tracking-tight text-gray-900">
            From Requirements to Production.<br />
            Fully Autonomous.
          </h1>

          {/* Subtitle */}
          <p className="text-xs text-gray-600 leading-relaxed max-w-xl font-medium">
            The ultimate abstraction layer for full-stack app development. Define requirements, simulate architecture, write code, and deploy to Kubernetes — automatically.
          </p>

          {/* CTA */}
          <Link
            href="/sign-up"
            className="bg-black text-white text-sm font-semibold px-8 py-3.5 rounded-full hover:bg-gray-800 transition-colors shadow-lg"
          >
            Get started
          </Link>

          {/* Dashboard Mockup */}
          <div className="mt-1 w-full max-w-5xl rounded-3xl p-3 bg-white/40 backdrop-blur-2xl border border-white shadow-2xl relative">
            <div className="w-full bg-[#fcfcfc] rounded-2xl border border-gray-100 overflow-hidden shadow-sm flex h-[450px]">
              {/* Sidebar */}
              <div className="w-16 border-r border-gray-100 flex flex-col items-center py-6 gap-6 bg-white shrink-0">
                <div className="w-8 h-8 rounded-full bg-black/5 flex items-center justify-center text-lg">🤖</div>
                <div className="flex flex-col gap-4 text-gray-300 w-full px-4">
                  <div className="w-full h-1 bg-gray-200 rounded-full" />
                  <div className="w-full h-1 bg-gray-200 rounded-full" />
                  <div className="w-full h-1 bg-gray-200 rounded-full" />
                </div>
              </div>
              {/* Main Content */}
              <div className="flex-1 p-8 bg-gray-50/50 flex flex-col gap-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center text-2xl">
                    ✨
                  </div>
                  <div className="text-left">
                    <h3 className="text-xl font-semibold text-gray-800">Hello, Architect!</h3>
                    <p className="text-sm text-gray-500">What system are we building today?</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 flex-1">
                  <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex flex-col gap-3 text-left hover:border-gray-200 transition-colors">
                    <span className="text-sm font-semibold text-gray-800">1. System Design</span>
                    <p className="text-xs text-gray-500">Draw topologies and establish dependencies.</p>
                    <div className="mt-auto h-20 bg-blue-50/50 rounded-lg border border-blue-100/50 p-2 flex gap-2 items-center justify-center">
                       <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }} className="w-10 h-10 bg-white rounded-lg shadow-sm border border-blue-200 flex items-center justify-center">
                         <div className="w-4 h-4 bg-blue-100 rounded-sm"></div>
                       </motion.div>
                       <div className="flex-1 h-0.5 bg-blue-200/50 overflow-hidden relative rounded-full">
                         <motion.div animate={{ x: ["-100%", "100%"] }} transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }} className="absolute inset-0 bg-blue-400"></motion.div>
                       </div>
                       <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ repeat: Infinity, duration: 2, ease: "easeInOut", delay: 1 }} className="w-10 h-10 bg-white rounded-lg shadow-sm border border-blue-200 flex items-center justify-center">
                         <div className="w-4 h-4 bg-blue-100 rounded-sm"></div>
                       </motion.div>
                    </div>
                  </div>
                  <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex flex-col gap-3 text-left hover:border-gray-200 transition-colors">
                    <span className="text-sm font-semibold text-gray-800">2. Simulation</span>
                    <p className="text-xs text-gray-500">Run load tests and validate data flow.</p>
                    <div className="mt-auto h-20 bg-gradient-to-br from-emerald-50/80 to-teal-50/80 rounded-xl border border-emerald-100/50 p-2.5 flex items-center justify-between relative overflow-hidden shadow-inner">
                      {/* Subtle Grid Background */}
                      <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)', backgroundSize: '6px 6px' }}></div>
                      
                      {/* Client */}
                      <div className="z-10 flex flex-col items-center gap-1.5 shrink-0">
                        <motion.div animate={{ y: [0, -2, 0] }} transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }} className="w-7 h-7 rounded-[8px] bg-white flex items-center justify-center border border-emerald-200 shadow-[0_2px_8px_rgba(16,185,129,0.15)] text-emerald-600">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                        </motion.div>
                        <span className="text-[9px] font-bold text-emerald-700/80 uppercase tracking-wider">Client</span>
                      </div>

                      {/* Data Flow 1 */}
                      <div className="flex-1 h-[2px] bg-emerald-200/50 relative overflow-hidden mx-1.5 rounded-full">
                         <motion.div animate={{ x: ["-100%", "300%"] }} transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }} className="absolute top-0 bottom-0 w-8 bg-gradient-to-r from-transparent via-emerald-500 to-transparent"></motion.div>
                      </div>

                      {/* API Gateway */}
                      <div className="z-10 flex flex-col items-center gap-1.5 shrink-0">
                        <motion.div animate={{ y: [0, -2, 0] }} transition={{ repeat: Infinity, duration: 3, delay: 0.5, ease: "easeInOut" }} className="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center shadow-[0_4px_12px_rgba(16,185,129,0.3)] text-white border border-emerald-400">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        </motion.div>
                        <span className="text-[9px] font-bold text-emerald-700/80 uppercase tracking-wider">API</span>
                      </div>

                      {/* Data Flow 2 */}
                      <div className="flex-1 h-[2px] bg-emerald-200/50 relative overflow-hidden mx-1.5 rounded-full">
                         <motion.div animate={{ x: ["-100%", "300%"] }} transition={{ repeat: Infinity, duration: 1.2, delay: 0.6, ease: "linear" }} className="absolute top-0 bottom-0 w-8 bg-gradient-to-r from-transparent via-emerald-500 to-transparent"></motion.div>
                      </div>

                      {/* Stream (Kafka) */}
                      <div className="z-10 flex flex-col items-center gap-1.5 shrink-0">
                        <motion.div animate={{ y: [0, -2, 0] }} transition={{ repeat: Infinity, duration: 3, delay: 1, ease: "easeInOut" }} className="w-7 h-7 rounded-[8px] bg-gray-900 flex items-center justify-center shadow-[0_4px_10px_rgba(0,0,0,0.2)] text-white border border-gray-700">
                           <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                        </motion.div>
                        <span className="text-[9px] font-bold text-emerald-700/80 uppercase tracking-wider">Stream</span>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex flex-col gap-3 text-left hover:border-gray-200 transition-colors">
                    <span className="text-sm font-semibold text-gray-800">3. Autonomous Coding</span>
                    <p className="text-xs text-gray-500">Agents write full-stack code adhering to specs.</p>
                    <div className="mt-auto h-20 bg-purple-50/50 rounded-lg border border-purple-100/50 p-4 flex flex-col gap-2">
                      <motion.div animate={{ width: ["10%", "66%"], opacity: [0.3, 1] }} transition={{ repeat: Infinity, duration: 2, repeatType: "reverse", ease: "easeInOut" }} className="h-1.5 bg-purple-400 rounded-full"></motion.div>
                      <motion.div animate={{ width: ["10%", "50%"], opacity: [0.3, 1] }} transition={{ repeat: Infinity, duration: 2, delay: 0.3, repeatType: "reverse", ease: "easeInOut" }} className="h-1.5 bg-purple-400 rounded-full"></motion.div>
                      <motion.div animate={{ width: ["10%", "80%"], opacity: [0.3, 1] }} transition={{ repeat: Infinity, duration: 2, delay: 0.6, repeatType: "reverse", ease: "easeInOut" }} className="h-1.5 bg-purple-400 rounded-full"></motion.div>
                    </div>
                  </div>
                  <div className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm flex flex-col gap-3 text-left hover:border-gray-200 transition-colors">
                    <span className="text-sm font-semibold text-gray-800">4. CI/CD & Deploy</span>
                    <p className="text-xs text-gray-500">Auto-generated Terraform & K8s manifests.</p>
                    <div className="mt-auto h-20 bg-orange-50/50 rounded-lg border border-orange-100/50 p-2 flex gap-3 items-center justify-center">
                       <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 6, ease: "linear" }} className="text-xl bg-white w-10 h-10 rounded-lg shadow-sm border border-orange-200 flex items-center justify-center">☸️</motion.div>
                       <motion.div animate={{ x: [0, 5, 0] }} transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }} className="text-orange-400 text-lg">→</motion.div>
                       <motion.div animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }} className="text-xl bg-white w-10 h-10 rounded-lg shadow-sm border border-orange-200 flex items-center justify-center">☁️</motion.div>
                    </div>
                  </div>
                </div>

                <div className="mt-2 w-full bg-white rounded-full border border-gray-200 p-2.5 shadow-sm flex items-center justify-between pl-4">
                   <span className="text-xs text-gray-400">Describe your application requirements...</span>
                   <div className="w-7 h-7 rounded-full bg-black flex items-center justify-center text-white text-sm font-bold shadow-md cursor-pointer hover:bg-gray-800 transition-colors">↑</div>
                </div>
              </div>
            </div>
          </div>

          {/* Three Horizontal Features */}
          <div className="mt-12 w-full max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-8 pt-8 border-t border-gray-100 text-left">
            <div className="flex gap-4 items-start">
              <div className="w-10 h-10 rounded-xl bg-[#fff7e6] text-orange-600 flex items-center justify-center shrink-0 border border-orange-100 shadow-sm">📝</div>
              <div>
                <h4 className="text-sm font-bold text-gray-900">Requirements First</h4>
                <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">Start with plain English. Our engine translates needs into technical specs instantly.</p>
              </div>
            </div>
            <div className="flex gap-4 items-start">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100 shadow-sm">🔍</div>
              <div>
                <h4 className="text-sm font-bold text-gray-900">Simulate & Validate</h4>
                <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">Catch bottlenecks early by running live data flow simulations on generated topologies.</p>
              </div>
            </div>
            <div className="flex gap-4 items-start">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-100 shadow-sm">🚀</div>
              <div>
                <h4 className="text-sm font-bold text-gray-900">Zero-Touch Infra</h4>
                <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">Agents configure LoadBalancers, Kubernetes, and CI/CD pipelines out of the box.</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Intro;