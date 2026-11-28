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

const GESTURE_LOCK_MS = 200;
const PAN_MOVE_END_DELAY_MS = 150;

interface WheelGestureState {
  mode: "pan" | "zoom";
  lastTimestamp: number;
}

type WheelEventWithLegacy = WheelEvent & {
  wheelDeltaX?: number;
  wheelDeltaY?: number;
};

/**
 * Normalizes a wheel delta value from line/page units into CSS pixels.
 */
function normalizeWheelDelta(value: number, deltaMode: number): number {
  if (deltaMode === 1) return value * 28;
  if (deltaMode === 2) return value * 400;
  return value;
}

/**
 * Detects discrete notched mouse-wheel events (as opposed to continuous touchpad 2-finger drags).
 */
function isDiscreteMouseWheel(event: WheelEvent): boolean {
  if (event.deltaMode !== 0) {
    return event.deltaX === 0;
  }

  if (event.deltaX !== 0) {
    return false;
  }

  const legacy = event as WheelEventWithLegacy;
  if (typeof legacy.wheelDeltaY === "number" && legacy.wheelDeltaY !== 0) {
    const absWheelY = Math.abs(legacy.wheelDeltaY);
    const absWheelX = Math.abs(legacy.wheelDeltaX ?? 0);
    return absWheelX === 0 && absWheelY % 120 === 0;
  }

  const absY = Math.abs(event.deltaY);
  return absY >= 40 && (absY % 100 === 0 || absY % 120 === 0);
}

/**
 * Classifies a wheel event as a 2-finger touchpad pan or a zoom gesture,
 * locking the active gesture for a short window so vertical touchpad flicks stay in pan mode.
 */
function classifyWheelMode(
  event: WheelEvent,
  gestureRef: { current: WheelGestureState | null },
): "pan" | "zoom" {
  const now = performance.now();

  if (event.ctrlKey || event.metaKey) {
    gestureRef.current = { mode: "zoom", lastTimestamp: now };
    return "zoom";
  }

  if (event.deltaX !== 0) {
    gestureRef.current = { mode: "pan", lastTimestamp: now };
    return "pan";
  }

  const active = gestureRef.current;
  if (active && now - active.lastTimestamp < GESTURE_LOCK_MS) {
    active.lastTimestamp = now;
    return active.mode;
  }

  const mode = isDiscreteMouseWheel(event) ? "zoom" : "pan";
  gestureRef.current = { mode, lastTimestamp: now };
  return mode;
}

/**
 * Hook providing smooth, inertia-damped wheel zoom (mouse wheel & touchpad pinch)
 * and 1:1 rAF-batched 2-finger touchpad panning for React Flow canvases.
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

  const gestureRef = useRef<WheelGestureState | null>(null);
  const pendingPanXRef = useRef<number>(0);
  const pendingPanYRef = useRef<number>(0);
  const panRafIdRef = useRef<number | null>(null);
  const panMoveEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stop any active zoom animation frame
  const stopAnimation = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    isAnimatingRef.current = false;
    const vp = getViewport();
    targetZoomRef.current = vp.zoom;
  }, [getViewport]);

  // Cancel any pending wheel-pan frame or move-end notification
  const stopPan = useCallback(() => {
    if (panRafIdRef.current !== null) {
      cancelAnimationFrame(panRafIdRef.current);
      panRafIdRef.current = null;
    }
    if (panMoveEndTimerRef.current !== null) {
      clearTimeout(panMoveEndTimerRef.current);
      panMoveEndTimerRef.current = null;
    }
    pendingPanXRef.current = 0;
    pendingPanYRef.current = 0;
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    const handleWheel = (event: WheelEvent) => {
      // Allow internal scrollable elements (e.g. code editors, menus) to scroll natively
      if (isInsideScrollable(event.target, container)) {
        return;
      }

      if (event.deltaX === 0 && event.deltaY === 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const mode = classifyWheelMode(event, gestureRef);

      if (mode === "pan") {
        stopAnimation();

        const dx = normalizeWheelDelta(event.deltaX, event.deltaMode);
        const dy = normalizeWheelDelta(event.deltaY, event.deltaMode);
        pendingPanXRef.current += dx;
        pendingPanYRef.current += dy;

        if (panRafIdRef.current === null) {
          panRafIdRef.current = requestAnimationFrame(() => {
            panRafIdRef.current = null;
            const moveX = pendingPanXRef.current;
            const moveY = pendingPanYRef.current;
            pendingPanXRef.current = 0;
            pendingPanYRef.current = 0;

            if (moveX === 0 && moveY === 0) return;

            const vp = getViewport();
            setViewport({ x: vp.x - moveX, y: vp.y - moveY, zoom: vp.zoom });
          });
        }

        if (panMoveEndTimerRef.current !== null) {
          clearTimeout(panMoveEndTimerRef.current);
        }
        panMoveEndTimerRef.current = setTimeout(() => {
          panMoveEndTimerRef.current = null;
          onMoveEnd?.(null, getViewport());
        }, PAN_MOVE_END_DELAY_MS);
        return;
      }

      stopPan();

      const rect = container.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;

      // Normalize delta across browsers and input devices
      let delta = normalizeWheelDelta(event.deltaY, event.deltaMode);

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

    // If user starts dragging or clicking canvas, pause wheel zoom/pan animations instantly
    const handlePointerDown = () => {
      stopAnimation();
      stopPan();
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
      stopPan();
      gestureRef.current = null;
    };
  }, [
    containerRef,
    minZoom,
    maxZoom,
    enabled,
    getViewport,
    setViewport,
    onMoveEnd,
    stopAnimation,
    stopPan,
  ]);

  return { stopAnimation };
}
