import React, { useState, useEffect, useRef } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@workspace/ui/components/sheet";
import { ChevronLeft } from "lucide-react";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { EndpointConfig } from "./config-sidebar/EndpointConfig";
import { EventConfig } from "./config-sidebar/EventConfig";
import { TaskConfig } from "./config-sidebar/TaskConfig";

export const ConfigSidebar = () => {
  const activeConfigItem = useBackendCanvasStore(s => s.activeConfigItem);
  const setActiveConfigItem = useBackendCanvasStore(s => s.setActiveConfigItem);

  const [width, setWidth] = useState(540);
  const isDragging = useRef(false);

  type ConfigItem = NonNullable<typeof activeConfigItem>;
  const [history, setHistory] = useState<ConfigItem[]>([]);

  useEffect(() => {
    if (!activeConfigItem) {
      setHistory([]);
      return;
    }

    setHistory(prev => {
      if (prev.length > 1 && prev[prev.length - 2]?.id === activeConfigItem.id && prev[prev.length - 2]?.type === activeConfigItem.type) {
        return prev.slice(0, prev.length - 1);
      }
      
      if (prev.length > 0 && prev[prev.length - 1]?.id === activeConfigItem.id && prev[prev.length - 1]?.type === activeConfigItem.type) {
        return prev;
      }
      
      if (prev.length > 0 && prev[prev.length - 1]?.nodeId !== activeConfigItem.nodeId) {
         return [activeConfigItem];
      }

      return [...prev, activeConfigItem];
    });
  }, [activeConfigItem]);

  const handleBack = () => {
    if (history.length > 1) {
      setActiveConfigItem(history[history.length - 2] ?? null);
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth > 320 && newWidth < 800) {
        setWidth(newWidth);
      }
    };
    const handleMouseUp = () => {
      isDragging.current = false;
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const open = activeConfigItem !== null;
  
  if (!open) return null;

  const type = activeConfigItem.type;
  const id = activeConfigItem.id;
  const nodeId = activeConfigItem.nodeId || "";

  return (
    <Sheet modal={false} open={open} onOpenChange={(isOpen) => !isOpen && setActiveConfigItem(null)}>
      <SheetContent 
        hideOverlay 
        className="overflow-y-auto bg-background/80 backdrop-blur-xl border-l border-border/50 shadow-2xl p-6 sm:p-8 transition-none"
        style={{ maxWidth: '100vw', width: width }}
      >
        <div
          className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-primary/20 z-50 transition-colors"
          onMouseDown={() => {
            isDragging.current = true;
          }}
        />
        <SheetHeader className="hidden">
          <SheetTitle>Configuration</SheetTitle>
          <SheetDescription>
            {type === 'endpoint' ? "Configure endpoint properties." : 
             type === 'task' ? "Configure task properties." :
             "Configure event and messaging properties."}
          </SheetDescription>
        </SheetHeader>
        
        {history.length > 1 && (
          <div 
            onClick={handleBack}
            className="flex items-center w-fit text-xs font-medium text-muted-foreground hover:text-foreground cursor-pointer transition-colors -mb-2 mt-2"
          >
            <ChevronLeft size={14} className="mr-0.5" />
            Back
          </div>
        )}

        {type === 'endpoint' ? <EndpointConfig id={id} nodeId={nodeId} /> : 
         type === 'task' ? <TaskConfig id={id} nodeId={nodeId} /> : 
         <EventConfig id={id} nodeId={nodeId} />}
      </SheetContent>
    </Sheet>
  );
};
