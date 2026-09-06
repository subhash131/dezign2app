import {
  SERVER_NODE_TYPES,
  WEB_PAGE_EVENTS,
  CATEGORIZED_LIBRARIES as RAW_CATEGORIZED_LIBRARIES,
  SECTION_PRESETS as RAW_SECTION_PRESETS,
  collectEndpoints,
  SectionPreset as CanvasSectionPreset,
  CategorizedLibrary as CanvasCategorizedLibrary,
} from "@workspace/canvas";
import {
  Sparkles,
  Table,
  Box,
  BarChart3,
  Package,
  LayoutGrid,
  FormInput,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";

export { SERVER_NODE_TYPES, collectEndpoints };
export const EVENT_OPTIONS = [...WEB_PAGE_EVENTS];

const ICON_MAP: Record<string, LucideIcon> = {
  "sparkles": Sparkles,
  "table": Table,
  "box": Box,
  "bar-chart-3": BarChart3,
  "package": Package,
  "layout-grid": LayoutGrid,
  "form-input": FormInput,
  "message-square": MessageSquare,
};

export interface CategorizedLibrary extends CanvasCategorizedLibrary {
  icon: LucideIcon;
}

export interface SectionPreset extends CanvasSectionPreset {
  icon: LucideIcon;
}

export const CATEGORIZED_LIBRARIES: CategorizedLibrary[] = RAW_CATEGORIZED_LIBRARIES.map((c) => ({
  ...c,
  icon: (c.iconName && ICON_MAP[c.iconName]) || Package,
}));

export const SECTION_PRESETS: SectionPreset[] = RAW_SECTION_PRESETS.map((p) => ({
  ...p,
  icon: (p.iconName && ICON_MAP[p.iconName]) || LayoutGrid,
}));
