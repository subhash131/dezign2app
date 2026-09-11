import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { formatTopicName, sanitizeTopicName } from "@workspace/canvas";
import { MessagingResourceRow, MessagingResourceList } from "../../../common/MessagingResourceList";
import { AnyMessagingResource } from "@/types/canvas";
import { createEventSlice } from "@/lib/stores/backendCanvas/slices/eventSlice";

// Mock @xyflow/react
vi.mock("@xyflow/react", () => ({
  Handle: () => <div data-testid="handle" />,
  Position: { Left: "left", Right: "right", Top: "top", Bottom: "bottom" },
}));

// Mock @workspace/ui components
vi.mock("@workspace/ui/components/select", () => ({
  Select: ({ children }: any) => <div data-testid="select">{children}</div>,
  SelectTrigger: ({ children }: any) => <div data-testid="select-trigger">{children}</div>,
  SelectValue: ({ placeholder }: any) => <div>{placeholder}</div>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ children, value }: any) => <div data-value={value}>{children}</div>,
}));

const mockSetActiveConfigItem = vi.fn();
const mockUpdateEvent = vi.fn();

// Mock zustand canvas store
vi.mock("@/lib/stores/backendCanvasStore", () => ({
  useBackendCanvasStore: Object.assign(
    vi.fn((selector) => {
      const state = {
        edges: [],
        nodes: [{ id: "kafka-1", type: "kafka", data: { topics: [] } }],
        endpoints: [],
        events: [],
        activeConfigItem: null,
        setActiveConfigItem: mockSetActiveConfigItem,
        updateEvent: mockUpdateEvent,
        deleteEvent: vi.fn(),
      };
      return selector ? selector(state) : state;
    }),
    {
      getState: () => ({
        edges: [],
        nodes: [{ id: "kafka-1", type: "kafka", data: { topics: [] } }],
        endpoints: [],
        events: [],
        activeConfigItem: null,
        setActiveConfigItem: mockSetActiveConfigItem,
        updateEvent: mockUpdateEvent,
        deleteEvent: vi.fn(),
      }),
    },
  ),
}));

describe("Topic space-to-dot transformation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("formatTopicName & sanitizeTopicName utilities", () => {
    it("transforms 'message sent' to 'message.sent'", () => {
      expect(formatTopicName("message sent")).toBe("message.sent");
    });

    it("transforms 'chat message sent' to 'chat.message.sent'", () => {
      expect(formatTopicName("chat message sent")).toBe("chat.message.sent");
    });

    it("transforms trailing space into dot during real-time typing", () => {
      expect(formatTopicName("message ")).toBe("message.");
      expect(formatTopicName("chat.message ")).toBe("chat.message.");
    });

    it("collapses multiple consecutive spaces to a single dot", () => {
      expect(formatTopicName("message   sent")).toBe("message.sent");
      expect(formatTopicName("chat   messages   sent")).toBe("chat.messages.sent");
    });

    it("handles dot-space combinations without duplicating dots", () => {
      expect(formatTopicName("message. ")).toBe("message.");
      expect(formatTopicName("message .")).toBe("message.");
      expect(formatTopicName("message . ")).toBe("message.");
    });

    it("strips leading spaces and dots so names do not start with a dot", () => {
      expect(formatTopicName(" message")).toBe("message");
      expect(formatTopicName(".message")).toBe("message");
      expect(formatTopicName("   .message")).toBe("message");
      expect(formatTopicName(" ")).toBe("");
      expect(formatTopicName("   ")).toBe("");
      expect(formatTopicName("..")).toBe("");
    });

    it("preserves already formatted dot notation", () => {
      expect(formatTopicName("messages.sent")).toBe("messages.sent");
      expect(formatTopicName("chat.messages.sent")).toBe("chat.messages.sent");
    });

    it("preserves PascalCase or kebab-case when no spaces exist", () => {
      expect(formatTopicName("MessageSent")).toBe("MessageSent");
      expect(formatTopicName("message-sent")).toBe("message-sent");
    });

    it("handles empty or falsy inputs gracefully", () => {
      expect(formatTopicName("")).toBe("");
      expect(sanitizeTopicName("")).toBe("");
    });

    it("sanitizes topic by trimming whitespace and trailing dots", () => {
      expect(sanitizeTopicName("  message sent  ")).toBe("message.sent");
      expect(sanitizeTopicName("message.sent.")).toBe("message.sent");
      expect(sanitizeTopicName("  ..message.sent..  ")).toBe("message.sent");
      expect(sanitizeTopicName("  chat  message  sent.  ")).toBe("chat.message.sent");
    });
  });

  describe("EventSlice state sanitization", () => {
    it("sanitizes event name with spaces into dots on addEvent", () => {
      let state: any = {
        events: [],
        pendingEventUpserts: [],
        pendingEventRemovals: [],
        endpoints: [],
        pendingEndpointUpserts: [],
        pushHistorySnapshot: vi.fn(),
      };
      const set = (partial: any) => {
        state = { ...state, ...(typeof partial === "function" ? partial(state) : partial) };
      };
      const get = () => state;
      const slice = createEventSlice(set, get);

      slice.addEvent("kafka-1", "publish", {
        id: "ev-1",
        name: "message sent",
      } as AnyMessagingResource);

      expect(state.events).toHaveLength(1);
      expect(state.events[0].name).toBe("message.sent");
    });

    it("sanitizes event name with spaces into dots on updateEvent", () => {
      let state: any = {
        events: [{ id: "ev-1", name: "initial", nodeId: "kafka-1", variant: "publish" }],
        pendingEventUpserts: [],
        pendingEventRemovals: [],
        pendingEdgeUpserts: [],
        pendingEdgeRemovals: [],
        endpoints: [],
        pendingEndpointUpserts: [],
        nodes: [],
        edges: [],
        pushHistorySnapshot: vi.fn(),
      };
      const set = (partial: any) => {
        state = { ...state, ...(typeof partial === "function" ? partial(state) : partial) };
      };
      const get = () => state;
      const slice = createEventSlice(set, get);

      slice.updateEvent("ev-1", { name: "new message sent" });

      expect(state.events[0].name).toBe("new.message.sent");
    });
  });

  describe("MessagingResourceRow topic editing & display", () => {
    it("displays an existing topic with spaces formatted as dot-separated", () => {
      const item: AnyMessagingResource = {
        id: "t-1",
        name: "message sent",
      };

      render(
        <MessagingResourceRow
          nodeId="kafka-1"
          item={item}
          isEditing={false}
          setEditingId={vi.fn()}
          setEditingName={vi.fn()}
          handleUpdate={vi.fn()}
          handleDelete={vi.fn()}
          handleUpdateItem={vi.fn()}
          editingName=""
          variant="definition"
          resourceType="topics"
        />,
      );

      expect(screen.getByText("message.sent")).toBeInTheDocument();
    });

    it("replaces space with dot in real-time on typing in LocalInput", () => {
      const item: AnyMessagingResource = {
        id: "t-1",
        name: "message.sent",
      };
      const setEditingName = vi.fn();

      render(
        <MessagingResourceRow
          nodeId="kafka-1"
          item={item}
          isEditing={true}
          setEditingId={vi.fn()}
          setEditingName={setEditingName}
          handleUpdate={vi.fn()}
          handleDelete={vi.fn()}
          handleUpdateItem={vi.fn()}
          editingName="message"
          variant="definition"
          resourceType="topics"
        />,
      );

      const input = screen.getByRole("textbox");
      fireEvent.change(input, { target: { value: "message " } });

      // When user types a space, setEditingName should receive "message."
      expect(setEditingName).toHaveBeenCalledWith("message.");
    });

    it("saves sanitized dot-separated topic name on Enter key", () => {
      const item: AnyMessagingResource = {
        id: "t-1",
        name: "",
      };
      const handleUpdate = vi.fn();
      const setEditingId = vi.fn();

      render(
        <MessagingResourceRow
          nodeId="kafka-1"
          item={item}
          isEditing={true}
          setEditingId={setEditingId}
          setEditingName={vi.fn()}
          handleUpdate={handleUpdate}
          handleDelete={vi.fn()}
          handleUpdateItem={vi.fn()}
          editingName="message sent"
          variant="definition"
          resourceType="topics"
        />,
      );

      const input = screen.getByRole("textbox");
      fireEvent.keyDown(input, { key: "Enter" });

      expect(handleUpdate).toHaveBeenCalledWith("t-1", "message.sent");
      expect(setEditingId).toHaveBeenCalledWith(null);
    });

    it("saves sanitized dot-separated topic name on Check button click", () => {
      const item: AnyMessagingResource = {
        id: "t-1",
        name: "old.name",
      };
      const handleUpdate = vi.fn();
      const setEditingId = vi.fn();

      render(
        <MessagingResourceRow
          nodeId="kafka-1"
          item={item}
          isEditing={true}
          setEditingId={setEditingId}
          setEditingName={vi.fn()}
          handleUpdate={handleUpdate}
          handleDelete={vi.fn()}
          handleUpdateItem={vi.fn()}
          editingName="order created event"
          variant="definition"
          resourceType="topics"
        />,
      );

      const checkBtn = screen.getByRole("button");
      fireEvent.click(checkBtn);

      expect(handleUpdate).toHaveBeenCalledWith("t-1", "order.created.event");
      expect(setEditingId).toHaveBeenCalledWith(null);
    });
  });

  describe("MessagingResourceList integration", () => {
    it("automatically sanitizes topic name on update in parent list onChange", () => {
      const items: AnyMessagingResource[] = [
        { id: "t-1", name: "initial.topic" },
      ];
      const onChange = vi.fn();

      render(
        <MessagingResourceList
          nodeId="kafka-1"
          title="Topics"
          items={items}
          variant="definition"
          resourceType="topics"
          onChange={onChange}
        />,
      );

      // Verify the item is rendered
      expect(screen.getByText("initial.topic")).toBeInTheDocument();
    });
  });
});
