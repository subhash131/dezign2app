"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useReducedMotion } from "framer-motion";
import type { CanvasMode, TrafficIntensity, CanvasNode, InfraCircle } from "./types";
import {
  CANVAS_WIDTH_ARCH,
  CANVAS_HEIGHT_ARCH,
  CANVAS_WIDTH_INFRA,
  CANVAS_HEIGHT_INFRA,
} from "./types";
import {
  NODES,
  ARCH_CONNECTIONS,
  ARCH_SSE_RETURN_CONNECTION,
  LOAD_BALANCER_CIRCLES,
  DB_REPLICA_CIRCLES,
  DB_REPLICATION_CONNECTIONS,
  INFRA_CONNECTIONS,
  INFRA_SSE_RETURN_CONNECTION,
} from "./canvasData";
import { TICKETS, type TicketDef, type AgentStep } from "./aiWorkerData";
import { SECURITY_VECTORS, type SecurityVectorDef, type SecurityStep } from "./ethicalHackerData";

import { HeroCanvasHeader } from "./components/HeroCanvasHeader";
import { HeroCanvasTicketPipeline } from "./components/HeroCanvasTicketPipeline";
import { HeroCanvasSecurityPipeline } from "./components/HeroCanvasSecurityPipeline";
import { HeroCanvasConnections } from "./components/HeroCanvasConnections";
import { HeroCanvasLoadBalancers } from "./components/HeroCanvasLoadBalancers";
import { HeroCanvasDbReplicas } from "./components/HeroCanvasDbReplicas";
import { HeroCanvasInfraFlyingCard } from "./components/HeroCanvasInfraFlyingCard";
import { HeroCanvasNodes } from "./components/HeroCanvasNodes";
import { HeroCanvasAiGeneratedNode } from "./components/HeroCanvasAiGeneratedNode";
import { HeroCanvasAiDrone } from "./components/HeroCanvasAiDrone";
import { HeroCanvasSecurityDrone } from "./components/HeroCanvasSecurityDrone";
import { HeroCanvasTicketCard } from "./components/HeroCanvasTicketCard";
import { HeroCanvasSecurityCard } from "./components/HeroCanvasSecurityCard";
import { HeroCanvasConsole } from "./components/HeroCanvasConsole";
import { HeroCanvasSecurityConsole } from "./components/HeroCanvasSecurityConsole";
import { HeroCanvasControls } from "./components/HeroCanvasControls";
import { HeroCanvasFooter } from "./components/HeroCanvasFooter";
import VideoPlayer from "../intro/video-player";

export const HeroCanvasPreview: React.FC = () => {
  // Feature mode switcher: "architecture" vs "infrastructure" vs "ai-worker" vs "ethical-hacker"
  const [activeMode, setActiveMode] = useState<CanvasMode>("architecture");
  const [trafficIntensity, setTrafficIntensity] = useState<TrafficIntensity>("normal");
  const [ticker, setTicker] = useState<number>(0);

  // AI Worker state
  const [selectedTicketIndex, setSelectedTicketIndex] = useState<number>(0);
  const [workerStep, setWorkerStep] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isConsoleMinimized, setIsConsoleMinimized] = useState<boolean>(true);
  const [isTicketCardMinimized, setIsTicketCardMinimized] = useState<boolean>(true);
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 2>(1);
  const [isConsoleOpen, setIsConsoleOpen] = useState<boolean>(false);
  const [activeConsoleTab, setActiveConsoleTab] = useState<"terminal" | "diff" | "bench">("diff");

  // Ethical Hacker state
  const [selectedVectorIndex, setSelectedVectorIndex] = useState<number>(0);
  const [securityStep, setSecurityStep] = useState<number>(0);
  const [isSecurityCardMinimized, setIsSecurityCardMinimized] = useState<boolean>(true);
  const [isSecurityConsoleMinimized, setIsSecurityConsoleMinimized] = useState<boolean>(true);
  const [securityConsoleTab, setSecurityConsoleTab] = useState<"http" | "diff" | "cvss">("diff");
  const [isSecurityConsoleOpen, setIsSecurityConsoleOpen] = useState<boolean>(false);

  const activeTicket: TicketDef = (TICKETS[selectedTicketIndex] ?? TICKETS[0]) as TicketDef;
  const currentStep: AgentStep = (activeTicket.steps[workerStep] ?? activeTicket.steps[0]) as AgentStep;

  const activeVector: SecurityVectorDef = (SECURITY_VECTORS[selectedVectorIndex] ?? SECURITY_VECTORS[0]) as SecurityVectorDef;
  const activeSecurityStep: SecurityStep = (activeVector.steps[securityStep] ?? activeVector.steps[0]) as SecurityStep;

  // Auto-advance Ethical Hacker steps when active and playing
  useEffect(() => {
    if (activeMode !== "ethical-hacker" || !isPlaying) return;

    // Longer pause on step 4 (Mitigated / Exploit Blocked) before looping
    const delay = securityStep === 4 ? 5200 / playbackSpeed : 3400 / playbackSpeed;

    const timer = setTimeout(() => {
      setSecurityStep((prev) => {
        if (prev >= 4) {
          return 0;
        }
        return prev + 1;
      });
    }, delay);

    return () => clearTimeout(timer);
  }, [activeMode, isPlaying, securityStep, playbackSpeed]);

  // Auto-advance AI worker steps when active and playing
  useEffect(() => {
    if (activeMode !== "ai-worker" || !isPlaying) return;

    // Longer pause on step 5 (PR merged / solved) before looping to next step or next ticket
    const delay = workerStep === 5 ? 5000 / playbackSpeed : 3400 / playbackSpeed;

    const timer = setTimeout(() => {
      setWorkerStep((prev) => {
        if (prev >= 5) {
          return 0;
        }
        return prev + 1;
      });
    }, delay);

    return () => clearTimeout(timer);
  }, [activeMode, isPlaying, workerStep, playbackSpeed]);

  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  // Hover and selection states for infrastructure nodes (LBs and replicas)
  const [hoveredInfraId, setHoveredInfraId] = useState<string | null>(null);
  const [selectedInfraId, setSelectedInfraId] = useState<string | null>(null);

  const activeInfraId = hoveredInfraId || selectedInfraId;
  const activeInfraNode = useMemo(() => {
    if (!activeInfraId) return null;
    return (
      LOAD_BALANCER_CIRCLES.find((lb) => lb.id === activeInfraId) ||
      DB_REPLICA_CIRCLES.find((rep) => rep.id === activeInfraId) ||
      null
    );
  }, [activeInfraId]);

  const [zoom, setZoom] = useState<number>(0.55);
  const reduceMotion = useReducedMotion();

  // Scroll and Drag-to-Pan state
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartY, setDragStartY] = useState(0);
  const [scrollStartX, setScrollStartX] = useState(0);
  const [scrollStartY, setScrollStartY] = useState(0);

  // Live real-time ticker for dynamic incoming requests fluctuations
  useEffect(() => {
    const interval = setInterval(() => {
      setTicker((prev) => (prev + 1) % 100000);
    }, 1200);
    return () => clearInterval(interval);
  }, []);

  const isInfra = activeMode === "infrastructure";

  // Compute formatted live per-instance incoming requests text for a node
  const getIncomingBadgeText = useCallback(
    (node: CanvasNode): string | null => {
      if (!node.infraIncoming) return null;
      const multiplier = trafficIntensity === "burst" ? 2.75 : 1;
      const seed = Math.sin(ticker * 1.7 + node.infraIncoming.baseCount * 0.05);
      const jitter = Math.round(seed * node.infraIncoming.variance);
      const total = Math.max(0, Math.round((node.infraIncoming.baseCount + jitter) * multiplier));
      const replicas = isInfra ? node.infraReplicas ?? 1 : 1;
      const perInstance = Math.round(total / replicas);
      const unit = node.infraIncoming.unit || "req/s";

      if (perInstance >= 1000) {
        const val = perInstance / 1000;
        const formatted =
          val >= 10
            ? val.toFixed(1)
            : Math.abs(val - Math.round(val * 10) / 10) > 0.02
            ? val.toFixed(2)
            : val.toFixed(1);
        return `${formatted}k ${unit}`;
      }
      return `${perInstance.toLocaleString()} ${unit}`;
    },
    [ticker, trafficIntensity, isInfra]
  );

  // Compute live TOTAL ingress rate arriving at a circle (displayed as entry rate)
  const getCircleRate = useCallback(
    (circle: InfraCircle): string => {
      const multiplier = trafficIntensity === "burst" ? 2.75 : 1;
      const seed = Math.sin(ticker * 1.6 + circle.baseRate * 0.04);
      const jitter = Math.round(seed * circle.variance);
      const total = Math.max(0, Math.round((circle.baseRate + jitter) * multiplier));
      const unit = circle.unit || "req/s";

      if (total >= 1000) {
        return `${(total / 1000).toFixed(1)}k ${unit}`;
      }
      return `${total.toLocaleString()} ${unit}`;
    },
    [ticker, trafficIntensity]
  );

  // Compute live PER-INSTANCE rate after the LB distributes traffic
  const getCircleSplitRate = useCallback(
    (circle: InfraCircle): string | null => {
      if (!circle.downstreamInstances || circle.downstreamInstances <= 1) return null;
      const multiplier = trafficIntensity === "burst" ? 2.75 : 1;
      const seed = Math.sin(ticker * 1.6 + circle.baseRate * 0.04);
      const jitter = Math.round(seed * circle.variance);
      const total = Math.max(0, Math.round((circle.baseRate + jitter) * multiplier));
      const perInstance = Math.round(total / circle.downstreamInstances);
      const unit = circle.unit || "req/s";

      if (perInstance >= 1000) {
        const val = perInstance / 1000;
        const formatted =
          val >= 10
            ? val.toFixed(1)
            : Math.abs(val - Math.round(val * 10) / 10) > 0.02
            ? val.toFixed(2)
            : val.toFixed(1);
        return `${formatted}k ${unit}`;
      }
      return `${perInstance.toLocaleString()} ${unit}`;
    },
    [ticker, trafficIntensity]
  );

  // Aggregate live ingress for the header
  const totalIngress =
    trafficIntensity === "burst"
      ? Math.round(68420 + Math.sin(ticker * 2) * 580)
      : Math.round(24850 + Math.sin(ticker * 2) * 220);

  const canvasWidth = isInfra ? CANVAS_WIDTH_INFRA : CANVAS_WIDTH_ARCH;
  const canvasHeight = isInfra ? CANVAS_HEIGHT_INFRA : CANVAS_HEIGHT_ARCH;

  // Real-time SSE push loop from page-ref to /chat is revealed when either node is selected or hovered
  const isRealtimeEdgeVisible =
    selectedNode === "page-ref" ||
    selectedNode === "chat-page" ||
    hoveredNode === "page-ref" ||
    hoveredNode === "chat-page";

  // Visible connections — compact layout when infra disabled, spacious routed connections when infra enabled
  const activeConnections = useMemo(() => {
    if (isInfra) {
      const base = [...INFRA_CONNECTIONS, ...DB_REPLICATION_CONNECTIONS];
      return isRealtimeEdgeVisible ? [...base, INFRA_SSE_RETURN_CONNECTION] : base;
    } else if (activeMode === "ai-worker") {
      if (workerStep >= 2 && activeTicket.aiConnections.length > 0) {
        const filtered = ARCH_CONNECTIONS.filter(
          (c) => c.id !== activeTicket.replacedConnectionId
        );
        const base = [...filtered, ...activeTicket.aiConnections];
        return isRealtimeEdgeVisible ? [...base, ARCH_SSE_RETURN_CONNECTION] : base;
      }
      const base = ARCH_CONNECTIONS;
      return isRealtimeEdgeVisible ? [...base, ARCH_SSE_RETURN_CONNECTION] : base;
    } else {
      const base = ARCH_CONNECTIONS;
      return isRealtimeEdgeVisible ? [...base, ARCH_SSE_RETURN_CONNECTION] : base;
    }
  }, [isInfra, isRealtimeEdgeVisible, activeMode, workerStep, activeTicket]);

  // Dynamically compute the exact zoom scale that fits all nodes in view
  const computeFitZoom = useCallback(() => {
    if (!scrollContainerRef.current) return 0.55;
    const containerWidth = scrollContainerRef.current.clientWidth;
    const containerHeight = scrollContainerRef.current.clientHeight;

    const paddingX = 48;
    const paddingY = 32;

    const scaleX = (containerWidth - paddingX) / canvasWidth;
    const scaleY = (containerHeight - paddingY) / canvasHeight;

    const fitScale = Math.min(scaleX, scaleY);
    return Math.min(Math.max(Number(fitScale.toFixed(2)), 0.35), 1.0);
  }, [canvasWidth, canvasHeight]);

  // Adjust zoom automatically on mount, resize, and when toggling modes
  useEffect(() => {
    const applyFit = () => {
      const fitScale = computeFitZoom();
      setZoom(fitScale);
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollLeft = 0;
        scrollContainerRef.current.scrollTop = 0;
      }
    };

    const timer = setTimeout(applyFit, 60);

    const handleResize = () => {
      applyFit();
    };

    window.addEventListener("resize", handleResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", handleResize);
    };
  }, [activeMode, computeFitZoom]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    setIsDragging(true);
    if (scrollContainerRef.current) {
      setDragStartX(e.pageX - scrollContainerRef.current.offsetLeft);
      setDragStartY(e.pageY - scrollContainerRef.current.offsetTop);
      setScrollStartX(scrollContainerRef.current.scrollLeft);
      setScrollStartY(scrollContainerRef.current.scrollTop);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !scrollContainerRef.current) return;
    e.preventDefault();
    const currentX = e.pageX - scrollContainerRef.current.offsetLeft;
    const currentY = e.pageY - scrollContainerRef.current.offsetTop;
    const deltaX = (currentX - dragStartX) * 1.25;
    const deltaY = (currentY - dragStartY) * 1.25;
    scrollContainerRef.current.scrollLeft = scrollStartX - deltaX;
    scrollContainerRef.current.scrollTop = scrollStartY - deltaY;
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Zoom helpers
  const handleZoomIn = () => {
    setZoom((prev) => Math.min(Number((prev + 0.05).toFixed(2)), 1.5));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(Number((prev - 0.05).toFixed(2)), 0.3));
  };

  const handleFitView = () => {
    const fitScale = computeFitZoom();
    setZoom(fitScale);
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        left: 0,
        top: 0,
        behavior: "smooth",
      });
    }
  };

  // Ctrl / Cmd + Wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.04 : 0.04;
      setZoom((prev) =>
        Math.min(Math.max(Number((prev + delta).toFixed(2)), 0.3), 1.5)
      );
    }
  };

  return (
    <div className="w-full max-w-[1360px] rounded-xl border border-zinc-800 bg-[#0a0a0c] shadow-2xl overflow-hidden flex flex-col text-left mx-auto">
      {/* Studio Header Toolbar */}
      <HeroCanvasHeader
        activeMode={activeMode}
        setActiveMode={setActiveMode}
        trafficIntensity={trafficIntensity}
        setTrafficIntensity={setTrafficIntensity}
        isPlaying={isPlaying}
        setIsPlaying={setIsPlaying}
        playbackSpeed={playbackSpeed}
        setPlaybackSpeed={setPlaybackSpeed}
        setWorkerStep={setWorkerStep}
        securityStep={securityStep}
        setSecurityStep={setSecurityStep}
        totalIngress={totalIngress}
        onModeChange={() => {
          setHoveredInfraId(null);
          setSelectedInfraId(null);
        }}
      />

      {/* Horizontal Ticket Pipeline Strip (AI Worker Mode) */}
      {activeMode === "ai-worker" && (
        <HeroCanvasTicketPipeline
          activeTicket={activeTicket}
          selectedTicketIndex={selectedTicketIndex}
          setSelectedTicketIndex={setSelectedTicketIndex}
          workerStep={workerStep}
          setWorkerStep={setWorkerStep}
          currentStep={currentStep}
          activeConsoleTab={activeConsoleTab}
          setActiveConsoleTab={setActiveConsoleTab}
          isConsoleOpen={isConsoleOpen}
          setIsConsoleOpen={setIsConsoleOpen}
        />
      )}

      {/* Horizontal Security Audit Pipeline Strip (Ethical Hacker Mode) */}
      {activeMode === "ethical-hacker" && (
        <HeroCanvasSecurityPipeline
          activeVector={activeVector}
          selectedVectorIndex={selectedVectorIndex}
          setSelectedVectorIndex={setSelectedVectorIndex}
          securityStep={securityStep}
          setSecurityStep={setSecurityStep}
          currentStep={activeSecurityStep}
          activeConsoleTab={securityConsoleTab}
          setActiveConsoleTab={setSecurityConsoleTab}
          isConsoleOpen={isSecurityConsoleOpen}
          setIsConsoleOpen={setIsSecurityConsoleOpen}
        />
      )}

      {/* Main Canvas Stage or Embedded Walkthrough Video */}
      {activeMode === "video" ? (
        <div className="relative w-full h-[460px] sm:h-[500px] md:h-[540px] lg:h-[580px] bg-black">
          <VideoPlayer src="https://www.youtube.com/embed/4PHK9rqgrmE?start=26&rel=0" />
        </div>
      ) : (
        <div
          ref={scrollContainerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onClick={(e) => {
          if (
            !(e.target as HTMLElement).closest(".canvas-node-card") &&
            !(e.target as HTMLElement).closest("button")
          ) {
            setSelectedNode(null);
            setSelectedInfraId(null);
          }
        }}
        className={`relative w-full h-[460px] sm:h-[500px] md:h-[540px] lg:h-[580px] bg-[#070709] overflow-auto select-none hide-scrollbar ${
          isDragging ? "cursor-grabbing" : "cursor-grab"
        } scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-[#0a0a0d]`}
      >
        {/* Dynamic Canvas Sizer responding to Zoom & Canvas Mode Width */}
        <div
          style={{
            width: `${canvasWidth * zoom}px`,
            height: `${canvasHeight * zoom}px`,
          }}
          className="relative transition-[width,height] duration-300 ease-out"
        >
          {/* Transformed Scaled Canvas */}
          <div
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: "top left",
              width: `${canvasWidth}px`,
              height: `${canvasHeight}px`,
            }}
            className="relative transition-[width,height] duration-300 ease-out"
          >
            {/* Subtle dot grid */}
            <div
              className="absolute inset-0 pointer-events-none opacity-25"
              style={{
                backgroundImage:
                  "radial-gradient(#3f3f46 1px, transparent 1px)",
                backgroundSize: "22px 22px",
              }}
            />

            {/* Canvas SVG Connection Lines & Animated Data Packets */}
            <HeroCanvasConnections
              activeConnections={activeConnections}
              selectedNode={selectedNode}
              hoveredNode={hoveredNode}
              activeInfraId={activeInfraId}
              activeMode={activeMode}
              trafficIntensity={trafficIntensity}
              reduceMotion={reduceMotion}
              currentStep={activeMode === "ai-worker" ? currentStep : null}
              workerStep={workerStep}
              activeTicket={activeTicket}
              securityStep={securityStep}
              activeSecurityStep={activeMode === "ethical-hacker" ? activeSecurityStep : null}
              activeVector={activeMode === "ethical-hacker" ? activeVector : null}
              canvasWidth={canvasWidth}
              canvasHeight={canvasHeight}
            />

            {/* Small Circles Representing Load Balancers */}
            {activeMode === "infrastructure" && (
              <HeroCanvasLoadBalancers
                activeInfraId={activeInfraId}
                setHoveredInfraId={setHoveredInfraId}
                setSelectedInfraId={setSelectedInfraId}
                getCircleRate={getCircleRate}
                getCircleSplitRate={getCircleSplitRate}
              />
            )}

            {/* Small Circles Representing DB Replicas */}
            {activeMode === "infrastructure" && (
              <HeroCanvasDbReplicas
                activeInfraId={activeInfraId}
                setHoveredInfraId={setHoveredInfraId}
                setSelectedInfraId={setSelectedInfraId}
                getCircleRate={getCircleRate}
              />
            )}

            {/* Interactive Flying Card Showing Telemetry on Hover */}
            {activeMode === "infrastructure" && (
              <HeroCanvasInfraFlyingCard
                activeInfraNode={activeInfraNode}
                setHoveredInfraId={setHoveredInfraId}
                getCircleRate={getCircleRate}
                getCircleSplitRate={getCircleSplitRate}
                trafficIntensity={trafficIntensity}
              />
            )}

            {/* Core Topology Nodes Layer */}
            <HeroCanvasNodes
              nodes={NODES}
              isInfra={isInfra}
              activeMode={activeMode}
              hoveredNode={hoveredNode}
              selectedNode={selectedNode}
              currentStep={activeMode === "ai-worker" ? currentStep : null}
              securityStep={securityStep}
              activeSecurityStep={activeMode === "ethical-hacker" ? activeSecurityStep : null}
              isRealtimeEdgeVisible={isRealtimeEdgeVisible}
              getIncomingBadgeText={getIncomingBadgeText}
              setHoveredNode={setHoveredNode}
              setSelectedNode={setSelectedNode}
            />

            {/* AI-Synthesized Generated Node */}
            <HeroCanvasAiGeneratedNode
              isVisible={activeMode === "ai-worker" && workerStep >= 2}
              generatedNode={activeTicket.generatedNode}
            />

            {/* Autonomous AI Worker Drone Entity */}
            {activeMode === "ai-worker" && currentStep && (
              <HeroCanvasAiDrone
                currentStep={currentStep}
                workerStep={workerStep}
                activeTicket={activeTicket}
              />
            )}

            {/* Ethical Hacker Red Team Probe Drone Entity */}
            {activeMode === "ethical-hacker" && activeSecurityStep && (
              <HeroCanvasSecurityDrone
                currentStep={activeSecurityStep}
                securityStep={securityStep}
                activeVector={activeVector}
              />
            )}
          </div>
        </div>

        {/* Floating Active Ticket Card (Top Left - AI Worker Mode) */}
        {activeMode === "ai-worker" && (
          <HeroCanvasTicketCard
            activeTicket={activeTicket}
            workerStep={workerStep}
            setWorkerStep={setWorkerStep}
            selectedTicketIndex={selectedTicketIndex}
            setSelectedTicketIndex={setSelectedTicketIndex}
            isTicketCardMinimized={isTicketCardMinimized}
            setIsTicketCardMinimized={setIsTicketCardMinimized}
          />
        )}

        {/* Floating Active Security Vector Card (Top Left - Ethical Hacker Mode) */}
        {activeMode === "ethical-hacker" && (
          <HeroCanvasSecurityCard
            activeVector={activeVector}
            securityStep={securityStep}
            setSecurityStep={setSecurityStep}
            selectedVectorIndex={selectedVectorIndex}
            setSelectedVectorIndex={setSelectedVectorIndex}
            isSecurityCardMinimized={isSecurityCardMinimized}
            setIsSecurityCardMinimized={setIsSecurityCardMinimized}
          />
        )}

        {/* Floating Agent Terminal & Code Diff Inspector (Bottom Right - AI Worker Mode) */}
        {activeMode === "ai-worker" && (
          <HeroCanvasConsole
            currentStep={currentStep}
            workerStep={workerStep}
            setWorkerStep={setWorkerStep}
            isConsoleMinimized={isConsoleMinimized}
            setIsConsoleMinimized={setIsConsoleMinimized}
            activeConsoleTab={activeConsoleTab}
            setActiveConsoleTab={setActiveConsoleTab}
            isPlaying={isPlaying}
            setIsPlaying={setIsPlaying}
            playbackSpeed={playbackSpeed}
            setPlaybackSpeed={setPlaybackSpeed}
          />
        )}

        {/* Floating Red Team Terminal & Remediation Console (Bottom Right - Ethical Hacker Mode) */}
        {activeMode === "ethical-hacker" && (
          <HeroCanvasSecurityConsole
            currentStep={activeSecurityStep}
            securityStep={securityStep}
            setSecurityStep={setSecurityStep}
            isConsoleMinimized={isSecurityConsoleMinimized}
            setIsConsoleMinimized={setIsSecurityConsoleMinimized}
            activeConsoleTab={securityConsoleTab}
            setActiveConsoleTab={setSecurityConsoleTab}
            isPlaying={isPlaying}
            setIsPlaying={setIsPlaying}
            playbackSpeed={playbackSpeed}
            setPlaybackSpeed={setPlaybackSpeed}
          />
        )}

        {/* Floating XYFlow-style Canvas Control Widget */}
        <HeroCanvasControls
          zoom={zoom}
          handleZoomIn={handleZoomIn}
          handleZoomOut={handleZoomOut}
          handleFitView={handleFitView}
        />
        </div>
      )}

      {/* Floating Canvas Footer Status Bar */}
      <HeroCanvasFooter
        activeMode={activeMode}
        activeInfraNode={activeInfraNode}
        selectedNode={selectedNode}
        currentStep={currentStep}
        workerStep={workerStep}
        activeTicket={activeTicket}
        securityStep={securityStep}
        activeSecurityStep={activeMode === "ethical-hacker" ? activeSecurityStep : null}
        activeVector={activeMode === "ethical-hacker" ? activeVector : null}
        isRealtimeEdgeVisible={isRealtimeEdgeVisible}
      />
    </div>
  );
};
