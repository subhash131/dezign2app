import { useEffect, useRef, useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import type { Viewport } from "@xyflow/react";

export interface UseSmoothPanOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  enabled?: boolean;
  onMoveEnd?: (
    event: MouseEvent | TouchEvent | null,
    viewport: Viewport,
  ) => void;
}

/** Minimum pointer movement (px) before we commit to a drag vs a click */
const DRAG_THRESHOLD = 4;
/** Per-frame velocity multiplier for momentum glide (0.92 ≈ ~500 ms glide) */
const FRICTION = 0.92;
/** px/frame below which momentum stops */
const MIN_VEL = 0.3;
/** EMA weight for velocity sampling — higher = more responsive, lower = smoother */
const EMA_ALPHA = 0.4;

interface DragState {
  pointerId: number;
  /** Pointer coords at drag start */
  startPX: number;
  startPY: number;
  /** Viewport translation at drag start */
  startVpX: number;
  startVpY: number;
  /** True once DRAG_THRESHOLD crossed — distinguishes clicks from drags */
  hasMoved: boolean;
  /** Last pointer coords + time for velocity sampling */
  lastX: number;
  lastY: number;
  lastT: number;
  /** Current velocity estimate (px / ms) */
  velX: number;
  velY: number;
  rafId: number | null;
  phase: "drag" | "momentum";
}

/**
 * Smooth, Figma-style canvas panning for React Flow.
 *
 * Architecture mirrors useSmoothWheelZoom so panning feels identical to zoom:
 *
 *  • Drag phase  — pointer delta is applied via a rAF loop (one setViewport
 *    per frame, not one per pointermove); this batches rapid events and keeps
 *    the frame budget tight.
 *
 *  • Momentum phase — after pointer release, velocity decays exponentially
 *    (FRICTION per frame) giving a natural glide-to-stop (~500 ms).
 *
 * Requires <ReactFlow panOnDrag={false}> so the library's own pan handler
 * doesn't race with ours. Node dragging (nodesDraggable) is unaffected.
 *
 * Uses capture-phase listeners so React Flow's internal bubble-phase handlers
 * cannot stop propagation and block our velocity tracking.
 */
export function useSmoothPan({
  containerRef,
  enabled = true,
  onMoveEnd,
}: UseSmoothPanOptions): void {
  const { getViewport, setViewport } = useReactFlow();
  const stateRef = useRef<DragState | null>(null);

  const cancelAnim = useCallback(() => {
    const s = stateRef.current;
    if (s?.rafId != null) {
      cancelAnimationFrame(s.rafId);
      s.rafId = null;
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    // ── pointerdown ──────────────────────────────────────────────────────────
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target;
      // Only activate when clicking directly on the empty canvas pane
      if (!(target instanceof HTMLElement)) return;
      if (!target.classList.contains("react-flow__pane")) return;

      cancelAnim();

      const vp = getViewport();
      const state: DragState = {
        pointerId: e.pointerId,
        startPX: e.clientX,
        startPY: e.clientY,
        startVpX: vp.x,
        startVpY: vp.y,
        hasMoved: false,
        lastX: e.clientX,
        lastY: e.clientY,
        lastT: performance.now(),
        velX: 0,
        velY: 0,
        rafId: null,
        phase: "drag",
      };
      stateRef.current = state;

      // rAF drag loop: reads accumulated pointer position once per frame and
      // writes a single setViewport call — identical cadence to zoom's loop.
      const dragFrame = () => {
        const s = stateRef.current;
        if (!s || s.phase !== "drag") return;

        if (s.hasMoved) {
          const currentVp = getViewport();
          const newX = s.startVpX + (s.lastX - s.startPX);
          const newY = s.startVpY + (s.lastY - s.startPY);
          // Only write if there's a meaningful change to avoid spurious updates
          if (
            Math.abs(newX - currentVp.x) > 0.01 ||
            Math.abs(newY - currentVp.y) > 0.01
          ) {
            setViewport({ x: newX, y: newY, zoom: currentVp.zoom });
          }
        }

        s.rafId = requestAnimationFrame(dragFrame);
      };

      state.rafId = requestAnimationFrame(dragFrame);
    };

    // ── pointermove ──────────────────────────────────────────────────────────
    const onPointerMove = (e: PointerEvent) => {
      const s = stateRef.current;
      if (!s || s.phase !== "drag" || e.pointerId !== s.pointerId) return;

      // Commit to drag once we've crossed the threshold
      if (!s.hasMoved) {
        const dx = e.clientX - s.startPX;
        const dy = e.clientY - s.startPY;
        if (dx * dx + dy * dy > DRAG_THRESHOLD * DRAG_THRESHOLD) {
          s.hasMoved = true;
        }
      }

      // Track velocity via EMA — ignores long gaps (tab switch etc.)
      const now = performance.now();
      const dt = now - s.lastT;
      if (dt > 0 && dt < 80) {
        const ivx = (e.clientX - s.lastX) / dt;
        const ivy = (e.clientY - s.lastY) / dt;
        s.velX = s.velX * (1 - EMA_ALPHA) + ivx * EMA_ALPHA;
        s.velY = s.velY * (1 - EMA_ALPHA) + ivy * EMA_ALPHA;
      }
      s.lastX = e.clientX;
      s.lastY = e.clientY;
      s.lastT = now;
    };

    // ── pointerup ────────────────────────────────────────────────────────────
    const onPointerUp = (e: PointerEvent) => {
      const s = stateRef.current;
      if (!s || s.phase !== "drag" || e.pointerId !== s.pointerId) return;

      cancelAnim();

      if (!s.hasMoved) {
        // It was a click, not a drag — do nothing (let React Flow handle click)
        stateRef.current = null;
        return;
      }

      s.phase = "momentum";

      // Convert px/ms velocity → px/frame at 60 fps
      let vx = s.velX * 16.67;
      let vy = s.velY * 16.67;

      if (Math.abs(vx) < MIN_VEL && Math.abs(vy) < MIN_VEL) {
        const vp = getViewport();
        onMoveEnd?.(null, vp);
        stateRef.current = null;
        return;
      }

      // Momentum rAF loop — mirrors zoom's ease-out approach
      const momentumFrame = () => {
        const st = stateRef.current;
        if (!st || st.phase !== "momentum") return;

        vx *= FRICTION;
        vy *= FRICTION;

        if (Math.abs(vx) < MIN_VEL && Math.abs(vy) < MIN_VEL) {
          const vp = getViewport();
          onMoveEnd?.(null, vp);
          stateRef.current = null;
          return;
        }

        const vp = getViewport();
        setViewport({ x: vp.x + vx, y: vp.y + vy, zoom: vp.zoom });
        st.rafId = requestAnimationFrame(momentumFrame);
      };

      s.rafId = requestAnimationFrame(momentumFrame);
    };

    // ── pointercancel ────────────────────────────────────────────────────────
    const onPointerCancel = (e: PointerEvent) => {
      const s = stateRef.current;
      if (!s || e.pointerId !== s.pointerId) return;
      cancelAnim();
      stateRef.current = null;
    };

    // Capture phase for pointerdown: fires before React Flow's React (bubble)
    // handlers so we always see the event first.
    container.addEventListener("pointerdown", onPointerDown, { capture: true });

    // Capture phase on window for move/up/cancel: reliably tracks the pointer
    // even if a child element's bubble-phase handler calls stopPropagation(),
    // and continues tracking after the pointer leaves the container.
    window.addEventListener("pointermove", onPointerMove, { capture: true });
    window.addEventListener("pointerup", onPointerUp, { capture: true });
    window.addEventListener("pointercancel", onPointerCancel, {
      capture: true,
    });

    return () => {
      container.removeEventListener("pointerdown", onPointerDown, {
        capture: true,
      } as EventListenerOptions);
      window.removeEventListener("pointermove", onPointerMove, {
        capture: true,
      });
      window.removeEventListener("pointerup", onPointerUp, { capture: true });
      window.removeEventListener("pointercancel", onPointerCancel, {
        capture: true,
      });
      cancelAnim();
      stateRef.current = null;
    };
  }, [containerRef, enabled, getViewport, setViewport, onMoveEnd, cancelAnim]);
}
