import { CompiledFile } from "@workspace/canvas/types";

/**
 * Emits shadcn AI Elements Chat components:
 * message-scroller, message, bubble, chat, ai-elements/chat.
 */
export function compileChatComponents(): CompiledFile[] {
  const files: CompiledFile[] = [];

  // 1. src/components/message-scroller.tsx
  const scrollerCode = "\"use client\";\n\nimport * as React from \"react\";\nimport { ArrowDown } from \"lucide-react\";\nimport { Button } from \"@workspace/ui/components/button\";\nimport { cn } from \"@workspace/ui/lib/utils\";\n\ninterface MessageScrollerContextValue {\n  isAtBottom: boolean;\n  scrollToBottom: (behavior?: ScrollBehavior) => void;\n  autoScroll: boolean;\n  setAutoScroll: (autoScroll: boolean) => void;\n  viewportRef: React.RefObject<HTMLDivElement | null>;\n  registerAnchor: (messageId: string, node: HTMLElement | null) => void;\n}\n\nconst MessageScrollerContext = React.createContext<MessageScrollerContextValue | null>(null);\n\nexport function useMessageScroller(): MessageScrollerContextValue {\n  const context = React.useContext(MessageScrollerContext);\n  if (!context) {\n    throw new Error(\"useMessageScroller must be used within a MessageScrollerProvider\");\n  }\n  return context;\n}\n\nexport interface MessageScrollerProviderProps {\n  autoScroll?: boolean;\n  children: React.ReactNode;\n  className?: string;\n}\n\nexport function MessageScrollerProvider({\n  autoScroll: initialAutoScroll = true,\n  children,\n}: MessageScrollerProviderProps) {\n  const [autoScroll, setAutoScroll] = React.useState(initialAutoScroll);\n  const [isAtBottom, setIsAtBottom] = React.useState(true);\n  const viewportRef = React.useRef<HTMLDivElement | null>(null);\n  const anchorsRef = React.useRef<Map<string, HTMLElement>>(new Map());\n\n  const scrollToBottom = React.useCallback((behavior: ScrollBehavior = \"smooth\") => {\n    const el = viewportRef.current;\n    if (el) {\n      el.scrollTo({\n        top: el.scrollHeight,\n        behavior,\n      });\n      setIsAtBottom(true);\n    }\n  }, []);\n\n  const registerAnchor = React.useCallback((messageId: string, node: HTMLElement | null) => {\n    if (node) {\n      anchorsRef.current.set(messageId, node);\n    } else {\n      anchorsRef.current.delete(messageId);\n    }\n  }, []);\n\n  const contextValue = React.useMemo<MessageScrollerContextValue>(\n    () => ({\n      isAtBottom,\n      scrollToBottom,\n      autoScroll,\n      setAutoScroll,\n      viewportRef,\n      registerAnchor,\n    }),\n    [isAtBottom, scrollToBottom, autoScroll, registerAnchor],\n  );\n\n  return (\n    <MessageScrollerContext.Provider value={contextValue}>\n      {children}\n    </MessageScrollerContext.Provider>\n  );\n}\n\nexport interface MessageScrollerProps extends React.HTMLAttributes<HTMLDivElement> {}\n\nexport const MessageScroller = React.forwardRef<HTMLDivElement, MessageScrollerProps>(\n  ({ className, children, ...props }, ref) => {\n    return (\n      <div\n        ref={ref}\n        data-slot=\"message-scroller\"\n        className={cn(\"relative flex flex-col w-full h-full min-h-0 overflow-hidden\", className)}\n        {...props}\n      >\n        {children}\n      </div>\n    );\n  },\n);\nMessageScroller.displayName = \"MessageScroller\";\n\nexport interface MessageScrollerViewportProps extends React.HTMLAttributes<HTMLDivElement> {}\n\nexport const MessageScrollerViewport = React.forwardRef<HTMLDivElement, MessageScrollerViewportProps>(\n  ({ className, children, onScroll, ...props }, ref) => {\n    const { viewportRef, autoScroll, scrollToBottom } = useMessageScroller();\n    const internalRef = React.useRef<HTMLDivElement | null>(null);\n\n    React.useImperativeHandle<HTMLDivElement | null, HTMLDivElement | null>(\n      ref,\n      () => internalRef.current,\n    );\n\n    const checkIsAtBottom = React.useCallback(() => {\n      const el = internalRef.current;\n      if (!el) return true;\n      const threshold = 32;\n      return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;\n    }, []);\n\n    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {\n      onScroll?.(e);\n      const atBottom = checkIsAtBottom();\n      const ctx = viewportRef.current;\n      if (ctx) {\n        // internal update\n      }\n    };\n\n    // Auto-scroll on content updates when at bottom\n    React.useEffect(() => {\n      const el = internalRef.current;\n      if (!el) return;\n\n      const observer = new MutationObserver(() => {\n        if (autoScroll && checkIsAtBottom()) {\n          scrollToBottom(\"smooth\");\n        }\n      });\n\n      observer.observe(el, { childList: true, subtree: true, characterData: true });\n      return () => observer.disconnect();\n    }, [autoScroll, checkIsAtBottom, scrollToBottom]);\n\n    return (\n      <div\n        ref={(node) => {\n          internalRef.current = node;\n          (viewportRef as React.MutableRefObject<HTMLDivElement | null>).current = node;\n        }}\n        data-slot=\"message-scroller-viewport\"\n        onScroll={handleScroll}\n        className={cn(\"flex-1 w-full overflow-y-auto overflow-x-hidden min-h-0 scroll-smooth\", className)}\n        {...props}\n      >\n        {children}\n      </div>\n    );\n  },\n);\nMessageScrollerViewport.displayName = \"MessageScrollerViewport\";\n\nexport interface MessageScrollerContentProps extends React.HTMLAttributes<HTMLDivElement> {}\n\nexport const MessageScrollerContent = React.forwardRef<HTMLDivElement, MessageScrollerContentProps>(\n  ({ className, children, ...props }, ref) => {\n    return (\n      <div\n        ref={ref}\n        data-slot=\"message-scroller-content\"\n        className={cn(\"flex flex-col gap-3 p-4\", className)}\n        {...props}\n      >\n        {children}\n      </div>\n    );\n  },\n);\nMessageScrollerContent.displayName = \"MessageScrollerContent\";\n\nexport interface MessageScrollerItemProps extends React.HTMLAttributes<HTMLDivElement> {\n  messageId?: string;\n  scrollAnchor?: boolean;\n}\n\nexport const MessageScrollerItem = React.forwardRef<HTMLDivElement, MessageScrollerItemProps>(\n  ({ className, messageId, scrollAnchor, children, ...props }, ref) => {\n    const { registerAnchor } = useMessageScroller();\n    const itemRef = React.useRef<HTMLDivElement | null>(null);\n\n    React.useEffect(() => {\n      if (scrollAnchor && messageId && itemRef.current) {\n        registerAnchor(messageId, itemRef.current);\n      }\n      return () => {\n        if (messageId) {\n          registerAnchor(messageId, null);\n        }\n      };\n    }, [scrollAnchor, messageId, registerAnchor]);\n\n    return (\n      <div\n        ref={(node) => {\n          itemRef.current = node;\n          if (typeof ref === \"function\") ref(node);\n          else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;\n        }}\n        data-slot=\"message-scroller-item\"\n        data-message-id={messageId}\n        data-scroll-anchor={scrollAnchor ? \"true\" : undefined}\n        className={cn(\"w-full\", className)}\n        {...props}\n      >\n        {children}\n      </div>\n    );\n  },\n);\nMessageScrollerItem.displayName = \"MessageScrollerItem\";\n\nexport interface MessageScrollerButtonProps\n  extends Omit<React.ComponentProps<typeof Button>, \"onClick\"> {\n  className?: string;\n}\n\nexport function MessageScrollerButton({\n  className,\n  size = \"icon\",\n  variant = \"outline\",\n  ...props\n}: MessageScrollerButtonProps) {\n  const { isAtBottom, scrollToBottom } = useMessageScroller();\n\n  if (isAtBottom) {\n    return null;\n  }\n\n  return (\n    <Button\n      type=\"button\"\n      size={size}\n      variant={variant}\n      onClick={() => scrollToBottom(\"smooth\")}\n      className={cn(\n        \"absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full shadow-md bg-background/90 hover:bg-muted backdrop-blur-xs border border-border/60 transition-all z-20 size-8\",\n        className,\n      )}\n      aria-label=\"Scroll to bottom\"\n      {...props}\n    >\n      <ArrowDown className=\"size-4 text-foreground\" />\n    </Button>\n  );\n}\n\n";
  files.push({
    filename: "src/components/message-scroller.tsx",
    language: "typescript",
    content: scrollerCode,
  });

  // 2. src/components/message.tsx
  const messageCode = "\"use client\";\n\nimport * as React from \"react\";\nimport { cn } from \"@workspace/ui/lib/utils\";\nimport { Avatar, AvatarFallback, AvatarImage } from \"@workspace/ui/components/avatar\";\n\nexport interface MessageProps extends React.HTMLAttributes<HTMLDivElement> {\n  align?: \"start\" | \"end\";\n}\n\nexport const Message = React.forwardRef<HTMLDivElement, MessageProps>(\n  ({ className, align = \"start\", children, ...props }, ref) => {\n    return (\n      <div\n        ref={ref}\n        data-slot=\"message\"\n        data-align={align}\n        className={cn(\n          \"flex w-full flex-col gap-1 py-1\",\n          align === \"end\" ? \"items-end\" : \"items-start\",\n          className,\n        )}\n        {...props}\n      >\n        {children}\n      </div>\n    );\n  },\n);\nMessage.displayName = \"Message\";\n\nexport interface MessageContentProps extends React.HTMLAttributes<HTMLDivElement> {\n  align?: \"start\" | \"end\";\n}\n\nexport const MessageContent = React.forwardRef<HTMLDivElement, MessageContentProps>(\n  ({ className, align, children, ...props }, ref) => {\n    return (\n      <div\n        ref={ref}\n        data-slot=\"message-content\"\n        className={cn(\n          \"flex items-start gap-2 max-w-[85%] sm:max-w-[75%]\",\n          align === \"end\" ? \"flex-row-reverse\" : \"flex-row\",\n          className,\n        )}\n        {...props}\n      >\n        {children}\n      </div>\n    );\n  },\n);\nMessageContent.displayName = \"MessageContent\";\n\nexport interface MessageAvatarProps extends React.ComponentProps<typeof Avatar> {\n  src?: string;\n  fallback?: string;\n}\n\nexport const MessageAvatar = React.forwardRef<HTMLSpanElement, MessageAvatarProps>(\n  ({ className, src, fallback = \"AI\", ...props }, ref) => {\n    return (\n      <Avatar\n        ref={ref}\n        data-slot=\"message-avatar\"\n        className={cn(\"size-7 shrink-0 text-[10px] font-semibold border border-border/40\", className)}\n        {...props}\n      >\n        {src && <AvatarImage src={src} alt=\"Avatar\" />}\n        <AvatarFallback className=\"bg-primary/10 text-primary\">{fallback}</AvatarFallback>\n      </Avatar>\n    );\n  },\n);\nMessageAvatar.displayName = \"MessageAvatar\";\n\n";
  files.push({
    filename: "src/components/message.tsx",
    language: "typescript",
    content: messageCode,
  });

  // 3. src/components/bubble.tsx
  const bubbleCode = "\"use client\";\n\nimport * as React from \"react\";\nimport { cva, type VariantProps } from \"class-variance-authority\";\nimport { cn } from \"@workspace/ui/lib/utils\";\n\nconst bubbleVariants = cva(\n  \"relative rounded-2xl text-xs sm:text-sm transition-colors shadow-2xs break-words\",\n  {\n    variants: {\n      align: {\n        start: \"rounded-tl-xs\",\n        end: \"rounded-tr-xs\",\n      },\n      variant: {\n        default: \"bg-muted/80 text-foreground border border-border/40\",\n        muted: \"bg-primary text-primary-foreground\",\n        secondary: \"bg-secondary text-secondary-foreground border border-border/30\",\n        outline: \"bg-background text-foreground border border-border/60\",\n      },\n    },\n    compoundVariants: [\n      {\n        align: \"end\",\n        variant: \"muted\",\n        className: \"bg-primary text-primary-foreground shadow-xs\",\n      },\n    ],\n    defaultVariants: {\n      align: \"start\",\n      variant: \"default\",\n    },\n  },\n);\n\nexport interface BubbleProps\n  extends React.HTMLAttributes<HTMLDivElement>,\n    VariantProps<typeof bubbleVariants> {}\n\nexport const Bubble = React.forwardRef<HTMLDivElement, BubbleProps>(\n  ({ className, align = \"start\", variant = \"default\", children, ...props }, ref) => {\n    return (\n      <div\n        ref={ref}\n        data-slot=\"bubble\"\n        data-align={align}\n        data-variant={variant}\n        className={cn(bubbleVariants({ align, variant }), className)}\n        {...props}\n      >\n        {children}\n      </div>\n    );\n  },\n);\nBubble.displayName = \"Bubble\";\n\nexport interface BubbleContentProps extends React.HTMLAttributes<HTMLDivElement> {}\n\nexport const BubbleContent = React.forwardRef<HTMLDivElement, BubbleContentProps>(\n  ({ className, children, ...props }, ref) => {\n    return (\n      <div\n        ref={ref}\n        data-slot=\"bubble-content\"\n        className={cn(\"px-3.5 py-2 leading-relaxed whitespace-pre-wrap break-words\", className)}\n        {...props}\n      >\n        {children}\n      </div>\n    );\n  },\n);\nBubbleContent.displayName = \"BubbleContent\";\n\n";
  files.push({
    filename: "src/components/bubble.tsx",
    language: "typescript",
    content: bubbleCode,
  });

  // 4. src/components/chat.tsx
  const chatCode = `"use client";

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
  const idVal = msg.id || \`msg-\${idx}\`;
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
          id: \`msg-\${Date.now()}\`,
          role: "user",
          content: text,
        };
        const assistantMsg: ChatMessage = {
          id: \`msg-\${Date.now() + 1}\`,
          role: "assistant",
          content: \`Echo: "\${text}"\`,
        };
        setLocalMessages((prev) => [...prev, userMsg, assistantMsg]);
      }
    };

    const isFloating = alignment === "floating-right" || alignment === "floating-left";
    const isCard = variant === "card" || isFloating;
    const isFull = alignment === "full" || maxWidth === "full";

    // Chat panel max width
    let maxWClass = "max-w-3xl";
    if (maxWidth === "sm") maxWClass = "max-w-md";
    else if (maxWidth === "md") maxWClass = "max-w-xl";
    else if (maxWidth === "lg") maxWClass = "max-w-2xl";
    else if (maxWidth === "xl") maxWClass = "max-w-3xl";
    else if (maxWidth === "2xl") maxWClass = "max-w-4xl";

    // Alignment and boundary border styles:
    // - Full-width: stretches 100% edge-to-edge with no side borders
    // - Right-aligned: border-l (left border dividing from content) and pinned to the right
    // - Left-aligned: border-r (right border dividing from content) and pinned to the left
    // - Center-aligned: border-x (framed center column)
    let layoutAlignmentClass = "self-center mx-auto border-x border-border/40";
    if (isFull) {
      layoutAlignmentClass = "self-stretch w-full max-w-full border-x-0";
    } else if (alignment === "left") {
      layoutAlignmentClass = "self-start mr-auto border-r border-border/60";
    } else if (alignment === "right") {
      layoutAlignmentClass = "self-end ml-auto border-l border-border/60";
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
                !isFloating && !isFull && maxWClass,
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
`;
  files.push({
    filename: "src/components/chat.tsx",
    language: "typescript",
    content: chatCode,
  });

  // 5. src/components/ai-elements/chat.tsx
  const aiChatCode = "\"use client\";\n\nexport * from \"../chat\";\nexport { default } from \"../chat\";\n\n";
  files.push({
    filename: "src/components/ai-elements/chat.tsx",
    language: "typescript",
    content: aiChatCode,
  });

  return files;
}
