"use client";

import React, { useState, useRef, useEffect } from "react";
import { Resizable } from "re-resizable";
import { X, Send, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { ScrollArea } from "@workspace/ui/components/scroll-area";
import { CanvasMode } from "@/types/canvas";
import ReactMarkdown from "react-markdown";

interface AiPanelProps {
  projectId: string;
  mode: CanvasMode;
  isOpen: boolean;
  onClose: () => void;
}

type Message = {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
};

export function AiPanel({ projectId, mode, isOpen, onClose }: AiPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: `Hi! I'm your Blueprint AI. I can help you design on the **${mode}** canvas. What would you like to build?` }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);

    try {
      const adapter = mode === "frontend" 
        ? (window as any).frontendAdapter 
        : (window as any).backendAdapter;

      const canvasStateContext = adapter?.serialize() || "Canvas is empty.";

      const res = await fetch("/api/canvas-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          messages: [{ role: "user", content: userMessage }],
          canvasMode: mode,
          canvasStateContext
        })
      });

      if (!res.ok) throw new Error("API failed");
      
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");

      const decoder = new TextDecoder();
      let assistantContent = "";
      
      setMessages(prev => [...prev, { role: "assistant", content: "", isStreaming: true }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter(l => l.trim() !== "");

        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.type === "text") {
              assistantContent += data.content;
              setMessages(prev => {
                const newMsgs = [...prev];
                newMsgs[newMsgs.length - 1].content = assistantContent;
                return newMsgs;
              });
            } else if (data.type === "tool_call") {
              // Apply the operation to the canvas immediately
              if (adapter) {
                adapter.applyOperations([data.op]);
              }
              // Optionally show a tiny log message
              assistantContent += `\n*🔧 Tool used: \`${data.name}\`*\n`;
              setMessages(prev => {
                const newMsgs = [...prev];
                newMsgs[newMsgs.length - 1].content = assistantContent;
                return newMsgs;
              });
            }
          } catch (e) {
            console.error("Failed to parse chunk line", line);
          }
        }
      }

      setMessages(prev => {
        const newMsgs = [...prev];
        newMsgs[newMsgs.length - 1].isStreaming = false;
        return newMsgs;
      });

    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: "assistant", content: "Sorry, I encountered an error. Please try again." }]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Resizable
      defaultSize={{ width: 400, height: "100%" }}
      minWidth={300}
      maxWidth={800}
      enable={{ left: true }}
      className="border-l bg-background shadow-xl flex flex-col h-full z-50 absolute right-0"
    >
      <div className="flex items-center justify-between p-4 border-b shrink-0 bg-secondary/30">
        <div className="flex items-center text-sm font-medium">
          <Sparkles className="w-4 h-4 mr-2 text-primary" />
          Blueprint AI
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex flex-col ${
                msg.role === "user" ? "items-end" : "items-start"
              }`}
            >
              <div
                className={`px-4 py-2 rounded-2xl max-w-[85%] text-sm ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-none"
                    : "bg-secondary text-secondary-foreground rounded-bl-none"
                }`}
              >
                {msg.role === "assistant" ? (
                  <ReactMarkdown className="prose prose-sm dark:prose-invert prose-p:leading-snug prose-pre:bg-black/50">
                    {msg.content}
                  </ReactMarkdown>
                ) : (
                  msg.content
                )}
                {msg.isStreaming && <span className="inline-block w-1.5 h-4 ml-1 bg-current animate-pulse align-middle" />}
              </div>
            </div>
          ))}
          {isLoading && messages[messages.length - 1]?.role === "user" && (
            <div className="flex items-center text-xs text-muted-foreground ml-2">
              <Loader2 className="w-3 h-3 mr-2 animate-spin" />
              Thinking...
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="p-4 border-t bg-background shrink-0">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Ask AI to edit the ${mode}...`}
            className="flex-1"
            disabled={isLoading}
          />
          <Button type="submit" size="icon" disabled={!input.trim() || isLoading}>
            <Send className="w-4 h-4" />
          </Button>
        </form>
        <div className="text-[10px] text-muted-foreground text-center mt-2">
          AI can make mistakes. Verify the generated design.
        </div>
      </div>
    </Resizable>
  );
}
