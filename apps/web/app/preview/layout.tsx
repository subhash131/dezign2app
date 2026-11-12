import React from "react";
import { AuthenticatedProvider } from "@/providers";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import "@xyflow/react/dist/style.css";

export default function PreviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthenticatedProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem
        disableTransitionOnChange
      >
        <div className="flex flex-col h-screen w-screen overflow-hidden bg-background">
          <Toaster />
          {children}
        </div>
      </ThemeProvider>
    </AuthenticatedProvider>
  );
}

