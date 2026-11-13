import React from "react";
import {
  Globe,
  HardDrive,
  Sliders,
  Compass,
  Terminal,
  GitBranch,
  Bell,
  RotateCcw,
  SlidersHorizontal,
  Shuffle,
  ShieldCheck,
} from "lucide-react";
import type { FrontendActionStepType } from "./types";

export interface FrontendStepTypeMeta {
  label: string;
  icon: React.ReactNode;
  color: string;
  description: string;
}

export const FRONTEND_STEP_TYPE_META: Record<
  FrontendActionStepType,
  FrontendStepTypeMeta
> = {
  api_call: {
    label: "Request",
    icon: React.createElement(Globe, { size: 12 }),
    color: "text-blue-500 bg-blue-500/10 border-blue-500/30",
    description: "Trigger an HTTP API request to a backend service",
  },
  auth: {
    label: "Auth",
    icon: React.createElement(ShieldCheck, { size: 12 }),
    color: "text-indigo-500 bg-indigo-500/10 border-indigo-500/30",
    description: "Trigger a Better Auth action (sign out, social login, credentials, organization)",
  },
  storage_put: {
    label: "Storage",
    icon: React.createElement(HardDrive, { size: 12 }),
    color: "text-amber-500 bg-amber-500/10 border-amber-500/30",
    description: "Upload a file binary to a storage bucket via presigned URL",
  },
  state_mutation: {
    label: "Mutate State",
    icon: React.createElement(Sliders, { size: 12 }),
    color: "text-purple-500 bg-purple-500/10 border-purple-500/30",
    description: "Update client component state or global state store",
  },
  navigation: {
    label: "Navigate",
    icon: React.createElement(Compass, { size: 12 }),
    color: "text-cyan-500 bg-cyan-500/10 border-cyan-500/30",
    description: "Route to another page or external URL",
  },
  update_query_params: {
    label: "Query Params",
    icon: React.createElement(SlidersHorizontal, { size: 12 }),
    color: "text-teal-500 bg-teal-500/10 border-teal-500/30",
    description: "Update, toggle, or clear URL query parameters in-place",
  },
  transform: {
    label: "Transformer",
    icon: React.createElement(Shuffle, { size: 12 }),
    color: "text-purple-500 bg-purple-500/10 border-purple-500/30",
    description: "Transform data using a Transformer node function",
  },
  custom_code: {
    label: "Custom Code",
    icon: React.createElement(Terminal, { size: 12 }),
    color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/30",
    description: "Execute client-side JavaScript / TypeScript logic",
  },
  condition: {
    label: "If / Else",
    icon: React.createElement(GitBranch, { size: 12 }),
    color: "text-orange-500 bg-orange-500/10 border-orange-500/30",
    description: "Conditional guard for branching client execution",
  },
  notification: {
    label: "Toast / Alert",
    icon: React.createElement(Bell, { size: 12 }),
    color: "text-pink-500 bg-pink-500/10 border-pink-500/30",
    description: "Display a toast notification, banner, or alert",
  },
  reset_form: {
    label: "Reset Form",
    icon: React.createElement(RotateCcw, { size: 12 }),
    color: "text-slate-400 bg-slate-500/10 border-slate-500/30",
    description: "Clear form fields and reset validation status",
  },
  browser_storage: {
    label: "Browser Storage",
    icon: React.createElement(HardDrive, { size: 12 }),
    color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/30",
    description: "Get, set, or remove keys in localStorage or sessionStorage",
  },
};

export const FRONTEND_ADDABLE_STEP_TYPES: readonly FrontendActionStepType[] = [
  "api_call",
  "auth",
  "storage_put",
  "state_mutation",
  "browser_storage",
  "navigation",
  "update_query_params",
  "transform",
  "condition",
  "notification",
  "reset_form",
];
