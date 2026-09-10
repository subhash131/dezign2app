import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface SectionCollapseStore {
  /** Map of nodeId -> array of collapsed section IDs */
  collapsedSectionsByNode: Record<string, string[]>;
  isSectionCollapsed: (nodeId: string, sectionId: string) => boolean;
  setSectionCollapsed: (nodeId: string, sectionId: string, collapsed: boolean) => void;
  toggleSectionCollapsed: (nodeId: string, sectionId: string) => void;
  deleteSectionCollapseState: (nodeId: string, sectionId: string) => void;
  deleteNodeCollapseState: (nodeId: string | string[]) => void;
}

export const useSectionCollapseStore = create<SectionCollapseStore>()(
  persist(
    (set, get) => ({
      collapsedSectionsByNode: {},

      isSectionCollapsed: (nodeId: string, sectionId: string) => {
        const list = get().collapsedSectionsByNode[nodeId];
        return Array.isArray(list) ? list.includes(sectionId) : false;
      },

      setSectionCollapsed: (nodeId: string, sectionId: string, collapsed: boolean) => {
        set((state) => {
          const currentList = state.collapsedSectionsByNode[nodeId] || [];
          const exists = currentList.includes(sectionId);

          if (collapsed && !exists) {
            return {
              collapsedSectionsByNode: {
                ...state.collapsedSectionsByNode,
                [nodeId]: [...currentList, sectionId],
              },
            };
          }

          if (!collapsed && exists) {
            return {
              collapsedSectionsByNode: {
                ...state.collapsedSectionsByNode,
                [nodeId]: currentList.filter((id) => id !== sectionId),
              },
            };
          }

          return state;
        });
      },

      toggleSectionCollapsed: (nodeId: string, sectionId: string) => {
        const isCollapsed = get().isSectionCollapsed(nodeId, sectionId);
        get().setSectionCollapsed(nodeId, sectionId, !isCollapsed);
      },

      deleteSectionCollapseState: (nodeId: string, sectionId: string) => {
        set((state) => {
          const currentList = state.collapsedSectionsByNode[nodeId];
          if (!currentList || !currentList.includes(sectionId)) return state;
          return {
            collapsedSectionsByNode: {
              ...state.collapsedSectionsByNode,
              [nodeId]: currentList.filter((id) => id !== sectionId),
            },
          };
        });
      },

      deleteNodeCollapseState: (nodeIdOrIds: string | string[]) => {
        const idsToDelete = Array.isArray(nodeIdOrIds) ? nodeIdOrIds : [nodeIdOrIds];
        if (idsToDelete.length === 0) return;

        set((state) => {
          const next = { ...state.collapsedSectionsByNode };
          let changed = false;
          for (const id of idsToDelete) {
            if (id in next) {
              delete next[id];
              changed = true;
            }
          }
          return changed ? { collapsedSectionsByNode: next } : state;
        });
      },
    }),
    {
      name: "dezign2app_webpage_section_collapse_state_v1",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
