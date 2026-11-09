import { BackendEdge, CustomTypeItem } from "@/types/canvas";
import { EdgeCleanupContext } from "../types";
import { getSupportedActionsForType } from "@/app/(canvas)/project/[projectId]/_components/backend-nodes/graph-nodes/nodes/frontend/StateStoreNode";
import { getSuggestedReducerCodeForChannelType } from "@/app/(canvas)/project/[projectId]/_components/backend-nodes/graph-nodes/langgraph/langgraph-canvas/components/inspector/state-inspector/constants";

/**
 * Handles edge cleanup for StateStore connections, including section-state-in
 * subscriptions / type references and store-field-in type references.
 */
export function cleanStateStoreEdge(
  edge: BackendEdge,
  ctx: EdgeCleanupContext,
): void {
  // 1. State Store <-> WebPage Section State Subscription cleanup
  if (edge.targetHandle?.startsWith("section-state-in-")) {
    const isTypeEdge =
      edge.type === "type-reference" ||
      edge.sourceHandle?.startsWith("type-out-") ||
      Boolean(edge.data?.isTypeReference);

    const pageNode = ctx.nextNodes.find((n) => n.id === edge.target);
    if (pageNode?.data?.sections && Array.isArray(pageNode.data.sections)) {
      let pageChanged = false;
      const newSections = pageNode.data.sections.map((section) => {
        const prefix = `section-state-in-${section.id}-`;
        if (!edge.targetHandle?.startsWith(prefix)) return section;

        const stateId = edge.targetHandle.slice(prefix.length);
        if (!section.stateObjects || !Array.isArray(section.stateObjects)) {
          return section;
        }

        if (isTypeEdge) {
          // Disconnected custom type from state object
          const targetState = section.stateObjects.find((st) => st.id === stateId);
          const cleanStateType = (targetState?.type || "string").replace(/\[\]$/, "").trim();
          const sourceNode = ctx.nextNodes.find((n) => n.id === edge.source);
          const matchedTypeItem = sourceNode?.data?.types?.find(
            (t) => `type-out-${t.id}` === edge.sourceHandle || t.name === edge.data?.baseTypeName,
          );
          const edgeTypeName = edge.data?.baseTypeName || edge.data?.label || matchedTypeItem?.name;
          const hasRemainingEdge = ctx.nextEdges.some(
            (e) => !ctx.removedSet.has(e.id) && e.id !== edge.id && e.target === edge.target && e.targetHandle === edge.targetHandle,
          );

          // If another edge is still connected or if the state object's type was already changed to something else, do not overwrite it
          if (hasRemainingEdge || (edgeTypeName && cleanStateType.toLowerCase() !== edgeTypeName.toLowerCase())) {
            return section;
          }

          const updatedStates = section.stateObjects.map((st) => {
            if (st.id === stateId) {
              const isArray = st.type?.endsWith("[]");
              return { ...st, type: isArray ? "string[]" : "string" };
            }
            return st;
          });
          pageChanged = true;
          return { ...section, stateObjects: updatedStates };
        } else {
          // Disconnected store state subscription edge - remove state object from section
          const remainingStates = section.stateObjects.filter(
            (st) => st.id !== stateId,
          );
          if (remainingStates.length !== section.stateObjects.length) {
            pageChanged = true;
            return { ...section, stateObjects: remainingStates };
          }
        }
        return section;
      });

      if (pageChanged) {
        ctx.nodesChanged = true;
        const updatedPage = {
          ...pageNode,
          data: { ...pageNode.data, sections: newSections },
        };
        ctx.nextNodes = ctx.nextNodes.map((n) =>
          n.id === pageNode.id ? updatedPage : n,
        );
        ctx.pendingNodeUpserts.push(updatedPage);

        if (!isTypeEdge) {
          // If the state object was removed, also prune companion edges (e.g. type-reference edges) pointing to this targetHandle
          const companionEdges = ctx.nextEdges.filter(
            (e) => e.target === edge.target && e.targetHandle === edge.targetHandle && e.id !== edge.id,
          );
          if (companionEdges.length > 0) {
            const compIds = new Set(companionEdges.map((c) => c.id));
            ctx.nextEdges = ctx.nextEdges.filter((e) => !compIds.has(e.id));
            compIds.forEach((id) => {
              ctx.removedSet.add(id);
              if (!ctx.additionalRemovedEdgeIds) {
                ctx.additionalRemovedEdgeIds = [];
              }
              ctx.additionalRemovedEdgeIds.push(id);
            });
          }
        }
      }
    }
  }

  // 2. Types Node -> State Store Field Type Reference cleanup
  if (edge.targetHandle?.startsWith("store-field-in-")) {
    const fieldId = edge.targetHandle.replace("store-field-in-", "");
    const storeNode = ctx.nextNodes.find((n) => n.id === edge.target);
    if (storeNode?.data?.fields && Array.isArray(storeNode.data.fields)) {
      const targetField = storeNode.data.fields.find((f) => f.id === fieldId);
      if (!targetField) return;

      const cleanFieldType = (targetField.type || "string").replace(/\[\]$/, "").trim();

      // Find the type name associated with this deleted edge
      const sourceNode = ctx.nextNodes.find((n) => n.id === edge.source);
      const matchedTypeItem = sourceNode?.data?.types?.find(
        (t) => `type-out-${t.id}` === edge.sourceHandle || t.name === edge.data?.baseTypeName,
      );
      const edgeTypeName = edge.data?.baseTypeName || edge.data?.label || matchedTypeItem?.name;

      // Check if there is still an active edge pointing to this field handle
      const hasRemainingEdge = ctx.nextEdges.some(
        (e) => !ctx.removedSet.has(e.id) && e.id !== edge.id && e.target === edge.target && e.targetHandle === edge.targetHandle,
      );

      // If another edge is still connected, or if the field's current type does NOT match the deleted edge
      // (which happens when the user selected a new type in the dropdown and this old edge is just stale),
      // DO NOT reset the field's type!
      if (hasRemainingEdge) return;
      if (edgeTypeName && cleanFieldType.toLowerCase() !== edgeTypeName.toLowerCase()) {
        return;
      }

      // If the user genuinely deleted the connecting type edge from canvas, reset to string (or string[])
      let storeChanged = false;
      const newFields = storeNode.data.fields.map((f) => {
        if (f.id === fieldId) {
          storeChanged = true;
          const isArray = Boolean(f.isArray || f.type?.endsWith("[]"));
          const targetType = isArray ? "string[]" : "string";
          const targetActions = getSupportedActionsForType(targetType, isArray);
          const generatedReducerCode = getSuggestedReducerCodeForChannelType(targetType, null, isArray);
          return {
            ...f,
            type: targetType,
            actions: targetActions,
            customReducerCode: generatedReducerCode,
          };
        }
        return f;
      });

      if (storeChanged) {
        ctx.nodesChanged = true;
        const updatedStore = {
          ...storeNode,
          data: { ...storeNode.data, fields: newFields },
        };
        ctx.nextNodes = ctx.nextNodes.map((n) =>
          n.id === storeNode.id ? updatedStore : n,
        );
        ctx.pendingNodeUpserts.push(updatedStore);
      }
    }
  }
}
