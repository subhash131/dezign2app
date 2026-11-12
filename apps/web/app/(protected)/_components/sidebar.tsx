"use client";
import React, { useState } from "react";
import {
  type LucideIcon,
  BookOpenText,
  Building2,
  ClipboardList,
  GitBranchPlus,
  Globe,
  Info,
  LayoutTemplate,
  LogOut,
  ShoppingCart,
  Sun,
  Moon,
  CreditCard,
  ChevronsUpDown,
  Loader2,
  KeyIcon,
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
  useSidebar,
} from "@workspace/ui/components/sidebar";
import { usePathname, useRouter } from "next/navigation";
import { Separator } from "@workspace/ui/components/separator";
import { useTheme } from "next-themes";
import { OrgSwitcher } from "@/components/auth/org-switcher";
import { signOut, useSession, useActiveOrganization } from "@/lib/auth-client";
import { logoutUser } from "@/app/(auth)/_components/actions";
import { getElectronAPI } from "@/lib/electron";
import { useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar";
import { Badge } from "@workspace/ui/components/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu";
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
  {
    title: "Published Projects",
    url: "/published",
    icon: Globe,
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
    title: "Billing",
    url: "/organization/billing",
    icon: CreditCard,
  },
  {
    title: "API Keys",
    url: "/api-keys",
    icon: KeyIcon,
  },
];

const getInitials = (name?: string | null, email?: string | null) => {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2 && parts[0] && parts[1]) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  if (email) {
    return email.slice(0, 2).toUpperCase();
  }
  return "U";
};

const ProtectedSidebar = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { isMobile } = useSidebar();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const { data: session } = useSession();
  const { data: activeOrg } = useActiveOrganization();

  const user = session?.user;
  const userEmail = user?.email ?? "";
  const userName = user?.name || (userEmail ? userEmail.split("@")[0] : "User");
  const initials = getInitials(user?.name, user?.email);

  const subscriptionStatus = useQuery(
    api.users.getSubscriptionStatus,
    userEmail
      ? {
          email: userEmail,
          organizationId: activeOrg?.id ?? null,
        }
      : "skip",
  );

  const isAdmin = subscriptionStatus?.isSystemAdmin;
  const isOrgSeat = subscriptionStatus?.isOrgSeat;
  const isPro = subscriptionStatus?.status === "active";

  const planLabel = isAdmin
    ? "Admin"
    : isOrgSeat
      ? "Team"
      : isPro
        ? "Pro"
        : "Free";

  const isActive = (url: string) => {
    if (url === "/") return pathname === "/";
    return pathname.startsWith(url);
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
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
          const api = getElectronAPI();
          if (api?.auth?.clearSession) {
            await api.auth.clearSession();
          }
        } catch {}

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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground cursor-pointer transition-colors hover:bg-sidebar-accent group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:justify-center"
                >
                  <Avatar className="size-8 rounded-lg shrink-0">
                    {user?.image ? (
                      <AvatarImage src={user.image} alt={userName} />
                    ) : null}
                    <AvatarFallback className="rounded-lg text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
                    <span className="truncate font-medium text-xs text-foreground">
                      {userName}
                    </span>
                    <span className="truncate text-[10px] text-muted-foreground">
                      {userEmail}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4 text-muted-foreground group-data-[collapsible=icon]:hidden" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-64 rounded-xl p-1.5 shadow-lg"
                side={isMobile ? "bottom" : "right"}
                align="end"
                sideOffset={8}
              >
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-2.5 p-2 bg-muted/40 rounded-lg border border-border/50">
                    <Avatar className="size-9 rounded-lg shrink-0">
                      {user?.image ? (
                        <AvatarImage src={user.image} alt={userName} />
                      ) : null}
                      <AvatarFallback className="rounded-lg text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 min-w-0 text-left leading-tight">
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate font-semibold text-xs text-foreground">
                          {userName}
                        </span>
                        <Badge
                          variant={isPro || isAdmin ? "default" : "secondary"}
                          className={cn(
                            "text-[9px] px-1.5 py-0 h-4 font-semibold uppercase tracking-wider shrink-0",
                            isAdmin && "bg-purple-600 text-white hover:bg-purple-600",
                            !isAdmin && isPro && "bg-amber-500 hover:bg-amber-500 text-white",
                            !isAdmin && !isPro && "text-muted-foreground",
                          )}
                        >
                          {planLabel}
                        </Badge>
                      </div>
                      <span className="truncate text-[10px] text-muted-foreground mt-0.5">
                        {userEmail}
                      </span>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem asChild className="cursor-pointer text-xs">
                    <Link href="/organization" className="flex items-center gap-2">
                      <Building2 className="size-4 text-muted-foreground" />
                      <span>Organization</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="cursor-pointer text-xs">
                    <Link href="/organization/billing" className="flex items-center gap-2">
                      <CreditCard className="size-4 text-muted-foreground" />
                      <span>Billing & Plans</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="cursor-pointer text-xs">
                    <Link href="/api-keys" className="flex items-center gap-2">
                      <KeyIcon className="size-4 text-muted-foreground" />
                      <span>API Keys</span>
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleSignOut}
                  disabled={isSigningOut}
                  className="cursor-pointer text-xs text-destructive focus:bg-destructive/10 focus:text-destructive flex items-center gap-2"
                >
                  {isSigningOut ? (
                    <Loader2 className="size-4 animate-spin text-destructive" />
                  ) : (
                    <LogOut className="size-4" />
                  )}
                  <span>{isSigningOut ? "Signing out..." : "Sign Out"}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail className="!cursor-col-resize" />
    </Sidebar>
  );
};

export default ProtectedSidebar;
