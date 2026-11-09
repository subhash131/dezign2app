import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export function getEffectiveConfigSidebarWidth(width?: number): number {
  if (typeof window !== "undefined") {
    const minW = Math.max(360, Math.round(window.innerWidth * 0.18));
    const maxW = Math.round(window.innerWidth * 0.70);
    if (!width || width < minW) {
      return Math.max(540, Math.min(840, Math.round(window.innerWidth * 0.28)));
    }
    return Math.max(minW, Math.min(maxW, width));
  }
  return width || 560;
}

export function getEffectiveLangGraphInspectorWidth(width?: number): number {
  if (typeof window !== "undefined") {
    const minW = Math.max(340, Math.round(window.innerWidth * 0.18));
    const maxW = Math.round(window.innerWidth * 0.70);
    if (!width || width < minW) {
      return Math.max(480, Math.min(840, Math.round(window.innerWidth * 0.28)));
    }
    return Math.max(minW, Math.min(maxW, width));
  }
  return width || 520;
}

export interface SidebarState {
  // Palette / Tool sidebar (shared across GraphView & UI Editor)
  paletteOpen: boolean;
  paletteWidth: number;
  setPaletteOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  togglePalette: () => void;
  setPaletteWidth: (width: number | ((prev: number) => number)) => void;

  // AI Assistant Panel (shared across GraphView & UI Editor)
  aiPanelOpen: boolean;
  aiPanelWidth: number;
  setAiPanelOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  toggleAiPanel: () => void;
  setAiPanelWidth: (width: number | ((prev: number) => number)) => void;

  // Aliases for page AI panel (synchronized with shared AI Assistant state)
  pageAiPanelOpen: boolean;
  pageAiPanelWidth: number;
  setPageAiPanelOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  togglePageAiPanel: () => void;
  setPageAiPanelWidth: (width: number | ((prev: number) => number)) => void;

  // Config Sidebar (Node property inspector)
  configSidebarOpen: boolean;
  configSidebarWidth: number;
  setConfigSidebarOpen: (open: boolean) => void;
  setConfigSidebarWidth: (width: number | ((prev: number) => number)) => void;

  // Terminal Drawer (Docked at bottom of Canvas / UI Editor)
  terminalOpen: boolean;
  terminalHeight: number;
  setTerminalOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  toggleTerminal: () => void;
  setTerminalHeight: (height: number | ((prev: number) => number)) => void;

  // LangGraph Inspector Sidebar state
  langGraphInspectorOpen: boolean;
  langGraphInspectorWidth: number;
  setLangGraphInspectorOpen: (open: boolean) => void;
  setLangGraphInspectorWidth: (width: number | ((prev: number) => number)) => void;

  // Project Folder Selection Modal
  projectFolderModalOpen: boolean;
  setProjectFolderModalOpen: (open: boolean) => void;
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set): SidebarState => ({
      // Palette sidebar defaults
      paletteOpen: true,
      paletteWidth: 220,
      setPaletteOpen: (open) =>
        set((state) => ({
          paletteOpen:
            typeof open === "function" ? open(state.paletteOpen) : open,
        })),
      togglePalette: () =>
        set((state) => ({ paletteOpen: !state.paletteOpen })),
      setPaletteWidth: (width) =>
        set((state) => {
          const val = typeof width === "function" ? width(state.paletteWidth) : width;
          return { paletteWidth: Math.max(170, Math.min(380, val)) };
        }),

      // AI Assistant Panel (unified across pages)
      aiPanelOpen: false,
      aiPanelWidth: 380,
      setAiPanelOpen: (open) =>
        set((state) => {
          const nextOpen = typeof open === "function" ? open(state.aiPanelOpen) : open;
          return { aiPanelOpen: nextOpen, pageAiPanelOpen: nextOpen };
        }),
      toggleAiPanel: () =>
        set((state) => {
          const nextOpen = !state.aiPanelOpen;
          return { aiPanelOpen: nextOpen, pageAiPanelOpen: nextOpen };
        }),
      setAiPanelWidth: (width) =>
        set((state) => {
          const val = typeof width === "function" ? width(state.aiPanelWidth) : width;
          const clamped = Math.max(280, Math.min(800, val));
          return { aiPanelWidth: clamped, pageAiPanelWidth: clamped };
        }),

      // Aliases synchronizing to the unified AI Assistant panel
      pageAiPanelOpen: false,
      pageAiPanelWidth: 380,
      setPageAiPanelOpen: (open) =>
        set((state) => {
          const nextOpen = typeof open === "function" ? open(state.aiPanelOpen) : open;
          return { aiPanelOpen: nextOpen, pageAiPanelOpen: nextOpen };
        }),
      togglePageAiPanel: () =>
        set((state) => {
          const nextOpen = !state.aiPanelOpen;
          return { aiPanelOpen: nextOpen, pageAiPanelOpen: nextOpen };
        }),
      setPageAiPanelWidth: (width) =>
        set((state) => {
          const val = typeof width === "function" ? width(state.aiPanelWidth) : width;
          const clamped = Math.max(280, Math.min(800, val));
          return { aiPanelWidth: clamped, pageAiPanelWidth: clamped };
        }),

      // Config Sidebar defaults (28-30% of screen width on modern displays)
      configSidebarOpen: false,
      configSidebarWidth:
        typeof window !== "undefined"
          ? Math.max(540, Math.min(840, Math.round(window.innerWidth * 0.28)))
          : 560,
      setConfigSidebarOpen: (open) => set({ configSidebarOpen: open }),
      setConfigSidebarWidth: (width) =>
        set((state) => {
          const val =
            typeof width === "function" ? width(state.configSidebarWidth) : width;
          const minW =
            typeof window !== "undefined"
              ? Math.max(360, Math.round(window.innerWidth * 0.18))
              : 360;
          const maxVal =
            typeof window !== "undefined"
              ? Math.round(window.innerWidth * 0.70)
              : 1400;
          return { configSidebarWidth: Math.max(minW, Math.min(maxVal, val)) };
        }),

      // Terminal defaults
      terminalOpen: false,
      terminalHeight: 320,
      setTerminalOpen: (open) =>
        set((state) => ({
          terminalOpen:
            typeof open === "function" ? open(state.terminalOpen) : open,
        })),
      toggleTerminal: () =>
        set((state) => ({ terminalOpen: !state.terminalOpen })),
      setTerminalHeight: (height) =>
        set((state) => {
          const val = typeof height === "function" ? height(state.terminalHeight) : height;
          const maxH =
            typeof window !== "undefined"
              ? Math.floor(window.innerHeight * 0.9)
              : 1200;
          return { terminalHeight: Math.max(140, Math.min(maxH, val)) };
        }),

      // Project Folder Selection Modal defaults
      projectFolderModalOpen: false,
      setProjectFolderModalOpen: (open) => set({ projectFolderModalOpen: open }),

      // LangGraph Inspector Sidebar defaults
      langGraphInspectorOpen: false,
      langGraphInspectorWidth:
        typeof window !== "undefined"
          ? Math.max(480, Math.min(840, Math.round(window.innerWidth * 0.28)))
          : 520,
      setLangGraphInspectorOpen: (open) => set({ langGraphInspectorOpen: open }),
      setLangGraphInspectorWidth: (width) =>
        set((state) => {
          const val =
            typeof width === "function" ? width(state.langGraphInspectorWidth) : width;
          const minW =
            typeof window !== "undefined"
              ? Math.max(340, Math.round(window.innerWidth * 0.18))
              : 340;
          const maxW =
            typeof window !== "undefined"
              ? Math.round(window.innerWidth * 0.70)
              : 1400;
          return { langGraphInspectorWidth: Math.min(Math.max(val, minW), maxW) };
        }),
    }),
    {
      name: "dezign2app_sidebar_layout_state_v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        paletteOpen: state.paletteOpen,
        paletteWidth: state.paletteWidth,
        aiPanelOpen: state.aiPanelOpen,
        aiPanelWidth: state.aiPanelWidth,
        configSidebarWidth: state.configSidebarWidth,
        terminalOpen: state.terminalOpen,
        terminalHeight: state.terminalHeight,
        langGraphInspectorWidth: state.langGraphInspectorWidth,
      }),
    },
  ),
);
