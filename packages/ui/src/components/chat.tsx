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
} from "@workspace/ui/components/message-scroller";
import { Message, MessageContent, MessageAvatar } from "@workspace/ui/components/message";
import { Bubble, BubbleContent } from "@workspace/ui/components/bubble";

// Re-export all primitives
export * from "@workspace/ui/components/message-scroller";
export * from "@workspace/ui/components/message";
export * from "@workspace/ui/components/bubble";

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
  id?: string;
  role?: "user" | "assistant" | "system" | string;
  sender?: "AI" | "USER" | "SYSTEM" | "user" | "assistant" | "system" | string;
  content?: string;
  text?: string;
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
  alignment?: "center" | "left" | "right" | "full" | "floating-right" | "floating-left" | string;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "full" | string;
  variant?: "default" | "fullscreen" | "card" | "embedded" | string;
}

interface NormalizedChatMessage {
  id: string;
  isUser: boolean;
  content: string;
}

function normalizeMessage(msg: ChatMessage, idx: number): NormalizedChatMessage {
  const roleVal = msg.role || msg.sender || "";
  const isUser = roleVal.toLowerCase() === "user";
  const idVal = msg.id || `msg-${idx}`;
  const contentVal = msg.content ?? msg.text ?? "";
  return { id: idVal, isUser, content: contentVal };
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
      alignment = "center",
      maxWidth = "xl",
      variant = "default",
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

    const isFloating = alignment === "floating-right" || alignment === "floating-left";
    const isCard = variant === "card" || isFloating;

    // Chat panel max width
    let maxWClass = "max-w-3xl";
    if (maxWidth === "sm") maxWClass = "max-w-md";
    else if (maxWidth === "md") maxWClass = "max-w-xl";
    else if (maxWidth === "lg") maxWClass = "max-w-2xl";
    else if (maxWidth === "xl") maxWClass = "max-w-3xl";
    else if (maxWidth === "2xl") maxWClass = "max-w-4xl";
    else if (maxWidth === "full") maxWClass = "max-w-full";

    // Alignment and boundary border styles:
    // - Right-aligned: border-l (left border dividing from content) and pinned to the right
    // - Left-aligned: border-r (right border dividing from content) and pinned to the left
    // - Center-aligned: border-x (framed center column)
    // - Full-width: border-x-0 stretching edge-to-edge
    let layoutAlignmentClass = "self-center mx-auto border-x border-border/40";
    if (alignment === "left") {
      layoutAlignmentClass = "self-start mr-auto border-r border-border/60";
    } else if (alignment === "right") {
      layoutAlignmentClass = "self-end ml-auto border-l border-border/60";
    } else if (alignment === "full" || maxWidth === "full") {
      layoutAlignmentClass = "self-stretch w-full border-x-0";
    } else if (isFloating) {
      layoutAlignmentClass = alignment === "floating-right"
        ? "fixed bottom-6 right-6 w-96 max-w-[calc(100vw-2rem)] shadow-2xl z-50 rounded-2xl border border-border/80 h-[520px]"
        : "fixed bottom-6 left-6 w-96 max-w-[calc(100vw-2rem)] shadow-2xl z-50 rounded-2xl border border-border/80 h-[520px]";
    }

    return (
      <div
        ref={ref}
        data-slot="chat-container"
        className={cn(
          isCard
            ? "flex flex-col w-full rounded-xl border border-border/70 bg-card text-card-foreground shadow-xs overflow-hidden"
            : cn(
                "flex flex-col w-full h-full flex-1 min-h-0 bg-background text-foreground transition-all duration-150 overflow-hidden",
                !isFloating && maxWClass,
                layoutAlignmentClass,
              ),
          className,
        )}
        {...props}
      >
        {title && (
          <div className="w-full h-12 border-b border-border/40 bg-background/80 backdrop-blur px-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="size-6 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Bot className="size-3.5" />
              </div>
              <span className="font-semibold text-xs text-foreground">
                {typeof title === "string" ? title : String(title ?? "")}
              </span>
            </div>
            <span className="text-[10px] font-mono text-muted-foreground">
              {messages.length} {messages.length === 1 ? "message" : "messages"}
            </span>
          </div>
        )}

        <MessageScrollerProvider autoScroll={autoScroll}>
          <MessageScroller className="flex-1 min-h-0 relative">
            <MessageScrollerViewport className="flex-1 w-full overflow-y-auto">
              <MessageScrollerContent className="py-6 px-4 min-h-full flex flex-col justify-between w-full">
                {messages.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-muted-foreground my-auto">
                    <div className="size-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-3 text-primary">
                      <Sparkles className="size-6" />
                    </div>
                    <h4 className="text-base font-semibold text-foreground">
                      {typeof emptyTitle === "string" ? emptyTitle : String(emptyTitle ?? "")}
                    </h4>
                    <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                      {typeof emptyDescription === "string" ? emptyDescription : String(emptyDescription ?? "")}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 w-full">
                    {messages.map((rawMsg, idx) => {
                      const msg = normalizeMessage(rawMsg, idx);
                      return (
                        <MessageScrollerItem
                          key={msg.id}
                          messageId={msg.id}
                          scrollAnchor={msg.isUser}
                        >
                          <Message align={msg.isUser ? "end" : "start"}>
                            <MessageContent align={msg.isUser ? "end" : "start"}>
                              {showAvatars && (
                                <MessageAvatar
                                  fallback={msg.isUser ? "U" : "AI"}
                                  className={msg.isUser ? "order-last ml-1" : "mr-1"}
                                />
                              )}
                              <Bubble
                                align={msg.isUser ? "end" : "start"}
                                variant={msg.isUser ? "muted" : "default"}
                              >
                                <BubbleContent>{msg.content}</BubbleContent>
                              </Bubble>
                            </MessageContent>
                          </Message>
                        </MessageScrollerItem>
                      );
                    })}
                  </div>
                )}
                {isLoading && (
                  <div className="pt-2 w-full">
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
                  </div>
                )}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
          </MessageScroller>
        </MessageScrollerProvider>

        {/* Input Bar */}
        <div className="w-full shrink-0 bg-background/80 backdrop-blur p-4 pb-6 pt-2 border-t border-border/30">
          <form
            onSubmit={handleSubmit}
            className="w-full"
          >
            <div className="w-full relative flex items-center rounded-2xl border border-border/80 bg-muted/40 shadow-xs focus-within:border-ring focus-within:ring-1 focus-within:ring-ring transition-all px-3.5 py-1.5 gap-2">
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={placeholder}
                disabled={isLoading}
                className="flex-1 bg-transparent border-0 shadow-none focus-visible:ring-0 text-xs h-8 p-0 placeholder:text-muted-foreground/70"
              />
              <Button
                type="submit"
                size="sm"
                disabled={!inputValue.trim() || isLoading}
                className="h-7 px-3 gap-1.5 text-xs rounded-xl shrink-0 cursor-pointer shadow-xs"
              >
                <Send className="size-3" />
                <span>Send</span>
              </Button>
            </div>
          </form>
        </div>
      </div>
    );
  },
);
Chat.displayName = "Chat";

export const ChatThread = Chat;
export default Chat;

