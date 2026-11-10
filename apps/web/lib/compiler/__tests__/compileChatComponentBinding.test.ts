import { describe, it, expect } from "vitest";
import { compileWebPageNodes } from "../compileWebPageNode";
import { generateCustomTypesModule } from "../generators/typesGenerator";
import { CHAT_MESSAGE_CUSTOM_TYPE } from "@/app/(canvas)/project/[projectId]/_components/backend-nodes/graph-nodes/nodes/compute/TypesNode";
import { BackendNode } from "@/types/canvas";

describe("Chat component binding compilation (shadcn AI Elements)", () => {
  it("compiles a WebPageNode with chat component binding into Next.js 16 page with @workspace/ui Chat component", () => {
    const webPageNode: BackendNode = {
      id: "node-page-ai-chat",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "/assistant",
        path: "/assistant",
        appSlug: "web",
        sections: [
          {
            id: "sec-chat",
            name: "Assistant Thread",
            renderMode: "client",
            loadStrategy: "eager",
            actions: [
              {
                id: "act-send",
                name: "onSendMessage",
                event: "submit",
                description: "Dispatches user query to LLM endpoint",
              },
            ],
            states: [
              {
                id: "st-messages",
                name: "messages",
                type: "array",
                defaultValue: [],
                description: "Active message history",
              },
            ],
            componentBindings: [
              {
                id: "comp-ai-chat",
                name: "AIChat",
                componentType: "chat",
                label: "AI Chat Thread",
                variant: "default",
                actionId: "act-send",
                actionName: "onSendMessage",
                triggerEvent: "submit",
                valueStateName: "messages",
                valueSourceType: "local",
                propMappings: {
                  chatTitle: "AI Support Agent",
                  chatPlaceholder: "Ask anything about your project...",
                  chatAutoScroll: true,
                  chatShowScrollButton: true,
                  chatEmptyTitle: "Welcome to AI Support",
                  chatEmptyDescription: "Type your query below to start.",
                  chatShowAvatars: true,
                },
              },
            ],
          },
        ],
      },
    };

    const result = compileWebPageNodes([webPageNode], [], [], [webPageNode], []);

    // Verify section component file is generated
    const sectionFile = result.files.find(
      (f) => f.filename.includes("Section.tsx") || f.filename.includes("Thread"),
    );
    expect(sectionFile).toBeDefined();

    const code = sectionFile!.content;

    // 1. Verify import of Chat from @workspace/ui/components/chat
    expect(code).toContain('import { Chat } from "@workspace/ui/components/chat";');

    // 2. Verify Chat element rendering with props
    expect(code).toContain('<Chat');
    expect(code).toContain('title="AI Support Agent"');
    expect(code).toContain('placeholder="Ask anything about your project..."');
    expect(code).toContain('emptyTitle="Welcome to AI Support"');
    expect(code).toContain('emptyDescription="Type your query below to start."');
    expect(code).toContain('autoScroll={true}');
    expect(code).toContain('showAvatars={true}');

    // 3. Verify messages binding to state
    expect(code).toContain('messages={Array.isArray(messages) ? messages : undefined}');

    // 4. Verify onSendMessage handler dispatching onTrigger
    expect(code).toContain('onSendMessage={async (text) => {');
    expect(code).toContain('await onTrigger("onSendMessage", "submit"');
    expect(code).toContain('{ message: text }');
  });

  it("compiles a WebPageNode with ChatStore state binding using useChatStore hook and safe type casting", () => {
    const webPageNode: BackendNode = {
      id: "node-page-chat-id",
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "/chat/[id]",
        path: "/chat/[id]",
        appSlug: "web",
        sections: [
          {
            id: "sec-main",
            name: "Main Section",
            renderMode: "client",
            loadStrategy: "eager",
            actions: [
              {
                id: "act-submit",
                name: "onSubmitPrompt",
                event: "submit",
              },
            ],
            componentBindings: [
              {
                id: "comp-chat-thread",
                name: "AIChat",
                componentType: "chat",
                label: "AI Chat Thread",
                variant: "default",
                actionId: "act-submit",
                actionName: "onSubmitPrompt",
                triggerEvent: "submit",
                propMappings: {
                  chatTitle: "Dezign2App Assistant",
                  chatMessagesBinding: "messages",
                  chatMessagesStoreName: "ChatStore",
                  chatInputBinding: "chatInput",
                  chatInputStoreName: "ChatStore",
                },
              },
            ],
          },
        ],
      },
    };

    const result = compileWebPageNodes([webPageNode], [], [], [webPageNode], []);

    const sectionFile = result.files.find((f) => f.filename.includes("MainSection.tsx"));
    expect(sectionFile).toBeDefined();

    const code = sectionFile!.content;

    // Verify import of Chat component
    expect(code).toContain('import { Chat } from "@workspace/ui/components/chat";');

    // Verify Zustand store hook call for messages
    expect(code).toContain("const messages = useChatStore((s) => s.messages);");

    // Verify clean, strongly-typed prop passing without any 'as' type casts
    expect(code).toContain("messages={Array.isArray(messages) ? messages : undefined}");
    expect(code).not.toContain("as any");
    expect(code).not.toContain("as unknown");
  });

  it("generates strict ChatMessage interface from TypesNode with canonical union role and zero any/unknown", () => {
    const typesNode: BackendNode = {
      id: "node-types-app",
      type: "types",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "App Types",
        types: [CHAT_MESSAGE_CUSTOM_TYPE],
      },
    };

    const res = generateCustomTypesModule([typesNode]);
    expect(res.file).toBeDefined();

    const content = res.file!.content;
    // Canonical role union
    expect(content).toContain('role: "user" | "assistant" | "system";');
    expect(content).toContain('export interface ChatMessage {');
    // Ensure strict typing with 0 any and 0 unknown in custom types definition
    expect(content).not.toContain("role: any");
    expect(content).not.toContain("role: unknown");
    expect(content).not.toContain("role: string;");
  });

  it("compiles Chat component with alignment presets (center, left, right, full, floating)", () => {
    const createPageWithChatAlignment = (alignment: string, maxWidth?: string, height?: string): BackendNode => ({
      id: `node-page-chat-${alignment}`,
      type: "webPage",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: `/chat-${alignment}`,
        path: `/chat-${alignment}`,
        appSlug: "web",
        sections: [
          {
            id: `sec-${alignment}`,
            name: `${alignment} Thread`,
            renderMode: "client",
            loadStrategy: "eager",
            actions: [],
            componentBindings: [
              {
                id: `comp-chat-${alignment}`,
                name: "AIChat",
                componentType: "chat",
                label: "AI Chat",
                propMappings: {
                  chatAlignment: alignment as any,
                  ...(maxWidth ? { chatMaxWidth: maxWidth as any } : {}),
                  ...(height ? { chatHeight: height as any } : {}),
                },
              },
            ],
          },
        ],
      },
    });

    // 1. Center alignment (Default takes full viewport height)
    const centerNode = createPageWithChatAlignment("center");
    const centerRes = compileWebPageNodes([centerNode], [], [], [centerNode], []);
    const centerSection = centerRes.files.find((f) => f.filename.includes("Thread"));
    expect(centerSection?.content).toContain('className="w-full max-w-2xl mx-auto h-[calc(100vh-8rem)]"');

    // 2. Left alignment
    const leftNode = createPageWithChatAlignment("left");
    const leftRes = compileWebPageNodes([leftNode], [], [], [leftNode], []);
    const leftSection = leftRes.files.find((f) => f.filename.includes("Thread"));
    expect(leftSection?.content).toContain('className="w-full max-w-2xl mr-auto h-[calc(100vh-8rem)]"');

    // 3. Right alignment
    const rightNode = createPageWithChatAlignment("right");
    const rightRes = compileWebPageNodes([rightNode], [], [], [rightNode], []);
    const rightSection = rightRes.files.find((f) => f.filename.includes("Thread"));
    expect(rightSection?.content).toContain('className="w-full max-w-2xl ml-auto h-[calc(100vh-8rem)]"');

    // 4. Full width alignment
    const fullNode = createPageWithChatAlignment("full");
    const fullRes = compileWebPageNodes([fullNode], [], [], [fullNode], []);
    const fullSection = fullRes.files.find((f) => f.filename.includes("Thread"));
    expect(fullSection?.content).toContain('className="w-full h-[calc(100vh-8rem)]"');

    // 5. Floating bottom-right preset (defaults to 520px height)
    const floatingNode = createPageWithChatAlignment("floating-right");
    const floatingRes = compileWebPageNodes([floatingNode], [], [], [floatingNode], []);
    const floatingSection = floatingRes.files.find((f) => f.filename.includes("Thread"));
    expect(floatingSection?.content).toContain('className="fixed bottom-6 right-6 w-96 max-w-[calc(100vw-2rem)] shadow-2xl z-50 rounded-2xl h-[520px]"');

    // 6. Custom width and height
    const customNode = createPageWithChatAlignment("center", "2xl", "lg");
    const customRes = compileWebPageNodes([customNode], [], [], [customNode], []);
    const customSection = customRes.files.find((f) => f.filename.includes("Thread"));
    expect(customSection?.content).toContain('className="w-full max-w-4xl mx-auto h-[640px]"');
  });
});
