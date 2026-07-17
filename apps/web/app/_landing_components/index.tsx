import React from "react";
import { Header } from "./header";
import Intro from "./intro";
import Features from "./features";
import Pricing from "./pricing";
import { Footer } from "./footer";

export const Landing = () => {
  return (
    <div className="max-w-screen min-h-screen w-full bg-white text-black flex flex-col items-center overflow-x-hidden">
      <Header />
      <main className="w-full flex flex-col">
        <Intro />
        <Features />
      </main>
      <Footer />
    </div>
  );
};
