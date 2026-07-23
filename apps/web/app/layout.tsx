import { Geist, Geist_Mono, Ubuntu } from "next/font/google";

import "@workspace/ui/globals.css";
import "@xyflow/react/dist/style.css";
import { Providers } from "@/providers";
import { Metadata } from "next";

import { PaywallModal } from "@/components/paywall-modal";

import './global.css'

const ubuntu = Ubuntu({ variable: "--font-sans", weight: ["300", "400"] });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dezign 2 App",
  description: "Project by subhash",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${ubuntu.variable} scroll-smooth`} suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          <PaywallModal>
            {children}
          </PaywallModal>
        </Providers>
      </body>
    </html>
  );
}
