"use client";
import React from "react";
import {
  type LucideIcon,
  BookOpenText,
  Building2,
  ClipboardList,
  GitBranchPlus,
  Info,
  LayoutTemplate,
  LogOut,
  ShoppingCart,
  Sun,
  Moon,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@workspace/ui/components/sidebar";
import { usePathname, useRouter } from "next/navigation";
import { Separator } from "@workspace/ui/components/separator";
import { useTheme } from "next-themes";
import { OrgSwitcher } from "@/components/auth/org-switcher";
import { signOut } from "@/lib/auth-client";
import { logoutUser } from "@/app/(auth)/_components/actions";
import { KeyIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@workspace/ui/lib/utils";

type SidebarItem = {
  title: string;
  url: string;
  icon: LucideIcon;
};

const projectsNavItems: SidebarItem[] = [
  {
    title: "Projects",
    url: "/projects",
    icon: ClipboardList,
  },
];
const helpNavItems: SidebarItem[] = [
  {
    title: "Support",
    url: "/support",
    icon: Info,
  },
];
const configurationItems: SidebarItem[] = [
  {
    title: "Organization",
    url: "/organization",
    icon: Building2,
  },
  {
    title: "API Keys",
    url: "/api-keys",
    icon: KeyIcon,
  },
];

const ProtectedSidebar = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  const isActive = (url: string) => {
    if (url === "/") return pathname === "/";
    return pathname.startsWith(url);
  };

  const handleSignOut = async () => {
    try {
      // 1. Better Auth client sign out
      await signOut().catch(() => {});

      // 2. Clear all server-side session cookies via Server Action
      await logoutUser().catch(() => {});

      // 3. Clear via API route as extra safety
      await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    } catch (err) {
      console.error("[auth] Sign out error:", err);
    } finally {
      // 4. Clear all accessible document cookies across root path
      if (typeof document !== "undefined") {
        const cookiesToClear = [
          "better-auth.session_token",
          "__Secure-better-auth.session_token",
          "better-auth.session_data",
          "__Secure-better-auth.session_data",
          "better-auth.dont_remember",
          "better-auth.state",
          "better-auth.pkce_code_verifier",
          "convex_jwt",
          "is_electron",
        ];
        cookiesToClear.forEach((name) => {
          document.cookie = `${name}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
        });
      }

      // 5. Clear localStorage / sessionStorage auth items
      if (typeof window !== "undefined") {
        try {
          const keys = Object.keys(localStorage);
          keys.forEach((k) => {
            if (
              k.includes("better-auth") ||
              k.includes("convex") ||
              k.includes("auth")
            ) {
              localStorage.removeItem(k);
            }
          });
          sessionStorage.clear();
        } catch {}
      }

      // 6. Hard redirect to /sign-in?signed_out=true
      window.location.href = "/sign-in?signed_out=true";
    }
  };

  return (
    <Sidebar className="group" collapsible="icon">
      <SidebarHeader>
        <p className="font-semibold text-xs text-muted-foreground px-2 text-nowrap">d2a</p>
      </SidebarHeader>
      <Separator />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem key="org_switcher">
                <OrgSwitcher />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Main</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {projectsNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    tooltip={item.title}
                    size="sm"
                    className={cn(isActive(item.url) && "bg-accent")}
                  >
                    <Link href={item.url}>
                      <item.icon className="size-4" />
                      {item.title}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Configuration</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {configurationItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    tooltip={item.title}
                    size="sm"
                    className={cn(isActive(item.url) && "bg-accent")}
                  >
                    <Link href={item.url}>
                      <item.icon className="size-4" />
                      {item.title}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Help</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {helpNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    tooltip={item.title}
                    size="sm"
                    className={cn(isActive(item.url) && "bg-accent")}
                  >
                    <a href={item.url}>
                      <item.icon className="size-4" />
                      {item.title}
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Settings</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  tooltip={`${theme === "dark" ? "Dark" : "Light"} Mode`}
                  size="sm"
                  className="cursor-pointer"
                >
                  {theme === "dark" ? (
                    <Sun className="size-4" />
                  ) : (
                    <Moon className="size-4" />
                  )}
                  <span>{theme === "dark" ? "Dark" : "Light"} Mode</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <Separator />
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleSignOut}
              tooltip={"Signout"}
              size="sm"
              className="cursor-pointer"
            >
              <div className="flex items-center justify-center gap-2">
                <LogOut className="size-4" /> Sign Out
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail className="!cursor-col-resize" />
    </Sidebar>
  );
};

export default ProtectedSidebar;
