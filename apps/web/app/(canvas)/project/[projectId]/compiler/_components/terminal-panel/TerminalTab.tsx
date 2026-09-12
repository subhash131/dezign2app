"use client";

import React from "react";
import { WTermTerminal, WTermTerminalHandle } from "@/components/terminal";
import { TerminalViewport } from "../../../_components/terminal/components/TerminalViewport";
import { TerminalSession, TerminalType } from "../../../_components/terminal/types";

interface TerminalTabProps {
  projectId?: string;
  outputDir?: string;
  sessions: TerminalSession[];
  activeSessionId: string | null;
  terminalRefs: React.RefObject<Map<string, WTermTerminalHandle | null>>;
  onTerminalInput: (sessionId: string, data: string) => void;
  onTerminalResize: (sessionId: string, cols: number, rows: number) => void;
  onCreateSession: (type?: TerminalType, shell?: string, title?: string) => void;
  onSelectSession?: (sessionId: string) => void;
  onCloseSession?: (sessionId: string) => void;
  formattedLogs: string[];
}

export function TerminalTab({
  projectId,
  outputDir = "",
  sessions,
  activeSessionId,
  terminalRefs,
  onTerminalInput,
  onTerminalResize,
  onCreateSession,
  onSelectSession,
  onCloseSession,
  formattedLogs,
}: TerminalTabProps) {
  return (
    <div className="w-full h-full flex flex-col flex-1 min-h-0 relative overflow-hidden bg-[#090d13]">
      {projectId ? (
        <TerminalViewport
          projectId={projectId}
          outputDir={outputDir}
          sessions={sessions}
          activeSessionId={activeSessionId}
          terminalRefs={terminalRefs}
          onTerminalInput={onTerminalInput}
          onTerminalResize={onTerminalResize}
          onNewTab={onCreateSession}
          onSelectSession={onSelectSession}
          onCloseSession={onCloseSession}
        />
      ) : (
        <WTermTerminal
          ref={(el) => {
            if (el) {
              terminalRefs.current.set("standalone", el);
            } else {
              terminalRefs.current.delete("standalone");
            }
          }}
          logs={formattedLogs}
          interactive={true}
          autoScroll={true}
        />
      )}
    </div>
  );
}
