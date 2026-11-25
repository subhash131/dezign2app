"use client";

import React, { useState } from "react";
import {
  Sparkles,
  Trash,
  Send,
  Bot,
  User,
  Check,
  Copy,
  Code2,
  Wand2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { LocalTextarea } from "@/app/(canvas)/project/[projectId]/_components/backend-nodes/graph-nodes/shared";
import { CompiledFile } from "@/lib/compiler";
import { Resizable } from "re-resizable";

interface Message {
  id: string;
  sender: "user" | "ai";
  text: string;
  codeSnippet?: string;
  timestamp: string;
}

interface AiChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  activeFile?: CompiledFile;
  onApplyCode?: (code: string) => void;
}

export function AiChatPanel({
  isOpen,
  onClose,
  activeFile,
  onApplyCode,
}: AiChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      sender: "ai",
      text: `Hello! I'm your AI Coding Agent. I am inspecting **${
        activeFile?.filename || "your project"
      }**. Ask me to modify function bodies, explain logic, or fix issues.`,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSendMessage = (textToSend?: string) => {
    const text = textToSend || inputText;
    if (!text.trim()) return;

    const userMsg: Message = {
      id: Math.random().toString(),
      sender: "user",
      text,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputText("");
    setIsThinking(true);

    // Simulate AI response stream
    setTimeout(() => {
      let aiResponseText = "";
      let suggestedCode: string | undefined = undefined;

      const lower = text.toLowerCase();
      if (lower.includes("explain")) {
        aiResponseText = `This file (\`${activeFile?.filename}\`) sets up an endpoint route handler or service logic. Current implementation length is ${
          activeFile?.content.split("\n").length || 0
        } lines.`;
      } else if (lower.includes("fix") || lower.includes("refactor")) {
        suggestedCode = `// AI Refactored Logic for ${activeFile?.filename}\nconst items = await db.findMany();\nif (!items || items.length === 0) {\n  return res.status(404).json({ error: "Not found" });\n}\nreturn res.json({ success: true, data: items });`;
        aiResponseText = `I have optimized the handler code with proper null checks and standard JSON response formatting. Click **Apply Code** below to insert this into your editor.`;
      } else if (lower.includes("test")) {
        suggestedCode = `describe("Endpoint test for ${activeFile?.filename}", () => {\n  it("should return 200 OK", async () => {\n    // Auto-generated unit test stub\n  });\n});`;
        aiResponseText = `Here is a unit test structure for this endpoint:`;
      } else {
        aiResponseText = `I evaluated \`${activeFile?.filename}\` with your prompt: "${text}". You can edit the function body directly in Monaco or ask me to draft changes for you!`;
      }

      const aiMsg: Message = {
        id: Math.random().toString(),
        sender: "ai",
        text: aiResponseText,
        codeSnippet: suggestedCode,
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };

      setMessages((prev) => [...prev, aiMsg]);
      setIsThinking(false);
    }, 1000);
  };

  const handleCopyCode = (id: string, code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <Resizable
      defaultSize={{ width: 330, height: "100%" }}
      minWidth={240}
      maxWidth={600}
      enable={{ left: true }}
      handleClasses={{
        left: "w-1.5 bg-border/40 hover:bg-primary/60 cursor-col-resize transition-colors z-20",
      }}
      className="bg-[#12161f] border-l border-border/50 flex flex-col shrink-0 select-none relative"
    >
      {/* Top Header */}
      <div className="px-4 py-3 bg-[#161b22] border-b border-border/40 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-primary/10 text-primary">
            <Sparkles className="w-4 h-4" />
          </div>
          <span className="text-xs font-semibold text-slate-100">
            AI Coding Agent
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-6 w-6 text-slate-400 hover:text-white"
        >
          <Trash className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Active File Context Pill */}
      {activeFile && (
        <div className="px-3 py-1.5 bg-[#0d1117] border-b border-border/30 flex items-center gap-1.5 text-[10px] font-mono text-slate-400 shrink-0">
          <Code2 className="w-3 h-3 text-sky-400 shrink-0" />
          <span className="truncate">Context: {activeFile.filename}</span>
        </div>
      )}

      {/* Messages Stream */}
      <div className="flex-1 p-3 overflow-y-auto space-y-3 font-sans text-xs min-h-0">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col gap-1 ${
              msg.sender === "user" ? "items-end" : "items-start"
            }`}
          >
            <div className="flex items-center gap-1 text-[10px] text-slate-400 font-mono">
              {msg.sender === "ai" ? (
                <>
                  <Bot className="w-3 h-3 text-primary" />
                  <span>Agent</span>
                </>
              ) : (
                <>
                  <span>You</span>
                  <User className="w-3 h-3 text-sky-400" />
                </>
              )}
              <span>• {msg.timestamp}</span>
            </div>

            <div
              className={`p-2.5 rounded-lg max-w-[95%] leading-relaxed ${
                msg.sender === "user"
                  ? "bg-primary text-primary-foreground font-medium"
                  : "bg-slate-800/80 text-slate-200 border border-slate-700/60"
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.text}</p>

              {msg.codeSnippet && (
                <div className="mt-2 pt-2 border-t border-slate-700/80 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono text-slate-400">
                      Suggested Code
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleCopyCode(msg.id, msg.codeSnippet!)}
                        className="text-[10px] flex items-center gap-1 text-slate-400 hover:text-white"
                      >
                        {copiedId === msg.id ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        <span>{copiedId === msg.id ? "Copied" : "Copy"}</span>
                      </button>
                    </div>
                  </div>

                  <pre className="p-2 bg-[#0d1117] rounded font-mono text-[10px] leading-normal overflow-x-auto text-emerald-300">
                    <code>{msg.codeSnippet}</code>
                  </pre>

                  {onApplyCode && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onApplyCode(msg.codeSnippet!)}
                      className="h-6 text-[10px] gap-1 mt-1 bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 hover:bg-emerald-900"
                    >
                      <Wand2 className="w-3 h-3" />
                      <span>Apply Code to Function Body</span>
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {isThinking && (
          <div className="flex items-center gap-2 text-[11px] text-primary italic py-1">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            <span>AI Agent is analyzing logic...</span>
          </div>
        )}
      </div>

      {/* Quick Action Chips */}
      <div className="px-3 py-2 border-t border-border/30 bg-[#0d1117] flex items-center gap-1.5 overflow-x-auto no-scrollbar select-none shrink-0">
        <button
          onClick={() => handleSendMessage("Explain this code")}
          className="px-2 py-1 bg-slate-800/80 hover:bg-slate-800 text-[10px] text-slate-300 rounded border border-slate-700 shrink-0"
        >
          💡 Explain
        </button>
        <button
          onClick={() => handleSendMessage("Refactor and fix function body")}
          className="px-2 py-1 bg-slate-800/80 hover:bg-slate-800 text-[10px] text-slate-300 rounded border border-slate-700 shrink-0"
        >
          ⚡ Fix Body
        </button>
        <button
          onClick={() => handleSendMessage("Generate unit tests")}
          className="px-2 py-1 bg-slate-800/80 hover:bg-slate-800 text-[10px] text-slate-300 rounded border border-slate-700 shrink-0"
        >
          🧪 Unit Tests
        </button>
      </div>

      {/* Input Area */}
      <div className="p-3 bg-[#161b22] border-t border-border/40 flex flex-col gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <LocalTextarea
            value={inputText}
            debounceMs={0}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                const val = e.currentTarget.value;
                setInputText("");
                handleSendMessage(val);
              }
            }}
            placeholder="Ask AI Agent to write or edit code..."
            className="min-h-[50px] max-h-[100px] text-xs bg-[#0d1117] text-slate-200 placeholder:text-slate-500 border-slate-700 resize-none focus-visible:ring-1 focus-visible:ring-primary"
          />
          <Button
            size="icon"
            disabled={!inputText.trim() || isThinking}
            onClick={() => handleSendMessage()}
            className="h-12 w-10 shrink-0 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </Resizable>
  );
}
