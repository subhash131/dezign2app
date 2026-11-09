import { describe, it, expect, beforeEach } from "vitest";
import {
  useSidebarStore,
  getEffectiveConfigSidebarWidth,
  getEffectiveLangGraphInspectorWidth,
} from "../sidebarStore";

describe("sidebarStore - 70vw max width for config sidebar and inspector", () => {
  beforeEach(() => {
    // Reset window.innerWidth to 1920
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 1920,
    });
  });

  describe("getEffectiveConfigSidebarWidth", () => {
    it("allows widths up to 70vw (1344px at 1920px innerWidth)", () => {
      // 70% of 1920 is 1344
      const seventyVw = Math.round(1920 * 0.7);
      expect(getEffectiveConfigSidebarWidth(seventyVw)).toBe(seventyVw);
      expect(getEffectiveConfigSidebarWidth(1000)).toBe(1000);
      expect(getEffectiveConfigSidebarWidth(1200)).toBe(1200);
      expect(getEffectiveConfigSidebarWidth(1300)).toBe(1300);
    });

    it("clamps widths exceeding 70vw to 70vw", () => {
      const seventyVw = Math.round(1920 * 0.7);
      expect(getEffectiveConfigSidebarWidth(1500)).toBe(seventyVw);
      expect(getEffectiveConfigSidebarWidth(1900)).toBe(seventyVw);
    });

    it("clamps widths below minimum to default width", () => {
      // minW is max(360, round(1920 * 0.18)) = max(360, 346) = 360
      // default is Math.max(540, Math.min(840, Math.round(1920 * 0.28))) = 540
      expect(getEffectiveConfigSidebarWidth(200)).toBe(540);
    });
  });

  describe("getEffectiveLangGraphInspectorWidth", () => {
    it("allows widths up to 70vw (1344px at 1920px innerWidth)", () => {
      const seventyVw = Math.round(1920 * 0.7);
      expect(getEffectiveLangGraphInspectorWidth(seventyVw)).toBe(seventyVw);
      expect(getEffectiveLangGraphInspectorWidth(1000)).toBe(1000);
      expect(getEffectiveLangGraphInspectorWidth(1200)).toBe(1200);
    });

    it("clamps widths exceeding 70vw to 70vw", () => {
      const seventyVw = Math.round(1920 * 0.7);
      expect(getEffectiveLangGraphInspectorWidth(1600)).toBe(seventyVw);
    });
  });

  describe("useSidebarStore setConfigSidebarWidth & setLangGraphInspectorWidth", () => {
    it("sets configSidebarWidth up to 70vw", () => {
      const store = useSidebarStore.getState();
      const seventyVw = Math.round(1920 * 0.7);

      store.setConfigSidebarWidth(seventyVw);
      expect(useSidebarStore.getState().configSidebarWidth).toBe(seventyVw);

      store.setConfigSidebarWidth(seventyVw + 200);
      expect(useSidebarStore.getState().configSidebarWidth).toBe(seventyVw);
    });

    it("sets langGraphInspectorWidth up to 70vw", () => {
      const store = useSidebarStore.getState();
      const seventyVw = Math.round(1920 * 0.7);

      store.setLangGraphInspectorWidth(seventyVw);
      expect(useSidebarStore.getState().langGraphInspectorWidth).toBe(seventyVw);

      store.setLangGraphInspectorWidth(seventyVw + 300);
      expect(useSidebarStore.getState().langGraphInspectorWidth).toBe(seventyVw);
    });
  });
});
