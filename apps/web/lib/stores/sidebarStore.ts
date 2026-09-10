import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

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
  configSidebarWidth: number;
  setConfigSidebarWidth: (width: number | ((prev: number) => number)) => void;

  // Terminal Drawer (Docked at bottom of Canvas / UI Editor)
  terminalOpen: boolean;
  terminalHeight: number;
  setTerminalOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  toggleTerminal: () => void;
  setTerminalHeight: (height: number | ((prev: number) => number)) => void;
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
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

      // Config Sidebar defaults
      configSidebarWidth: 540,
      setConfigSidebarWidth: (width) =>
        set((state) => {
          const val = typeof width === "function" ? width(state.configSidebarWidth) : width;
          return { configSidebarWidth: Math.max(320, Math.min(900, val)) };
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
          return { terminalHeight: Math.max(140, Math.min(800, val)) };
        }),
    }),
    {
      name: "dezign2app_sidebar_layout_state_v1",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
