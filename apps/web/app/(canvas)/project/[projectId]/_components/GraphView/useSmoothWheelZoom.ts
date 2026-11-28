import { useEffect, useRef, useCallback } from "react";
import { useReactFlow } from "@xyflow/react";

export interface UseSmoothWheelZoomOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  minZoom?: number;
  maxZoom?: number;
  enabled?: boolean;
  onMoveEnd?: (
    event: MouseEvent | TouchEvent | null,
    viewport: { x: number; y: number; zoom: number },
  ) => void;
}

/**
 * Checks whether an element or any of its scrollable parents
 * should consume wheel scroll events natively.
 */
function isInsideScrollable(
  target: EventTarget | null,
  container: HTMLElement,
): boolean {
  if (!(target instanceof Element)) return false;

  const selector = [
    ".nowheel",
    "[data-prevent-zoom]",
    "[role='dialog']",
    "[role='menu']",
    "[role='listbox']",
    "[data-inspector]",
    ".inspector-sidebar",
  ].join(",");

  if (target.closest(selector)) {
    return true;
  }

  // Check for scrollable containers (e.g. overflow-y: auto/scroll with scrollable content)
  let el: Element | null = target;
  while (el && el !== container && !el.classList.contains("react-flow__pane")) {
    if (el instanceof HTMLElement) {
      if (el.scrollHeight > el.clientHeight + 4) {
        const style = window.getComputedStyle(el);
        const overflowY = style.overflowY;
        if (overflowY === "auto" || overflowY === "scroll") {
          return true;
        }
      }
      if (el.scrollWidth > el.clientWidth + 4) {
        const style = window.getComputedStyle(el);
        const overflowX = style.overflowX;
        if (overflowX === "auto" || overflowX === "scroll") {
          return true;
        }
      }
    }
    el = el.parentElement;
  }

  return false;
}

/**
 * Hook providing smooth, inertia-damped wheel zoom with cursor anchoring for React Flow canvases.
 * Eliminates snappy, discrete scroll jumps and creates a fluid, Figma/Google Maps-like glide.
 */
export function useSmoothWheelZoom({
  containerRef,
  minZoom = 0.01,
  maxZoom = 3,
  enabled = true,
  onMoveEnd,
}: UseSmoothWheelZoomOptions) {
  const { getViewport, setViewport } = useReactFlow();

  const targetZoomRef = useRef<number>(1);
  const isAnimatingRef = useRef<boolean>(false);
  const rafIdRef = useRef<number | null>(null);
  const anchorRef = useRef<{
    mouseX: number;
    mouseY: number;
    graphX: number;
    graphY: number;
  } | null>(null);

  // Stop any active animation frame
  const stopAnimation = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    isAnimatingRef.current = false;
    const vp = getViewport();
    targetZoomRef.current = vp.zoom;
  }, [getViewport]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    const handleWheel = (event: WheelEvent) => {
      // Allow internal scrollable elements (e.g. code editors, menus) to scroll natively
      if (isInsideScrollable(event.target, container)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const rect = container.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;

      // Normalize delta across browsers and input devices
      let delta = event.deltaY;
      if (event.deltaMode === 1) {
        // DOM_DELTA_LINE (Firefox default for mouse wheel)
        delta *= 28;
      } else if (event.deltaMode === 2) {
        // DOM_DELTA_PAGE
        delta *= 400;
      }

      // Trackpad pinch gestures set ctrlKey = true with small continuous delta
      if (event.ctrlKey) {
        delta *= 3;
      }

      // Clamp delta to prevent erratic jumps on hypersensitive or free-spinning wheels
      delta = Math.max(-200, Math.min(200, delta));

      const currentVp = getViewport();

      // If starting a fresh zoom interaction, sync target with current zoom
      if (!isAnimatingRef.current) {
        targetZoomRef.current = currentVp.zoom;
      }

      // Continuous exponential scaling factor
      // A delta of -100 (zoom in) scales by ~1.14x; +100 (zoom out) scales by ~0.87x
      const zoomFactor = Math.pow(2, -delta * 0.0016);
      let newTarget = targetZoomRef.current * zoomFactor;
      newTarget = Math.max(minZoom, Math.min(maxZoom, newTarget));
      targetZoomRef.current = newTarget;

      // Pin the graph point directly under the mouse pointer
      const graphX = (mouseX - currentVp.x) / currentVp.zoom;
      const graphY = (mouseY - currentVp.y) / currentVp.zoom;
      anchorRef.current = { mouseX, mouseY, graphX, graphY };

      if (!isAnimatingRef.current) {
        isAnimatingRef.current = true;

        const animate = () => {
          const vp = getViewport();
          const currentZ = vp.zoom;
          const targetZ = targetZoomRef.current;
          const diff = targetZ - currentZ;

          // If close enough to target, snap to target and finish
          if (Math.abs(diff) < 0.0005) {
            if (anchorRef.current) {
              const { mouseX: mx, mouseY: my, graphX: gx, graphY: gy } = anchorRef.current;
              const finalX = mx - gx * targetZ;
              const finalY = my - gy * targetZ;
              setViewport({ x: finalX, y: finalY, zoom: targetZ });
              onMoveEnd?.(null, { x: finalX, y: finalY, zoom: targetZ });
            }
            isAnimatingRef.current = false;
            rafIdRef.current = null;
            return;
          }

          // Smooth lerp (linear interpolation) with exponential ease-out decay (~160ms glide)
          const ease = 0.2;
          const nextZ = currentZ + diff * ease;

          if (anchorRef.current) {
            const { mouseX: mx, mouseY: my, graphX: gx, graphY: gy } = anchorRef.current;
            const nextX = mx - gx * nextZ;
            const nextY = my - gy * nextZ;
            setViewport({ x: nextX, y: nextY, zoom: nextZ });
          }

          rafIdRef.current = requestAnimationFrame(animate);
        };

        rafIdRef.current = requestAnimationFrame(animate);
      }
    };

    // If user starts dragging or clicking canvas, pause zoom animation instantly
    const handlePointerDown = () => {
      stopAnimation();
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    container.addEventListener("pointerdown", handlePointerDown, { capture: true });

    return () => {
      container.removeEventListener("wheel", handleWheel);
      container.removeEventListener("pointerdown", handlePointerDown, { capture: true });
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      isAnimatingRef.current = false;
    };
  }, [containerRef, minZoom, maxZoom, enabled, getViewport, setViewport, onMoveEnd, stopAnimation]);

  return { stopAnimation };
}
