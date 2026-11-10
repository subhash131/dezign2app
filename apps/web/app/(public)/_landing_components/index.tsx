"use client";

import React from "react";
import { Header } from "./header";
import { HeroSection } from "./hero/HeroSection";
import { CompilerVsAiSection } from "./benefits/CompilerVsAiSection";
import { StudioViewsSection } from "./studio-views/StudioViewsSection";
import { CompilerShowcaseSection } from "./compiler/CompilerShowcaseSection";
import { VisualVsFileBasedSection } from "./visual-paradigm/VisualVsFileBasedSection";
import { FutureRoadmapSection } from "./future/FutureRoadmapSection";
import { PricingSection } from "./pricing/PricingSection";
import { FaqSection } from "./faq/FaqSection";
import { FinalCtaSection } from "./cta/FinalCtaSection";
import { Footer } from "./footer";

export const Landing: React.FC = () => {
  return (
    <div className="min-h-screen w-full bg-[#050505] text-white flex flex-col items-center overflow-x-hidden selection:bg-white/20 selection:text-white font-sans">
      <Header />
      <main className="w-full flex flex-col">
        <HeroSection />
        <CompilerVsAiSection />
        <StudioViewsSection />
        <CompilerShowcaseSection />
        <VisualVsFileBasedSection />
        <FutureRoadmapSection />
        <PricingSection />
        <FaqSection />
        <FinalCtaSection />
      </main>
      <Footer />
    </div>
  );
};

export default Landing;
