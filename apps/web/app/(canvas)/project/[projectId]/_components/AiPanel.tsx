"use client";

import React, { useState, useRef, useEffect } from "react";
import { Resizable } from "re-resizable";
import { X, Send, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@workspace/ui/components/button";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useMutation, useQuery } from "convex/react";
import { api } from "@workspace/backend/_generated/api";
import { Id } from "@workspace/backend/_generated/dataModel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@workspace/ui/components/select";
import { useAuth } from "@clerk/nextjs";
import { useReactFlow } from "@xyflow/react";
import { Textarea } from "@workspace/ui/components/textarea";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";

import { BackendCanvasView } from "@/types/canvas";
import { Badge } from "@workspace/ui/components/badge";

interface AiPanelProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  setView?: (view: BackendCanvasView) => void;
}

type Message = {
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
};

function serializeBackendCanvasForAI(
  nodes: Array<{ id: string; type: string; data: any }>,
  edges: Array<{ source: string; target: string; type?: string; sourceHandle?: string | null; targetHandle?: string | null }>,
) {
  if (nodes.length === 0) return "Backend Canvas is empty.";

  let output = "Backend Canvas Nodes:\n";
  for (const node of nodes) {
    const data = node.data ?? {};
    output += `- [${node.type}] id: ${node.id}, label: "${data.label ?? ""}"`;

    if (node.type === "service" && Array.isArray(data.endpoints)) {
      output += "\n  Endpoints:\n";
      output += data.endpoints.map((endpoint: any) => {
        const dbIds = [
          ...(Array.isArray(endpoint.databaseNodeIds) ? endpoint.databaseNodeIds : []),
          ...(endpoint.databaseNodeId ? [endpoint.databaseNodeId] : []),
        ];
        const uniqueDbIds = [...new Set(dbIds)];
        const db = uniqueDbIds.length > 0 ? ` databaseNodeIds=[${uniqueDbIds.join(", ")}]` : "";
        return `    - ${endpoint.type} ${endpoint.name} id=${endpoint.id} sourceHandle="endpoint-out-${endpoint.id}" targetHandle="endpoint-in-${endpoint.id}"${db}`;
      }).join("\n");
    }

    if (node.type === "db_ref") {
      output += `\n  DB reference: tableRef=${data.tableRef ?? "unknown"} targetHandle="database-target"`;
    }
    output += "\n";
  }

  if (edges.length > 0) {
    output += "\nConnections (use these to avoid duplicates):\n";
    for (const edge of edges) {
      output += `- ${edge.source} -> ${edge.target} [${edge.type ?? "connection"}] sourceHandle="${edge.sourceHandle ?? ""}" targetHandle="${edge.targetHandle ?? ""}"\n`;
    }
  }
  return output;
}

export function AiPanel({ projectId, isOpen, onClose, setView }: AiPanelProps) {
  const [activeChatId, setActiveChatId] = useState<Id<"project_chats"> | null>(null);
  const [hasInitializedChat, setHasInitializedChat] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: `Hi! I'm your AI Assistant. I can help you design your system architecture. What would you like to build?` }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { getToken } = useAuth();
  const backendNodes = useBackendCanvasStore((state) => state.nodes);
  const backendEdges = useBackendCanvasStore((state) => state.edges);
  
  const reactFlow = useReactFlow();

  const chats = useQuery(api.project_chat.getChats, { projectId: projectId as Id<"projects"> });
  const convexMessages = useQuery(api.project_chat.getMessages, activeChatId ? { chatId: activeChatId } : "skip");

  const createChat = useMutation(api.project_chat.createChat);
  const addMessage = useMutation(api.project_chat.addMessage);

  // Initialize activeChatId if null and chats exist, but only once on load
  useEffect(() => {
    if (chats && !hasInitializedChat) {
      if (chats.length > 0) {
        setActiveChatId(chats[0]!._id);
      }
      setHasInitializedChat(true);
    }
  }, [chats, hasInitializedChat]);

  // Sync messages when activeChatId or convexMessages changes
  useEffect(() => {
    if (convexMessages) {
      if (convexMessages.length > 0) {
        setMessages(convexMessages.map(m => ({ role: m.role as "user" | "assistant", content: m.content })));
      } else {
        setMessages([
          { role: "assistant", content: `Hi! I'm your AI Assistant. I can help you design your system architecture. What would you like to build?` }
        ]);
      }
    } else if (!activeChatId) {
      setMessages([
        { role: "assistant", content: `Hi! I'm your AI Assistant. I can help you design your system architecture. What would you like to build?` }
      ]);
    }
  }, [convexMessages, activeChatId]);

  const handleNewChat = () => {
    setActiveChatId(null);
  };

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = async (e?: React.SubmitEvent | React.KeyboardEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);
    
    let currentChatId = activeChatId;
    if (!currentChatId) {
      currentChatId = await createChat({
        projectId: projectId as Id<"projects">,
        title: userMessage.substring(0, 40) + (userMessage.length > 40 ? "..." : ""),
      });
      setActiveChatId(currentChatId);
    }

    await addMessage({ chatId: currentChatId, role: "user", content: userMessage }).catch(console.error);

    try {
      // Use the live backend store so the AI receives endpoint IDs, DB-ref IDs,
      // and existing edge handles needed to repair disconnected tables.
      const canvasStateContext = serializeBackendCanvasForAI(backendNodes, backendEdges);
      
      const token = await getToken({ template: "convex" });

      // Get current viewport center so AI can place nodes near the user
      const viewportCenter = reactFlow.screenToFlowPosition({
        x: window.innerWidth / 2,
        y: window.innerHeight / 2
      });

      const res = await fetch(`${window.location.origin}/api/canvas-ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          chatId: currentChatId,
          canvasStateContext,
          token,
          viewportCenter
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
                const lastMsg = newMsgs[newMsgs.length - 1];
                if (lastMsg) {
                  lastMsg.content = assistantContent;
                }
                return newMsgs;
              });
            } else if (data.type === "tool_call") {
              // The tool mutation is now executed directly on the backend by the agent.
              const argsStr = data.message || "";
              assistantContent += `\n*🔧 Tool used: \`${data.name}\`*${argsStr}\n`;
              
              // Automatically switch tabs based on what the AI is building
              if (setView) {
                if (data.name === "add_schema_group" || data.name === "add_single_schema" || data.name === "add_schema_edge") {
                  setView("schema");
                } else {
                  setView("graph");
                }
              }

              setMessages(prev => {
                const newMsgs = [...prev];
                const lastMsg = newMsgs[newMsgs.length - 1];
                if (lastMsg) {
                  lastMsg.content = assistantContent;
                }
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
        const lastMsg = newMsgs[newMsgs.length - 1];
        if (lastMsg) {
          lastMsg.isStreaming = false;
        }
        return newMsgs;
      });

      if (assistantContent && currentChatId) {
        addMessage({ chatId: currentChatId, role: "assistant", content: assistantContent }).catch(console.error);
      }

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
      <div className="flex items-center justify-between p-4 border-b shrink-0 bg-secondary/30 gap-2">
        <div className="flex items-center text-sm font-medium whitespace-nowrap">
          <Sparkles className="w-4 h-4 mr-2 text-primary" />
          AI Assistant <Badge className="ml-2">Beta</Badge>
        </div>
        {chats !== undefined && (
          <div className="flex-1 px-2 overflow-hidden flex justify-end">
            <Select value={activeChatId || "new"} onValueChange={(val) => val === "new" ? handleNewChat() : setActiveChatId(val as Id<"project_chats">)}>
              <SelectTrigger className="h-7 text-xs bg-background/50 border-none shadow-none focus:ring-0 w-[140px]">
                <SelectValue placeholder="Select a chat" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new" className="font-semibold text-primary">
                  + New Chat
                </SelectItem>
                {chats.map(c => (
                  <SelectItem key={c._id} value={c._id}>
                    {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex-1 p-4 overflow-y-auto" ref={scrollRef}>
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
                  <div className="prose prose-sm dark:prose-invert prose-p:leading-snug prose-pre:bg-black/50">
                    <ReactMarkdown 
                      remarkPlugins={[remarkGfm]}
                      components={{
                        ol: ({node, ...props}) => <ol className="list-decimal ml-5 space-y-2" {...props} />,
                        ul: ({node, ...props}) => <ul className="list-disc ml-5 space-y-2" {...props} />,
                        li: ({node, ...props}) => <li className="pl-1 marker:text-foreground" {...props} />,
                        p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>
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
      </div>

      <div className="p-4 border-t bg-background shrink-0">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder="Ask AI to design your system..."
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
