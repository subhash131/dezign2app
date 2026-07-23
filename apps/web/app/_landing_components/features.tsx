"use client";
import React, { useState } from "react";
import Pricing from "./pricing";

// ─── Feature Switcher Section ──────────────────────────────────────────────────

const features = [
  {
    id: "design",
    title: "Requirements & System Design",
    description: "Start with plain English. Our engine maps out the entire system topology, microservices, and databases.",
    icon: "🏗️",
  },
  {
    id: "simulate",
    title: "Data Flow Simulation",
    description: "Run live load tests, simulate traffic spikes, and validate API endpoints before a single line of code is written.",
    icon: "📊",
  },
  {
    id: "code",
    title: "Autonomous Coding Agents",
    description: "AI agents execute the system design, writing robust full-stack code adhering to best practices and patterns.",
    icon: "💻",
  },
  {
    id: "deploy",
    title: "CI/CD & Kubernetes Orchestration",
    description: "Zero-touch deployments. Agents write Terraform, Dockerfiles, and K8s manifests, deploying straight to your cloud.",
    icon: "☁️",
  },
];

const FeatureSwitcher = () => {
  const [activeFeature, setActiveFeature] = useState(features[1]?.id);

  return (
    <section className="w-full py-24 bg-white scroll-mt-14" id="features">
      <div className="max-w-6xl mx-auto px-6 flex flex-col items-center">
        {/* Header */}
        <div className="flex flex-col items-center text-center gap-4 mb-16">
          <div className="bg-gray-100 text-gray-600 text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full">
            Abstraction Layer
          </div>
          <h2 className="text-4xl lg:text-5xl font-semibold text-gray-900 tracking-tight">
            Lead your full-stack transformation
          </h2>
        </div>

        {/* Content */}
        <div className="w-full flex flex-col lg:flex-row gap-12 items-center">
          {/* Left: Tab List */}
          <div className="flex-1 flex flex-col gap-2 w-full">
            {features.map((feature) => {
              const isActive = activeFeature === feature.id;
              return (
                <div
                  key={feature.id}
                  onClick={() => setActiveFeature(feature.id)}
                  className={`cursor-pointer transition-all duration-500 ease-in-out flex gap-4 items-start transform ${
                    isActive 
                      ? "bg-yellow-50 shadow-md border border-yellow-300 p-6 rounded-2xl scale-[1.02]" 
                      : "hover:bg-gray-100 border border-transparent py-4 px-6 rounded-xl hover:scale-[1.01]"
                  }`}
                >
                  <div className={`text-xl mt-0.5 transition-transform duration-500 ${isActive ? "scale-110" : ""}`}>{feature.icon}</div>
                  <div>
                    <h3 className={`text-base font-bold transition-colors duration-300 ${isActive ? "text-gray-900" : "text-gray-600 hover:text-gray-900"}`}>
                      {feature.title}
                    </h3>
                    <div
                      className={`overflow-hidden transition-all duration-500 ease-in-out ${
                        isActive ? "max-h-40 opacity-100 mt-2" : "max-h-0 opacity-0 mt-0"
                      }`}
                    >
                      <p className="text-sm text-gray-700 leading-relaxed">
                        {feature.description}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right: Dynamic Visual */}
          <div className="flex-1 w-full flex items-center justify-center lg:pl-10">
            <div className="w-full max-w-[440px] aspect-square bg-[#f8fafc] rounded-[2.5rem] border-[10px] border-gray-50 shadow-sm relative flex items-center justify-center p-6">
              {activeFeature === "design" && (
                <div className="w-full h-full bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col animate-in fade-in zoom-in duration-500 relative overflow-hidden">
                   
                   <div className="flex flex-col gap-1.5 mb-6">
                     <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Input: Natural Language</span>
                     <div className="w-3/4 h-2 bg-gray-200 rounded animate-pulse"></div>
                     <div className="w-1/2 h-2 bg-gray-200 rounded animate-pulse" style={{ animationDelay: '200ms' }}></div>
                   </div>

                   <div className="flex-1 border border-dashed border-gray-200 rounded-xl relative flex items-center justify-between p-4 bg-gray-50/50 overflow-hidden">
                     
                     {/* Input Node */}
                     <div className="w-10 h-10 bg-white border border-gray-200 shadow-sm rounded-lg flex items-center justify-center text-lg z-10 shrink-0">
                       📝
                     </div>

                     {/* Arrow Stream */}
                     <div className="flex-1 h-px bg-gray-300 relative mx-2">
                        {/* Moving particle */}
                        <div className="absolute top-1/2 -translate-y-1/2 left-0 w-1.5 h-1.5 bg-black rounded-full" 
                             style={{ animation: 'moveRight 1.5s infinite ease-in-out' }}></div>
                     </div>

                     {/* Transformer Engine */}
                     <div className="w-12 h-12 bg-black rounded-2xl shadow-xl flex items-center justify-center text-xl z-10 relative shrink-0">
                       ✨
                       {/* Pulsing ring */}
                       <div className="absolute inset-0 border-2 border-black rounded-2xl animate-ping opacity-30"></div>
                     </div>

                     {/* Branching Arrows */}
                     <div className="w-16 h-24 relative ml-2 shrink-0">
                       <svg className="absolute inset-0 w-full h-full" viewBox="0 0 64 96">
                         <path d="M0,48 C24,48 32,14 64,14" fill="none" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="4 4" style={{ animation: 'dash 1s linear infinite' }} />
                         <path d="M0,48 L64,48" fill="none" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="4 4" style={{ animation: 'dash 1s linear infinite' }} />
                         <path d="M0,48 C24,48 32,82 64,82" fill="none" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="4 4" style={{ animation: 'dash 1s linear infinite' }} />
                       </svg>
                     </div>

                     {/* Output Shapes */}
                     <div className="flex flex-col justify-between h-24 z-10 shrink-0 py-0.5 ml-1">
                       <div className="w-7 h-7 bg-blue-100 border border-blue-300 rounded-full shadow-sm animate-bounce" style={{ animationDuration: '2s' }}></div>
                       <div className="w-7 h-7 bg-orange-100 border border-orange-300 rounded-lg shadow-sm animate-bounce" style={{ animationDuration: '2.5s' }}></div>
                       <div className="w-7 h-7 bg-green-100 border border-green-300 rounded-sm shadow-sm animate-bounce" style={{ animationDuration: '3s' }}></div>
                     </div>

                   </div>

                   <style dangerouslySetInnerHTML={{__html: `
                     @keyframes moveRight {
                       0% { left: 0; opacity: 0; transform: translateY(-50%) scale(0.5); }
                       20% { opacity: 1; transform: translateY(-50%) scale(1); }
                       80% { opacity: 1; transform: translateY(-50%) scale(1); }
                       100% { left: 100%; opacity: 0; transform: translateY(-50%) scale(0.5); }
                     }
                     @keyframes dash {
                       to {
                         stroke-dashoffset: -16;
                       }
                     }
                   `}} />
                </div>
              )}
              {activeFeature === "simulate" && (
                <div className="relative w-full h-full bg-slate-50 rounded-2xl shadow-sm border border-gray-200 flex items-center justify-center animate-in fade-in zoom-in duration-500 overflow-hidden">
                   
                   {/* Connection Lines (SVG) */}
                   <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 400 400" preserveAspectRatio="none" style={{ zIndex: 0 }}>
                     {/* Triangle paths */}
                     <path d="M 200,80 L 108,292" fill="none" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="6 6" className="animate-[dash_1s_linear_infinite]" />
                     <path d="M 108,292 L 292,292" fill="none" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="6 6" className="animate-[dash_1s_linear_infinite]" />
                     <path d="M 292,292 L 200,80" fill="none" stroke="#cbd5e1" strokeWidth="2" strokeDasharray="6 6" className="animate-[dash_1s_linear_infinite]" />
                     
                     {/* Data Particles traveling on paths */}
                     <circle r="6" fill="#3b82f6" className="drop-shadow-md">
                       <animateMotion dur="2s" repeatCount="indefinite" path="M 200,80 L 108,292" />
                     </circle>
                     <circle r="6" fill="#f59e0b" className="drop-shadow-md">
                       <animateMotion dur="2.5s" repeatCount="indefinite" path="M 108,292 L 292,292" />
                     </circle>
                     <circle r="6" fill="#10b981" className="drop-shadow-md">
                       <animateMotion dur="1.5s" repeatCount="indefinite" path="M 292,292 L 200,80" />
                     </circle>
                     <circle r="5" fill="#8b5cf6" className="drop-shadow-md">
                       <animateMotion dur="1.8s" repeatCount="indefinite" path="M 108,292 L 200,80" />
                     </circle>
                     <circle r="5" fill="#ef4444" className="drop-shadow-md">
                       <animateMotion dur="2.2s" repeatCount="indefinite" path="M 292,292 L 108,292" />
                     </circle>
                   </svg>

                   {/* Top Node */}
                   <div className="absolute top-[12%] left-1/2 -translate-x-1/2 w-24 h-14 bg-blue-50 border-2 border-blue-400 rounded-xl shadow-md flex flex-col items-center justify-center z-10">
                     <span className="text-xs font-bold text-blue-800">API Gateway</span>
                     <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-blue-500 rounded-full animate-ping opacity-75"></div>
                     <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-blue-500 rounded-full border-2 border-white"></div>
                   </div>

                   {/* Bottom Left Node */}
                   <div className="absolute bottom-[20%] left-[15%] w-24 h-14 bg-orange-50 border-2 border-orange-400 rounded-xl shadow-md flex flex-col items-center justify-center z-10">
                     <span className="text-xs font-bold text-orange-800">Auth Node</span>
                     <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-orange-500 rounded-full animate-ping opacity-75" style={{animationDelay: '300ms'}}></div>
                     <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-orange-500 rounded-full border-2 border-white"></div>
                   </div>

                   {/* Bottom Right Node */}
                   <div className="absolute bottom-[20%] right-[15%] w-24 h-14 bg-green-50 border-2 border-green-400 rounded-xl shadow-md flex flex-col items-center justify-center z-10">
                     <span className="text-xs font-bold text-green-800">DB Replica</span>
                     <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-green-500 rounded-full animate-ping opacity-75" style={{animationDelay: '600ms'}}></div>
                     <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-green-500 rounded-full border-2 border-white"></div>
                   </div>
                   
                   {/* Metrics Overlay */}
                   <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm rounded-lg p-2 border border-gray-200 shadow-sm text-[10px] font-mono text-gray-600 z-20">
                     <div className="flex items-center gap-2 mb-1">
                       <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                       <span className="font-semibold">Live Traffic</span>
                     </div>
                     <div>Req/s: <span className="text-green-600 font-bold">14.2k</span></div>
                     <div>Latency: <span className="text-orange-500 font-bold">32ms</span></div>
                   </div>

                   <style dangerouslySetInnerHTML={{__html: `
                     @keyframes dash {
                       to {
                         stroke-dashoffset: -12;
                       }
                     }
                   `}} />
                </div>
              )}
              {activeFeature === "code" && (
                <div className="w-full h-full bg-[#0d1117] rounded-2xl shadow-sm border border-gray-800 p-5 flex flex-col animate-in fade-in zoom-in duration-500 relative overflow-hidden">
                   {/* Editor Header */}
                   <div className="flex gap-2 mb-4 border-b border-gray-800 pb-4">
                     <div className="w-3 h-3 rounded-full bg-[#ff5f56]"></div>
                     <div className="w-3 h-3 rounded-full bg-[#ffbd2e]"></div>
                     <div className="w-3 h-3 rounded-full bg-[#27c93f]"></div>
                   </div>

                   {/* Code Editor Body */}
                   <div className="flex flex-col gap-1.5 font-mono text-[10px] sm:text-[11px] mt-2 relative z-10 text-gray-300">
                     
                     {/* Line 1 */}
                     <div className="relative h-5 w-fit">
                       <div className="invisible whitespace-nowrap opacity-0">
                         <span className="text-pink-400">export const</span> <span className="text-yellow-200">Server</span> = () =&gt; {"{"}
                       </div>
                       <div className="absolute top-0 left-0 h-full flex items-center" style={{ animation: 'typeLine1 10s infinite' }}>
                         <div className="overflow-hidden whitespace-nowrap h-full w-full flex items-center">
                           <div><span className="text-pink-400">export const</span> <span className="text-yellow-200">Server</span> = () =&gt; {"{"}</div>
                         </div>
                         <div className="absolute right-0 translate-x-[30%] text-base z-10 drop-shadow-md" style={{ animation: 'bot1 10s infinite' }}>🤖</div>
                       </div>
                     </div>

                     {/* Line 2 */}
                     <div className="relative h-5 w-fit ml-4">
                       <div className="invisible whitespace-nowrap opacity-0">
                         <span className="text-pink-400">const</span> db = <span className="text-blue-300">useDatabase</span>();
                       </div>
                       <div className="absolute top-0 left-0 h-full flex items-center" style={{ animation: 'typeLine2 10s infinite' }}>
                         <div className="overflow-hidden whitespace-nowrap h-full w-full flex items-center">
                           <div><span className="text-pink-400">const</span> db = <span className="text-blue-300">useDatabase</span>();</div>
                         </div>
                         <div className="absolute right-0 translate-x-[30%] text-base z-10 drop-shadow-md" style={{ animation: 'bot2 10s infinite' }}>🤖</div>
                       </div>
                     </div>

                     {/* Line 3 */}
                     <div className="relative h-5 w-fit ml-4">
                       <div className="invisible whitespace-nowrap opacity-0">
                         <span className="text-pink-400">const</span> auth = <span className="text-blue-300">useAuth</span>();
                       </div>
                       <div className="absolute top-0 left-0 h-full flex items-center" style={{ animation: 'typeLine3 10s infinite' }}>
                         <div className="overflow-hidden whitespace-nowrap h-full w-full flex items-center">
                           <div><span className="text-pink-400">const</span> auth = <span className="text-blue-300">useAuth</span>();</div>
                         </div>
                         <div className="absolute right-0 translate-x-[30%] text-base z-10 drop-shadow-md" style={{ animation: 'bot3 10s infinite' }}>🤖</div>
                       </div>
                     </div>

                     {/* Line 4 */}
                     <div className="relative h-5 w-fit ml-4">
                       <div className="invisible whitespace-nowrap opacity-0">
                         <span className="text-pink-400">if</span> (!auth.<span className="text-blue-300">user</span>) {"{"}
                       </div>
                       <div className="absolute top-0 left-0 h-full flex items-center" style={{ animation: 'typeLine4 10s infinite' }}>
                         <div className="overflow-hidden whitespace-nowrap h-full w-full flex items-center">
                           <div><span className="text-pink-400">if</span> (!auth.<span className="text-blue-300">user</span>) {"{"}</div>
                         </div>
                         <div className="absolute right-0 translate-x-[30%] text-base z-10 drop-shadow-md" style={{ animation: 'bot4 10s infinite' }}>🤖</div>
                       </div>
                     </div>

                     {/* Line 5 */}
                     <div className="relative h-5 w-fit ml-8">
                       <div className="invisible whitespace-nowrap opacity-0">
                         <span className="text-pink-400">throw new</span> <span className="text-yellow-200">Error</span>(<span className="text-green-300">"401"</span>);
                       </div>
                       <div className="absolute top-0 left-0 h-full flex items-center" style={{ animation: 'typeLine5 10s infinite' }}>
                         <div className="overflow-hidden whitespace-nowrap h-full w-full flex items-center">
                           <div><span className="text-pink-400">throw new</span> <span className="text-yellow-200">Error</span>(<span className="text-green-300">"401"</span>);</div>
                         </div>
                         <div className="absolute right-0 translate-x-[30%] text-base z-10 drop-shadow-md" style={{ animation: 'bot5 10s infinite' }}>🤖</div>
                       </div>
                     </div>

                     {/* Line 6 */}
                     <div className="relative h-5 w-fit ml-4">
                       <div className="invisible whitespace-nowrap opacity-0">
                         {"}"}
                       </div>
                       <div className="absolute top-0 left-0 h-full flex items-center" style={{ animation: 'typeLine6 10s infinite' }}>
                         <div className="overflow-hidden whitespace-nowrap h-full w-full flex items-center">
                           <div>{"}"}</div>
                         </div>
                         <div className="absolute right-0 translate-x-[30%] text-base z-10 drop-shadow-md" style={{ animation: 'bot6 10s infinite' }}>🤖</div>
                       </div>
                     </div>

                     {/* Line 7 */}
                     <div className="relative h-5 w-fit ml-4">
                       <div className="invisible whitespace-nowrap opacity-0">
                         <span className="text-pink-400">return</span> db.<span className="text-blue-300">query</span>(<span className="text-green-300">"SELECT *"</span>);
                       </div>
                       <div className="absolute top-0 left-0 h-full flex items-center" style={{ animation: 'typeLine7 10s infinite' }}>
                         <div className="overflow-hidden whitespace-nowrap h-full w-full flex items-center">
                           <div><span className="text-pink-400">return</span> db.<span className="text-blue-300">query</span>(<span className="text-green-300">"SELECT *"</span>);</div>
                         </div>
                         <div className="absolute right-0 translate-x-[30%] text-base z-10 drop-shadow-md" style={{ animation: 'bot7 10s infinite' }}>🤖</div>
                       </div>
                     </div>

                     {/* Line 8 */}
                     <div className="relative h-5 w-fit">
                       <div className="invisible whitespace-nowrap opacity-0">
                         {"}"}
                       </div>
                       <div className="absolute top-0 left-0 h-full flex items-center" style={{ animation: 'typeLine8 10s infinite' }}>
                         <div className="overflow-hidden whitespace-nowrap h-full w-full flex items-center">
                           <div>{"}"}</div>
                         </div>
                         <div className="absolute right-0 translate-x-[30%] text-base z-10 drop-shadow-md" style={{ animation: 'bot8 10s infinite' }}>🤖</div>
                       </div>
                     </div>

                   </div>

                   {/* Status bar */}
                   <div className="absolute bottom-0 left-0 right-0 p-2.5 bg-[#161b22] border-t border-gray-800 text-[#8b949e] flex items-center gap-2 text-[10px] font-mono z-0">
                      <span className="animate-spin text-xs">⚙️</span>
                      <span>Agent is writing code...</span>
                   </div>

                   <style dangerouslySetInnerHTML={{__html: `
                     @keyframes typeLine1 { 0% { width: 0; } 8% { width: 100%; } 85% { width: 100%; } 85.1% { width: 0; } 100% { width: 0; } }
                     @keyframes typeLine2 { 0%, 8% { width: 0; } 16% { width: 100%; } 85% { width: 100%; } 85.1% { width: 0; } 100% { width: 0; } }
                     @keyframes typeLine3 { 0%, 16% { width: 0; } 24% { width: 100%; } 85% { width: 100%; } 85.1% { width: 0; } 100% { width: 0; } }
                     @keyframes typeLine4 { 0%, 24% { width: 0; } 32% { width: 100%; } 85% { width: 100%; } 85.1% { width: 0; } 100% { width: 0; } }
                     @keyframes typeLine5 { 0%, 32% { width: 0; } 42% { width: 100%; } 85% { width: 100%; } 85.1% { width: 0; } 100% { width: 0; } }
                     @keyframes typeLine6 { 0%, 42% { width: 0; } 48% { width: 100%; } 85% { width: 100%; } 85.1% { width: 0; } 100% { width: 0; } }
                     @keyframes typeLine7 { 0%, 48% { width: 0; } 58% { width: 100%; } 85% { width: 100%; } 85.1% { width: 0; } 100% { width: 0; } }
                     @keyframes typeLine8 { 0%, 58% { width: 0; } 64% { width: 100%; } 85% { width: 100%; } 85.1% { width: 0; } 100% { width: 0; } }
                     
                     @keyframes bot1 { 0%, 7.9% { opacity: 1; } 8%, 100% { opacity: 0; } }
                     @keyframes bot2 { 0%, 7.9% { opacity: 0; } 8%, 15.9% { opacity: 1; } 16%, 100% { opacity: 0; } }
                     @keyframes bot3 { 0%, 15.9% { opacity: 0; } 16%, 23.9% { opacity: 1; } 24%, 100% { opacity: 0; } }
                     @keyframes bot4 { 0%, 23.9% { opacity: 0; } 24%, 31.9% { opacity: 1; } 32%, 100% { opacity: 0; } }
                     @keyframes bot5 { 0%, 31.9% { opacity: 0; } 32%, 41.9% { opacity: 1; } 42%, 100% { opacity: 0; } }
                     @keyframes bot6 { 0%, 41.9% { opacity: 0; } 42%, 47.9% { opacity: 1; } 48%, 100% { opacity: 0; } }
                     @keyframes bot7 { 0%, 47.9% { opacity: 0; } 48%, 57.9% { opacity: 1; } 58%, 100% { opacity: 0; } }
                     @keyframes bot8 { 0%, 57.9% { opacity: 0; } 58%, 85% { opacity: 1; } 85.1%, 100% { opacity: 0; } }
                   `}} />
                </div>
              )}
              {activeFeature === "deploy" && (
                <div className="relative w-full h-full bg-[#fafcff] rounded-xl shadow-sm border border-blue-100/50 p-4 flex flex-col items-center justify-center overflow-hidden animate-in fade-in zoom-in duration-500">
                   <style dangerouslySetInnerHTML={{__html: `
                     @keyframes float-slow { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
                     @keyframes float-medium { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-15px); } }
                     @keyframes float-fast { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
                     @keyframes dash-move { from { stroke-dashoffset: 24; } to { stroke-dashoffset: 0; } }
                     @keyframes dash-move-rev { from { stroke-dashoffset: 0; } to { stroke-dashoffset: 24; } }
                     .animate-dash { animation: dash-move 1.5s linear infinite; }
                     .animate-dash-rev { animation: dash-move-rev 1.5s linear infinite; }
                     .bg-grid-pattern {
                       background-image: radial-gradient(#3b82f620 1px, transparent 1px);
                       background-size: 20px 20px;
                     }
                   `}} />
                   
                   {/* Background Grid & Decorative Elements */}
                   <div className="absolute inset-0 bg-grid-pattern opacity-50"></div>
                   
                   {/* Connection Lines (SVG) */}
                   <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
                     <line x1="20%" y1="50%" x2="50%" y2="50%" stroke="#93c5fd" strokeWidth="2" strokeDasharray="6 6" className="animate-dash" />
                     <line x1="80%" y1="50%" x2="50%" y2="50%" stroke="#86efac" strokeWidth="2" strokeDasharray="6 6" className="animate-dash-rev" />
                     <line x1="75%" y1="20%" x2="50%" y2="50%" stroke="#d8b4fe" strokeWidth="2" strokeDasharray="6 6" className="animate-dash-rev" />
                     <line x1="25%" y1="80%" x2="50%" y2="50%" stroke="#fca5a5" strokeWidth="2" strokeDasharray="6 6" className="animate-dash" />
                     
                     {/* Decorative curved paths */}
                     <path d="M 0 10 Q 30 50 100 20" stroke="#e2e8f0" strokeWidth="1" fill="none" strokeDasharray="3 3" />
                     <path d="M 100 280 Q 200 220 300 290" stroke="#e2e8f0" strokeWidth="1" fill="none" strokeDasharray="3 3" />
                   </svg>
                   
                   {/* Left Stack (Load Balancer) */}
                   <div className="absolute top-1/2 left-[20%] -translate-y-1/2 -translate-x-1/2 z-10" style={{ animation: 'float-medium 4s ease-in-out infinite' }}>
                     <div className="relative group cursor-pointer">
                       <div className="absolute inset-0 bg-blue-100/60 rounded-xl transform -translate-x-2 md:-translate-x-3 scale-95 blur-[1px] transition-transform group-hover:-translate-x-4"></div>
                       <div className="absolute inset-0 bg-blue-200/60 rounded-xl transform -translate-x-1 md:-translate-x-1.5 scale-[0.97] transition-transform group-hover:-translate-x-2"></div>
                       <div className="relative w-14 sm:w-16 md:w-20 lg:w-24 aspect-[4/5] bg-white border border-blue-100 rounded-xl shadow-lg flex flex-col items-center justify-center p-2 transform transition-transform group-hover:scale-105">
                          <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-blue-50 flex items-center justify-center mb-1 md:mb-2">
                            <svg className="w-3 h-3 md:w-4 md:h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2 1.5 3 3 3h10c1.5 0 3-1 3-3V7c0-2-1.5-3-3-3H7C5.5 4 4 5 4 7zM4 12h16M12 4v16" /></svg>
                          </div>
                          <div className="w-6 sm:w-8 md:w-10 h-1 md:h-1.5 bg-gray-200 rounded-full mb-1"></div>
                          <div className="w-4 sm:w-6 md:w-8 h-1 md:h-1.5 bg-gray-200 rounded-full"></div>
                       </div>
                       <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                         <span className="text-[9px] md:text-[10px] font-semibold text-blue-600 uppercase tracking-wider bg-blue-50 px-2 py-0.5 rounded-full shadow-sm border border-blue-100">Load Balancer</span>
                       </div>
                     </div>
                   </div>

                   {/* Right Stack (Containers) */}
                   <div className="absolute top-1/2 left-[80%] -translate-y-1/2 -translate-x-1/2 z-10" style={{ animation: 'float-slow 5s ease-in-out infinite' }}>
                     <div className="relative group cursor-pointer">
                       <div className="absolute inset-0 bg-green-100/60 rounded-xl transform translate-x-2 md:translate-x-3 scale-95 blur-[1px] transition-transform group-hover:translate-x-4"></div>
                       <div className="absolute inset-0 bg-green-200/60 rounded-xl transform translate-x-1 md:translate-x-1.5 scale-[0.97] transition-transform group-hover:translate-x-2"></div>
                       <div className="relative w-14 sm:w-16 md:w-20 lg:w-24 aspect-[4/5] bg-white border border-green-100 rounded-xl shadow-lg flex flex-col items-center justify-center p-2 transform transition-transform group-hover:scale-105">
                          <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-green-50 flex items-center justify-center mb-1 md:mb-2">
                            <svg className="w-3 h-3 md:w-4 md:h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                          </div>
                          <div className="w-6 sm:w-8 md:w-10 h-1 md:h-1.5 bg-gray-200 rounded-full mb-1"></div>
                          <div className="w-4 sm:w-6 md:w-8 h-1 md:h-1.5 bg-gray-200 rounded-full"></div>
                       </div>
                       <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                         <span className="text-[9px] md:text-[10px] font-semibold text-green-600 uppercase tracking-wider bg-green-50 px-2 py-0.5 rounded-full shadow-sm border border-green-100">Containers</span>
                       </div>
                     </div>
                   </div>

                   {/* Top Right (Postgres) */}
                   <div className="absolute top-[20%] left-[75%] -translate-y-1/2 -translate-x-1/2 z-10" style={{ animation: 'float-fast 3.5s ease-in-out infinite' }}>
                     <div className="relative group cursor-pointer">
                       <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 bg-white border border-purple-100 rounded-full shadow-md flex items-center justify-center relative transform transition-transform group-hover:scale-110">
                         <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 md:w-3 md:h-3 bg-green-400 rounded-full border-2 border-white animate-pulse"></div>
                         <svg className="w-4 h-4 md:w-5 md:h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7c0-1.657 3.582-3 8-3s8 1.343 8 3-3.582 3-8 3-8-1.343-8-3z" />
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 1.657 3.582 3 8 3s8-1.343 8-3V7" />
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 12c0 1.657 3.582 3 8 3s8-1.343 8-3" />
                         </svg>
                       </div>
                       <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                         <span className="text-[9px] md:text-[10px] font-semibold text-purple-600 uppercase tracking-wider bg-purple-50 px-2 py-0.5 rounded-full shadow-sm border border-purple-100">Postgres DB</span>
                       </div>
                     </div>
                   </div>
                   
                   {/* Bottom Left (Auth Service) */}
                   <div className="absolute top-[80%] left-[25%] -translate-y-1/2 -translate-x-1/2 z-10" style={{ animation: 'float-medium 4.5s ease-in-out infinite reverse' }}>
                     <div className="relative group cursor-pointer">
                       <div className="w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 bg-white border border-red-100 rounded-full shadow-md flex items-center justify-center relative transform transition-transform group-hover:scale-110">
                         <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 md:w-3 md:h-3 bg-green-400 rounded-full border-2 border-white animate-pulse"></div>
                         <svg className="w-4 h-4 md:w-5 md:h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" /></svg>
                       </div>
                       <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity">
                         <span className="text-[9px] md:text-[10px] font-semibold text-red-600 uppercase tracking-wider bg-red-50 px-2 py-0.5 rounded-full shadow-sm border border-red-100">Auth Service</span>
                       </div>
                     </div>
                   </div>

                   {/* Center Hub (Kubernetes) */}
                   <div className="absolute top-1/2 left-1/2 -translate-y-1/2 -translate-x-1/2 z-20">
                     <div className="relative group cursor-default">
                       {/* Glowing effect */}
                       <div className="absolute inset-0 bg-blue-500/20 blur-2xl rounded-full scale-150 animate-pulse"></div>
                       
                       <div className="relative w-24 sm:w-28 md:w-32 h-28 sm:h-32 md:h-36 bg-blue-600 rounded-xl md:rounded-2xl shadow-2xl shadow-blue-500/30 border border-blue-400/50 p-2 md:p-3 flex flex-col items-center justify-center transform transition-all group-hover:scale-105 overflow-hidden">
                          {/* Inner decorative elements matching the visual */}
                          <div className="absolute top-0 right-0 w-16 h-16 bg-white/5 rounded-bl-full pointer-events-none"></div>
                          <div className="absolute bottom-0 left-0 w-12 h-12 bg-black/5 rounded-tr-full pointer-events-none"></div>
                          
                          <div className="w-10 md:w-14 h-1 bg-blue-400/50 rounded-full mb-1.5 self-start"></div>
                          <div className="w-14 md:w-20 h-1 bg-blue-400/50 rounded-full mb-3 md:mb-5 self-start"></div>
                          
                          {/* K8s Polygon */}
                          <div className="w-12 h-12 md:w-16 md:h-16 bg-[#0a1947] rounded-lg md:rounded-xl rotate-45 flex items-center justify-center mb-2 md:mb-3 shadow-inner">
                            <div className="-rotate-45 text-white">
                              {/* K8s wheel icon */}
                              <svg className="w-6 h-6 md:w-8 md:h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 2v20m10-10H2m17.07-7.07l-14.14 14.14M19.07 19.07L4.93 4.93" />
                                <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5" fill="#0a1947" />
                              </svg>
                            </div>
                          </div>
                          
                          <div className="w-12 md:w-16 h-1 bg-blue-400/50 rounded-full mt-2 md:mt-3 self-start"></div>
                          <div className="w-6 md:w-8 h-1 bg-blue-400/50 rounded-full mt-1 self-start"></div>
                       </div>
                       
                       {/* Floating badge */}
                       <div className="absolute -top-2 -right-2 md:-top-3 md:-right-3 bg-green-500 text-white text-[9px] md:text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg border-2 border-white animate-bounce">
                         Healthy
                       </div>
                     </div>
                   </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

// ─── Effortless Section ────────────────────────────────────────────────────────

export const EffortlessSection = () => {
  const [billing, setBilling] = React.useState<"monthly" | "annually">("monthly");

  return (
    <section className="w-full relative overflow-hidden py-32 bg-[#f4f4f5] flex justify-center font-sans">
      <div className="relative z-10 max-w-6xl w-full px-6 flex flex-col items-center justify-center min-h-[600px]">
        
        {/* Billing toggle at the top */}
        <div className="z-50 flex items-center bg-gray-200/70 backdrop-blur-md rounded-full p-1 gap-1 mb-12 shadow-inner border border-gray-300 pointer-events-auto">
          {(["monthly", "annually"] as const).map((cycle) => (
            <button
              key={cycle}
              onClick={() => setBilling(cycle)}
              className={`px-6 py-2 rounded-full text-sm font-medium transition-all duration-300 capitalize ${
                billing === cycle
                  ? "bg-[#1a1a1a] text-white shadow-md"
                  : "text-gray-600 hover:text-black"
              }`}
            >
              {cycle === "annually" ? "Annually" : "Monthly"}
            </button>
          ))}
        </div>

        {/* Floating Elements & Backgrounds */}
      <div className="absolute inset-0 pointer-events-none flex justify-center items-center z-10">
         
         {/* --- LEFT SIDE: Wallet Slot & Cards --- */}
         {/* Black Wallet Slot */}
         <div className="absolute top-[42%] left-[25%] w-64 h-16 bg-[#1a1a1a] rounded-full shadow-inner border-[6px] border-[#e4e4e7] z-10"></div>
         
         {/* Yellow Card (React) */}
         <div className="absolute top-[18%] left-[12%] w-32 h-44 bg-[#ffca28] rounded-2xl shadow-xl -rotate-[20deg] flex flex-col p-4 z-0 border border-yellow-300">
            <span className="font-bold text-yellow-900 text-xs">React</span>
            <div className="mt-auto text-yellow-700 font-black text-4xl opacity-50">⚛️</div>
         </div>

         {/* White Card (Next.js) */}
         <div className="absolute top-[28%] left-[18%] w-32 h-44 bg-white/90 backdrop-blur-xl rounded-2xl shadow-xl -rotate-[10deg] flex flex-col p-4 z-10 border border-gray-100">
            <span className="font-bold text-gray-800 text-xs">Next.js</span>
            <div className="mt-auto text-gray-200 font-black text-4xl">▲</div>
         </div>

         {/* Black Card (Node) */}
         <div className="absolute top-[34%] left-[23%] w-32 h-44 bg-[#1a1a1a] rounded-2xl shadow-2xl -rotate-[2deg] flex flex-col p-4 z-20 border border-gray-700">
            <span className="font-bold text-white text-xs opacity-80">Node.js</span>
            <div className="mt-auto text-gray-800 font-black text-4xl">⬢</div>
         </div>

         {/* Green Card (Postgres) */}
         <div className="absolute top-[37%] left-[28%] w-40 h-28 bg-[#10b981] rounded-2xl shadow-2xl rotate-[8deg] flex flex-col p-4 z-30 border border-green-400">
            <span className="font-bold text-white text-xs opacity-90 italic">PostgreSQL</span>
            <div className="mt-auto text-green-700 font-black text-3xl">🐘</div>
         </div>

         {/* Blue Card (Docker) */}
         <div className="absolute top-[40%] left-[33%] w-40 h-28 bg-[#3b82f6] rounded-2xl shadow-2xl rotate-[15deg] flex flex-col p-4 z-40 border border-blue-400">
            <span className="font-bold text-white text-xs opacity-90">Docker</span>
            <div className="mt-auto text-blue-700 font-black text-3xl italic">🐳</div>
         </div>

         {/* White Card Overlap (K8s) */}
         <div className="absolute top-[44%] left-[42%] w-24 h-24 bg-white rounded-2xl shadow-xl rotate-[25deg] flex flex-col p-3 z-30 border border-gray-100">
            <span className="font-bold text-blue-600 text-[10px] tracking-widest uppercase">K8s</span>
            <div className="mt-auto text-blue-100 font-black text-2xl">☸</div>
         </div>

         {/* Cursor Pointer pointing at 'effortless' */}
         <div className="absolute top-[58%] left-[28%] z-50 drop-shadow-2xl">
            <svg width="72" height="72" viewBox="0 0 24 24" fill="white" stroke="#1a1a1a" strokeWidth="1.5" xmlns="http://www.w3.org/2000/svg" className="-rotate-12">
              <path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.42c.45 0 .67-.54.35-.85L6.35 2.85a.5.5 0 0 0-.85.35Z" />
            </svg>
         </div>


         {/* --- RIGHT SIDE: Toggle & Icons --- */}
         
         {/* Toggle switch */}
         <div className="absolute top-[32%] right-[22%] w-28 h-14 bg-[#22c55e] rounded-full border-[6px] border-white shadow-2xl rotate-12 flex items-center p-1 z-30">
           <div className="w-9 h-9 bg-white rounded-full ml-auto shadow-md"></div>
         </div>

         {/* Lightning (Black Square) */}
         <div className="absolute bottom-[28%] right-[26%] bg-[#1a1a1a] w-24 h-24 rounded-[1.5rem] shadow-2xl -rotate-12 flex items-center justify-center z-10 border border-gray-800">
           <span className="text-[#fbbf24] text-5xl drop-shadow-[0_0_15px_rgba(251,191,36,0.5)]">⚡</span>
         </div>

         {/* Fingerprint (Glass) */}
         <div className="absolute bottom-[22%] right-[18%] bg-white/30 backdrop-blur-xl w-24 h-24 rounded-[1.5rem] shadow-xl rotate-6 flex items-center justify-center z-20 border border-white/60">
           <span className="text-[#ff6b00] text-5xl opacity-80">👆</span>
         </div>

         {/* Blue Lock */}
         <div className="absolute bottom-[10%] right-[14%] flex flex-col items-center justify-center -rotate-[15deg] z-30 drop-shadow-2xl">
           <div className="w-12 h-12 border-[8px] border-[#cbd5e1] rounded-t-full border-b-0 mb-[-8px]"></div>
           <div className="w-20 h-16 bg-[#3b82f6] rounded-[1.25rem] shadow-inner flex items-center justify-center border-t border-blue-400">
             <div className="w-3 h-5 bg-[#1e3a8a] rounded-full shadow-inner"></div>
           </div>
         </div>
      </div>

      {/* Main Text Content */}
      <div className="relative z-20 flex flex-col items-center text-center w-full pointer-events-none">
        <h2 className="font-black text-[#1a1a1a] flex flex-col items-center drop-shadow-sm w-full">
          {/* Building apps */}
          <div className="flex justify-center text-[70px] lg:text-[70px] leading-[0.9] tracking-[-0.04em] z-20">
             <span>Building apps now feels</span>
          </div>          
          {/* effortless */}
          <div className="text-[#ff6b00] text-[90px] lg:text-[110px] leading-[0.8] tracking-[-0.05em] mt-4 z-40 drop-shadow-md">
            effortless
          </div>
        </h2>
        
        <div className="pointer-events-auto w-full">
          <Pricing hideHeader={true} hideToggle={true} externalBilling={billing} />
        </div>
      </div>

    </div>
  </section>
  );
};


// ─── Features (main export) ───────────────────────────────────────────────────

const Features = () => {
  return (
    <>
      <FeatureSwitcher />
      <EffortlessSection />
    </>
  );
};

export default Features;
