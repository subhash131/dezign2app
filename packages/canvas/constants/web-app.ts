import type { WebAppZone, RedirectMap } from "../types/auth";
import type { SectionPreset, CategorizedLibrary, PresetTriggerOption } from "../types/web-app";
import type { BackendNode } from "../types/nodes";
import type { Endpoint } from "../schemas/endpoints";
import {
  WEB_PAGE_EVENTS,
  PAGE_LIFECYCLE_EVENTS,
  PAGE_EFFECT_EVENTS,
  UI_INTERACTION_EVENTS,
  type WebPageEventType,
} from "../graph-rules";

export {
  WEB_PAGE_EVENTS,
  PAGE_LIFECYCLE_EVENTS,
  PAGE_EFFECT_EVENTS,
  UI_INTERACTION_EVENTS,
  type WebPageEventType,
};
export const EVENT_OPTIONS = WEB_PAGE_EVENTS;

export const SERVER_NODE_TYPES = [
  "service",
  "gateway",
  "serverless",
  "langgraph",
  "worker",
  "external",
];

export const DEFAULT_REDIRECTS: RedirectMap = {
  "no-auth": "/login",
  "no-org": "/select-org",
  "wrong-role": "/unauthorized",
  "no-access": "/pricing",
  "wrong-plan": "/pricing",
  default: "/login",
};

export const DEFAULT_ZONES: WebAppZone[] = [
  {
    id: "zone-public",
    name: "Public Section",
    handleId: "public-in",
    accessType: "public",
    hasLayout: true,
    layoutDescription: "Public layout with top navigation bar, logo, and auth links",
    rule: {
      id: "rule-public",
      scope: "zone",
      conditions: { kind: "leaf", condition: { type: "auth", op: "signedOut" } },
      redirects: { ...DEFAULT_REDIRECTS },
    },
  },
  {
    id: "zone-private",
    name: "Private Section",
    handleId: "private-in",
    accessType: "protected",
    hasLayout: true,
    layoutDescription: "Protected app layout with sidebar navigation, user profile, and session check",
    rule: {
      id: "rule-private",
      scope: "zone",
      conditions: { kind: "leaf", condition: { type: "auth", op: "signedIn" } },
      redirects: { ...DEFAULT_REDIRECTS },
    },
  },
];

export const PRESET_TRIGGER_OPTIONS: PresetTriggerOption[] = [
  { value: "no-auth", label: "Unauthenticated (no-auth)", defaultRoute: "/login" },
  { value: "no-org", label: "No Organization (no-org)", defaultRoute: "/select-org" },
  { value: "wrong-role", label: "Insufficient Role (wrong-role)", defaultRoute: "/unauthorized" },
  { value: "no-access", label: "No Paid Access (no-access)", defaultRoute: "/pricing" },
  { value: "wrong-plan", label: "Plan Upgrade Needed (wrong-plan)", defaultRoute: "/pricing" },
  { value: "custom-denied", label: "Custom Logic Denied (custom-denied)", defaultRoute: "/login" },
  { value: "default", label: "Default Fallback Redirect", defaultRoute: "/login" },
];

export const CATEGORIZED_LIBRARIES: CategorizedLibrary[] = [
  {
    category: "UI & Icons",
    iconName: "sparkles",
    libs: ["lucide-react", "framer-motion", "@radix-ui/react-icons", "clsx", "tailwind-merge"],
  },
  {
    category: "Data & Tables",
    iconName: "table",
    libs: ["@tanstack/react-table", "@tanstack/react-query", "zod", "date-fns"],
  },
  {
    category: "Canvas & 3D",
    iconName: "box",
    libs: ["@xyflow/react", "tldraw", "three", "@react-three/fiber"],
  },
  {
    category: "Charts & Viz",
    iconName: "bar-chart-3",
    libs: ["recharts", "chart.js"],
  },
  {
    category: "State & Utilities",
    iconName: "package",
    libs: ["zustand", "lodash-es"],
  },
];

export const SECTION_PRESETS: SectionPreset[] = [
  {
    id: "hero",
    label: "Hero Banner",
    iconName: "layout-grid",
    desc: "Header with title, call-to-action buttons, and value propositions.",
    renderMode: "server",
    loadStrategy: "eager",
    libraries: ["lucide-react", "framer-motion"],
    defaultActions: [
      {
        name: "onGetStarted",
        event: "click",
        description: "Primary CTA click handler triggering onboarding or sign-up",
        requestBody: {
          id: "rb-hero-get-started",
          mode: "field_builder",
          fields: [
            { id: "f-hero-ref", name: "referralSource", type: "string", required: false, description: "Optional marketing campaign referral tag" },
          ],
        },
      },
      {
        name: "onExploreDocs",
        event: "click",
        description: "Secondary CTA navigating to documentation or product tour",
        requestBody: {
          id: "rb-hero-docs",
          mode: "field_builder",
          fields: [
            { id: "f-hero-section", name: "targetSection", type: "string", required: false, description: "Specific docs anchor section" },
          ],
        },
      },
    ],
    defaultDesc: "Main landing hero section with headline, sub-headline, and primary action buttons.",
    defaultUiPrompt: "Sleek hero section with gradient typography, frosted glass background card, and glowing CTA buttons.",
  },
  {
    id: "data-table",
    label: "Data Table / Grid",
    iconName: "table",
    desc: "Interactive data grid with column sorting, pagination, and row actions.",
    renderMode: "client",
    loadStrategy: "dynamic",
    libraries: ["@tanstack/react-table", "lucide-react", "zod"],
    defaultActions: [
      {
        name: "onRowSelect",
        event: "click",
        description: "Fires when user clicks or selects a row in the data grid",
        requestBody: {
          id: "rb-dt-row-select",
          mode: "field_builder",
          fields: [
            { id: "f-dt-row-id", name: "rowId", type: "string", required: true, description: "Selected row unique identifier" },
            { id: "f-dt-row-data", name: "rowData", type: "object", required: true, description: "Full table row record model" },
          ],
        },
      },
      {
        name: "onFilterChange",
        event: "change",
        description: "Fires on table search filtering, column sort, or pagination change",
        requestBody: {
          id: "rb-dt-filter-change",
          mode: "field_builder",
          fields: [
            { id: "f-dt-query", name: "searchQuery", type: "string", required: false, description: "Search query text filter" },
            { id: "f-dt-sort-by", name: "sortBy", type: "string", required: false, description: "Column field to sort" },
            { id: "f-dt-sort-order", name: "sortOrder", type: "string", required: false, description: "asc or desc" },
            { id: "f-dt-page", name: "page", type: "number", required: true, description: "Current page index" },
            { id: "f-dt-page-size", name: "pageSize", type: "number", required: true, description: "Page items size limit" },
          ],
        },
      },
      {
        name: "onExportData",
        event: "click",
        description: "Exports filtered table dataset to CSV or JSON",
        requestBody: {
          id: "rb-dt-export",
          mode: "field_builder",
          fields: [
            { id: "f-dt-format", name: "format", type: "string", required: true, description: "Export format (csv, json)" },
            { id: "f-dt-filtered", name: "filteredOnly", type: "boolean", required: false, description: "Only export active filtered rows" },
          ],
        },
      },
    ],
    defaultDesc: "High-performance tabular data viewer with search filtering and paginated query results.",
    defaultUiPrompt: "Modern dark themed data table with sticky headers, zebra rows, search bar, and badge status columns.",
  },
  {
    id: "form-submit",
    label: "Form & Submit",
    iconName: "form-input",
    desc: "Input form with validation, submit handling, and error states.",
    renderMode: "client",
    loadStrategy: "eager",
    libraries: ["zod", "lucide-react"],
    defaultActions: [
      {
        name: "onSubmitForm",
        event: "submit",
        description: "Submits validated client-side form fields to API endpoint",
        requestBody: {
          id: "rb-form-submit",
          mode: "field_builder",
          fields: [
            { id: "f-form-name", name: "name", type: "string", required: true, description: "User full name" },
            { id: "f-form-email", name: "email", type: "string", required: true, description: "User email address" },
            { id: "f-form-msg", name: "message", type: "string", required: true, description: "Form message or feedback" },
          ],
        },
      },
      {
        name: "onResetForm",
        event: "click",
        description: "Clears input fields and resets validation error messages",
        requestBody: {
          id: "rb-form-reset",
          mode: "field_builder",
          fields: [
            { id: "f-form-preserve-id", name: "preserveUserId", type: "boolean", required: false, description: "Keep user ID populated on reset" },
          ],
        },
      },
    ],
    defaultDesc: "Structured input form handling user submissions with client-side Zod validation.",
    defaultUiPrompt: "Clean card with floating labels, responsive multi-column layout, and loading spinner on submit button.",
  },
  {
    id: "realtime-feed",
    label: "Real-Time Feed / Chat",
    iconName: "message-square",
    desc: "Streaming live updates via SSE or WebSocket with message composer.",
    renderMode: "client",
    loadStrategy: "dynamic",
    libraries: ["lucide-react", "date-fns"],
    defaultActions: [
      {
        name: "onReceiveUpdate",
        event: "sse",
        description: "Subscribes to live server-sent events for incoming feed items",
      },
      {
        name: "onSendMessage",
        event: "submit",
        description: "Sends real-time chat or activity post into live room stream",
        requestBody: {
          id: "rb-rt-send",
          mode: "field_builder",
          fields: [
            { id: "f-rt-content", name: "content", type: "string", required: true, description: "Message body text" },
            { id: "f-rt-channel", name: "channelId", type: "string", required: true, description: "Target channel or feed room key" },
            { id: "f-rt-sender", name: "senderId", type: "string", required: false, description: "Sender user identifier" },
          ],
        },
      },
    ],
    defaultDesc: "Live streaming event feed displaying real-time updates and notifications.",
    defaultUiPrompt: "Dark chat message stream with auto-scrolling container, message bubbles, and bottom action bar.",
  },
  {
    id: "kpi-metrics",
    label: "KPI Metrics & Charts",
    iconName: "bar-chart-3",
    desc: "Metric statistic cards with interactive charts and timeframe toggles.",
    renderMode: "client",
    loadStrategy: "dynamic",
    libraries: ["recharts", "lucide-react"],
    defaultActions: [
      {
        name: "onTimeframeChange",
        event: "change",
        description: "Updates metric aggregation window (7d, 30d, 90d, 1y)",
        requestBody: {
          id: "rb-kpi-timeframe",
          mode: "field_builder",
          fields: [
            { id: "f-kpi-range", name: "timeframe", type: "string", required: true, description: "Selected timeframe (7d, 30d, 90d, 1y)" },
            { id: "f-kpi-metric", name: "metricId", type: "string", required: false, description: "Optional specific metric card ID" },
          ],
        },
      },
      {
        name: "onRefreshMetrics",
        event: "click",
        description: "Re-fetches latest KPI calculations bypassing cache",
        requestBody: {
          id: "rb-kpi-refresh",
          mode: "field_builder",
          fields: [
            { id: "f-kpi-force", name: "forceFresh", type: "boolean", required: false, description: "Bypass cached metric summaries" },
          ],
        },
      },
    ],
    defaultDesc: "Summary dashboard metrics showing KPI stat cards and visual trend charts.",
    defaultUiPrompt: "Responsive 4-column metric cards with sparklines, percentage change indicators, and interactive area chart.",
  },
  {
    id: "canvas-view",
    label: "Interactive Canvas",
    iconName: "box",
    desc: "Diagram or canvas workspace using xyflow / tldraw (No-SSR).",
    renderMode: "client",
    loadStrategy: "dynamic-no-ssr",
    libraries: ["@xyflow/react", "lucide-react"],
    defaultActions: [
      {
        name: "onSelectElement",
        event: "click",
        description: "Selects a node or edge element on the visual canvas graph",
        requestBody: {
          id: "rb-canvas-select",
          mode: "field_builder",
          fields: [
            { id: "f-cv-elem-id", name: "elementId", type: "string", required: true, description: "Selected canvas item ID" },
            { id: "f-cv-elem-type", name: "elementType", type: "string", required: true, description: "Node or edge type" },
          ],
        },
      },
      {
        name: "onSaveCanvas",
        event: "click",
        description: "Serializes canvas node graph snapshot and coordinates",
        requestBody: {
          id: "rb-canvas-save",
          mode: "field_builder",
          fields: [
            { id: "f-cv-snapshot", name: "canvasData", type: "object", required: true, description: "Graph node & edge snapshot payload" },
          ],
        },
      },
    ],
    defaultDesc: "Full-screen interactive visual canvas workspace for node graph manipulation.",
    defaultUiPrompt: "Infinite grid canvas with custom node templates, floating toolbar, and mini-map overlay.",
  },
];

/** Helper to collect all endpoints from a node */
export function collectEndpoints(
  node: BackendNode,
  storeEndpoints: (Endpoint & { nodeId: string })[],
): Endpoint[] {
  const results: Endpoint[] = [];
  const persisted = storeEndpoints.filter((ep) => ep.nodeId === node.id);
  results.push(...persisted);

  if (node.data?.endpoints) {
    for (const ep of node.data.endpoints) {
      if (!results.find((r) => r.id === ep.id)) results.push(ep);
    }
  }

  if (node.data?.routeGroups) {
    for (const group of node.data.routeGroups) {
      for (const ep of group.endpoints || []) {
        if (!results.find((r) => r.id === ep.id)) results.push(ep);
      }
    }
  }

  return results;
}
