"use client";
import React from "react";
import {
  type LucideIcon,
  BookOpenText,
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
import { usePathname } from "next/navigation";
import { Separator } from "@workspace/ui/components/separator";
import { useTheme } from "next-themes";
import { OrganizationSwitcher, SignOutButton } from "@clerk/nextjs";
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
    title: "API Keys",
    url: "/api-keys",
    icon: KeyIcon,
  },
];

const ProtectedSidebar = () => {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();

  const isActive = (url: string) => {
    if (url === "/") return pathname === "/";
    return pathname.startsWith(url);
  };
  return (
    <Sidebar className="group" collapsible="icon">
      <SidebarHeader>
        <p>Ctx</p>
      </SidebarHeader>
      <Separator />
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem key="org_123">
                <OrganizationSwitcher />
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
              asChild
              tooltip={"Signout"}
              size="sm"
              className="cursor-pointer"
            >
              {
                <SignOutButton redirectUrl="/sign-in">
                  <div className="flex items-center justify-center gap-2">
                    <LogOut className="size-4" /> Sign Out
                  </div>
                </SignOutButton>
              }
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail className="!cursor-col-resize" />
    </Sidebar>
  );
};

export default ProtectedSidebar;
