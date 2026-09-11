import React from "react";
import { Plus } from "lucide-react";
import { BackendNode, Endpoint, UIEventItem, PageSection } from "@/types/canvas";
import { cn } from "@workspace/ui/lib/utils";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";
import { generateId } from "../../../common";
import { SectionBlock } from "./SectionBlock";

export interface SectionListProps {
  nodeId: string;
  sections?: PageSection[];
  updateNode: (id: string, changes: Partial<BackendNode>) => void;
  data: BackendNode["data"];
  onTriggerEvent: (triggerInfo: {
    event: UIEventItem;
    targetNode: BackendNode;
    endpoint: Endpoint;
  }) => void;
}

export const SectionList = ({
  nodeId,
  sections = [],
  updateNode,
  data,
  onTriggerEvent,
}: SectionListProps) => {
  const edges = useBackendCanvasStore((s) => s.edges);
  const nodes = useBackendCanvasStore((s) => s.nodes);
  const endpoints = useBackendCanvasStore((s) => s.endpoints);

  const getLinkedEndpoint = (
    eventId: string,
    fromNodeId: string = nodeId,
    depth: number = 0,
  ): { targetNode: BackendNode; endpoint: Endpoint } | null => {
    if (depth > 5) return null;

    const edge = edges.find(
      (e) => e.source === fromNodeId && e.sourceHandle === `events-${eventId}`,
    );
    if (!edge || !edge.targetHandle) return null;

    const targetNode = nodes.find((n) => n.id === edge.target);
    if (!targetNode) return null;

    if (edge.targetHandle.startsWith("pageload-in-")) {
      const targetEventId = edge.targetHandle.replace(/^pageload-in-/, "");
      return getLinkedEndpoint(targetEventId, edge.target, depth + 1);
    }

    const messagingTypes: string[] = [
      "kafka",
      "sqs",
      "redis-streams",
      "redis-pubsub",
      "pubsub",
      "eventstream",
      "queue",
    ];
    if (messagingTypes.includes(targetNode.type)) {
      const resourceId = edge.targetHandle.includes(":")
        ? edge.targetHandle.split(":").pop()
        : edge.targetHandle.split("-in-").pop();
      const resourceList =
        targetNode.data?.topics ||
        targetNode.data?.queues ||
        targetNode.data?.streams ||
        targetNode.data?.channels ||
        [];
      const resource =
        resourceList.find(
          (r: { id: string; name?: string }) => r.id === resourceId,
        ) || resourceList[0];
      const name = resource?.name || targetNode.data?.label || "Topic";
      const endpoint: Endpoint = {
        id: resource?.id || targetNode.id,
        name: name,
        type: targetNode.type.toUpperCase(),
        summary: `Messaging Topic on ${targetNode.data?.label || "Kafka"}`,
      };
      return { targetNode, endpoint };
    }

    if (
      edge.targetHandle.startsWith("consumedEvents-in-") ||
      edge.targetHandle.startsWith("publishedEvents-out-") ||
      edge.targetHandle.startsWith("publishedEvents-in-")
    ) {
      const eventIdMatch = edge.targetHandle.replace(
        /^(consumedEvents|publishedEvents)-(in|out)-/,
        "",
      );
      const consumedEv = targetNode.data?.consumedEvents?.find(
        (e: { id: string; name?: string }) => e.id === eventIdMatch,
      );
      const publishedEv = targetNode.data?.publishedEvents?.find(
        (e: { id: string; name?: string }) => e.id === eventIdMatch,
      );
      const ev = consumedEv || publishedEv;
      const endpoint: Endpoint = {
        id: ev?.id || eventIdMatch,
        name: ev?.name || "Event Handler",
        type: "EVENT",
      };
      return { targetNode, endpoint };
    }

    const parts = edge.targetHandle.split("-in-");
    const endpointId = parts[parts.length - 1];
    if (!endpointId) return null;

    let endpoint: Endpoint | undefined = endpoints.find(
      (ep) => ep.nodeId === targetNode.id && ep.id === endpointId,
    );

    if (!endpoint)
      endpoint = targetNode.data?.endpoints?.find((ep) => ep.id === endpointId);

    if (!endpoint && targetNode.data?.routeGroups) {
      for (const group of targetNode.data.routeGroups) {
        endpoint = group.endpoints?.find((ep) => ep.id === endpointId);
        if (endpoint) break;
      }
    }

    if (!endpoint) return null;

    return { targetNode, endpoint };
  };

  // Auto-wrap legacy flat events into a default section if sections is not yet initialized
  React.useEffect(() => {
    if ((!sections || sections.length === 0) && data?.events && data.events.length > 0) {
      updateNode(nodeId, {
        data: {
          ...data,
          sections: [
            {
              id: `sec-${generateId()}`,
              name: "Main Section",
              renderMode: "server",
              loadStrategy: "eager",
              actions: data.events,
            },
          ],
        },
      });
    }
  }, [nodeId, sections, data, updateNode]);

  const [editingSectionId, setEditingSectionId] = React.useState<string | null>(null);

  const updateSections = (newSections: PageSection[]) => {
    updateNode(nodeId, { data: { ...data, sections: newSections } });
  };

  const handleAddSection = () => {
    const newId = `sec-${generateId()}`;
    const newSection: PageSection = {
      id: newId,
      name: "",
      renderMode: "server",
      loadStrategy: "eager",
      actions: [],
    };
    updateSections([...sections, newSection]);
    setEditingSectionId(newId);
  };

  return (
    <>
      <div
        className={cn(
          "px-3 py-1 bg-secondary/40 border-t border-b text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex justify-between items-center group",
          sections.length === 0 && "border-b-0 rounded-b-[10px]",
        )}
      >
        Sections & Actions
        <div
          className="opacity-0 group-hover:opacity-100 cursor-pointer text-muted-foreground hover:text-foreground transition-all"
          onClick={handleAddSection}
          title="Add Section"
        >
          <Plus size={12} />
        </div>
      </div>

      <div className="flex flex-col">
        {sections.map((section, index) => (
          <SectionBlock
            key={section.id}
            nodeId={nodeId}
            section={section}
            sections={sections}
            isLastSection={index === sections.length - 1}
            updateSections={updateSections}
            getLinkedEndpoint={getLinkedEndpoint}
            onTriggerEvent={onTriggerEvent}
            isEditingName={editingSectionId === section.id}
            onStartEditName={() => setEditingSectionId(section.id)}
            onFinishEditName={() => {
              if (editingSectionId === section.id) {
                setEditingSectionId(null);
              }
            }}
          />
        ))}
      </div>
    </>
  );
};

