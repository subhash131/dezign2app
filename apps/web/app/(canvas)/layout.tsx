import React from "react";
import { AuthenticatedProvider } from "@/providers";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import UpstashRealtimeProvider from "@/providers/upstash-realtime-provider";

const ProjectLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <UpstashRealtimeProvider>
      <AuthenticatedProvider>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          {/* Note: NO SidebarProvider or ProtectedSidebar here! */}
          <div className="flex flex-col h-screen w-screen overflow-hidden bg-background">
            <Toaster />
            {children}
          </div>
        </ThemeProvider>
      </AuthenticatedProvider>
    </UpstashRealtimeProvider>
  );
};

export default ProjectLayout;
