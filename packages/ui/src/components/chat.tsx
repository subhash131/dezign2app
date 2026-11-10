"use client";

import * as React from "react";
import { Send, Bot, User, Sparkles } from "lucide-react";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
  useMessageScroller,
} from "./message-scroller";
import { Message, MessageContent, MessageAvatar } from "./message";
import { Bubble, BubbleContent } from "./bubble";

// Re-export all primitives
export * from "./message-scroller";
export * from "./message";
export * from "./bubble";

export interface ScriptedTurn {
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  tools?: Array<{ name: string; input: Record<string, unknown>; output?: Record<string, unknown> }>;
}

export function createChat() {
  const turns: ScriptedTurn[] = [];
  const api = {
    user(content: string) {
      turns.push({ role: "user", content });
      return api;
    },
    assistant(
      builder: (writer: {
        reasoning: (r: string) => unknown;
        tool: (name: string, input: Record<string, unknown>) => { output: (o: Record<string, unknown>) => unknown };
        text: (t: string) => unknown;
      }) => void,
    ) {
      let content = "";
      let reasoning = "";
      const tools: Array<{ name: string; input: Record<string, unknown>; output?: Record<string, unknown> }> = [];
      const writer = {
        reasoning(r: string) {
          reasoning += r;
          return writer;
        },
        tool(name: string, input: Record<string, unknown>) {
          const t: { name: string; input: Record<string, unknown>; output?: Record<string, unknown> } = {
            name,
            input,
          };
          tools.push(t);
          return {
            output(o: Record<string, unknown>) {
              t.output = o;
              return writer;
            },
          };
        },
        text(t: string) {
          content += t;
          return writer;
        },
      };
      builder(writer);
      turns.push({ role: "assistant", content, reasoning, tools });
      return api;
    },
    getTurns() {
      return turns;
    },
    transport(options?: { fallback?: string }) {
      return {
        turns,
        fallback: options?.fallback,
      };
    },
    next(currentMessages: Array<{ role: string; content: string }>) {
      const idx = currentMessages.length;
      return turns[idx] || null;
    },
  };
  return api;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt?: string;
}

export interface ChatProps extends React.HTMLAttributes<HTMLDivElement> {
  messages?: ChatMessage[];
  onSendMessage?: (content: string) => void | Promise<void>;
  placeholder?: string;
  isLoading?: boolean;
  autoScroll?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  title?: string;
  showAvatars?: boolean;
}

export const Chat = React.forwardRef<HTMLDivElement, ChatProps>(
  (
    {
      messages: propMessages,
      onSendMessage,
      placeholder = "Type a message...",
      isLoading = false,
      autoScroll = true,
      emptyTitle = "No messages yet",
      emptyDescription = "Start a conversation to see messages here",
      title,
      showAvatars = true,
      className,
      ...props
    },
    ref,
  ) => {
    const [localMessages, setLocalMessages] = React.useState<ChatMessage[]>(
      propMessages || [
        {
          id: "m-1",
          role: "assistant",
          content: "Hello! How can I help you today?",
        },
      ],
    );

    const isControlled = Boolean(propMessages);
    const messages = isControlled ? propMessages! : localMessages;

    const [inputValue, setInputValue] = React.useState("");

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      const text = inputValue.trim();
      if (!text || isLoading) return;

      setInputValue("");

      if (onSendMessage) {
        await onSendMessage(text);
      } else {
        const userMsg: ChatMessage = {
          id: `msg-${Date.now()}`,
          role: "user",
          content: text,
        };
        const assistantMsg: ChatMessage = {
          id: `msg-${Date.now() + 1}`,
          role: "assistant",
          content: `Echo: "${text}"`,
        };
        setLocalMessages((prev) => [...prev, userMsg, assistantMsg]);
      }
    };

    return (
      <div
        ref={ref}
        data-slot="chat-container"
        className={cn(
          "flex flex-col w-full rounded-xl border border-border/70 bg-card text-card-foreground shadow-xs overflow-hidden",
          className || "h-[400px] max-h-[600px]",
        )}
        {...props}
      >
        {title && (
          <div className="px-4 py-2.5 border-b border-border/40 bg-muted/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="size-4 text-primary" />
              <span className="font-semibold text-xs text-foreground">{typeof title === "string" ? title : (title ? String((title as any)?.target?.value ?? title) : "")}</span>
            </div>
            <span className="text-[10px] font-mono text-muted-foreground">
              {messages.length} {messages.length === 1 ? "message" : "messages"}
            </span>
          </div>
        )}

        <MessageScrollerProvider autoScroll={autoScroll}>
          <MessageScroller className="flex-1 min-h-0 relative">
            <MessageScrollerViewport>
              <MessageScrollerContent>
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground my-auto">
                    <Sparkles className="size-8 text-primary/40 mb-2" />
                    <h4 className="text-xs font-semibold text-foreground">{typeof emptyTitle === "string" ? emptyTitle : (emptyTitle ? String((emptyTitle as any)?.target?.value ?? emptyTitle) : "")}</h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{typeof emptyDescription === "string" ? emptyDescription : (emptyDescription ? String((emptyDescription as any)?.target?.value ?? emptyDescription) : "")}</p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isUser = msg.role === "user";
                    return (
                      <MessageScrollerItem
                        key={msg.id}
                        messageId={msg.id}
                        scrollAnchor={isUser}
                      >
                        <Message align={isUser ? "end" : "start"}>
                          <MessageContent align={isUser ? "end" : "start"}>
                            {showAvatars && (
                              <MessageAvatar
                                fallback={isUser ? "U" : "AI"}
                                className={isUser ? "order-last ml-1" : "mr-1"}
                              />
                            )}
                            <Bubble
                              align={isUser ? "end" : "start"}
                              variant={isUser ? "muted" : "default"}
                            >
                              <BubbleContent>{msg.content}</BubbleContent>
                            </Bubble>
                          </MessageContent>
                        </Message>
                      </MessageScrollerItem>
                    );
                  })
                )}
                {isLoading && (
                  <Message align="start">
                    <MessageContent>
                      {showAvatars && <MessageAvatar fallback="AI" className="mr-1" />}
                      <Bubble align="start" variant="default">
                        <BubbleContent className="flex items-center gap-1.5 py-2">
                          <span className="size-1.5 rounded-full bg-muted-foreground/60 animate-bounce" />
                          <span className="size-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0.2s]" />
                          <span className="size-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:0.4s]" />
                        </BubbleContent>
                      </Bubble>
                    </MessageContent>
                  </Message>
                )}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
          </MessageScroller>
        </MessageScrollerProvider>

        {/* Input Bar */}
        <form
          onSubmit={handleSubmit}
          className="p-3 border-t border-border/40 bg-background/50 flex items-center gap-2"
        >
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={placeholder}
            disabled={isLoading}
            className="flex-1 h-9 text-xs"
          />
          <Button
            type="submit"
            size="sm"
            disabled={!inputValue.trim() || isLoading}
            className="h-9 px-3 gap-1.5 text-xs shrink-0 cursor-pointer"
          >
            <Send className="size-3.5" />
            <span>Send</span>
          </Button>
        </form>
      </div>
    );
  },
);
Chat.displayName = "Chat";

export const ChatThread = Chat;
export default Chat;

