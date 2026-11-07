import { BackendNode } from "@/types/canvas";
import {
  Endpoint,
  PipelineStep,
  PublishedEventItem,
  ConsumedEventItem,
} from "@workspace/canvas/types";
import { DeletedNodesMeta } from "../types";

function cleanFrontendActionSteps(
  steps: any[],
  meta: DeletedNodesMeta,
): { steps: any[]; changed: boolean } {
  if (!steps || !Array.isArray(steps) || steps.length === 0) {
    return { steps, changed: false };
  }
  let changed = false;
  const filtered = steps.filter((step: any) => {
    if (!step) return false;

    // 1. Transform step
    if (step.type === "transform") {
      if (
        step.transformerRefNodeId &&
        meta.allIdsSet.has(step.transformerRefNodeId)
      ) {
        changed = true;
        return false;
      }
      if (
        step.transformerNodeId &&
        meta.allIdsSet.has(step.transformerNodeId)
      ) {
        changed = true;
        return false;
      }
      if (
        step.transformerName &&
        (meta.deletedTransformerNames.has(step.transformerName) ||
          meta.allIdsSet.has(step.transformerName))
      ) {
        changed = true;
        return false;
      }
      if (
        step.functionRef?.name &&
        (meta.deletedTransformerNames.has(step.functionRef.name) ||
          meta.allIdsSet.has(step.functionRef.name))
      ) {
        changed = true;
        return false;
      }
    }

    // 2. API call step
    if (step.type === "api_call") {
      if (step.serviceNodeId && meta.allIdsSet.has(step.serviceNodeId)) {
        changed = true;
        return false;
      }
      if (step.endpointId && meta.allIdsSet.has(step.endpointId)) {
        changed = true;
        return false;
      }
    }

    // 3. Storage step
    if (step.type === "storage_put" || step.type === "storage_operation") {
      if (
        step.storageRefNodeId &&
        meta.allIdsSet.has(step.storageRefNodeId)
      ) {
        changed = true;
        return false;
      }
      if (step.storageNodeId && meta.allIdsSet.has(step.storageNodeId)) {
        changed = true;
        return false;
      }
    }

    // 4. Browser storage step
    if (step.type === "browser_storage") {
      if (
        step.browserStorageNodeId &&
        meta.allIdsSet.has(step.browserStorageNodeId)
      ) {
        changed = true;
        return false;
      }
    }

    // 5. State store step
    if (step.type === "state_store" || step.type === "state_store_update") {
      if (
        step.stateStoreNodeId &&
        meta.allIdsSet.has(step.stateStoreNodeId)
      ) {
        changed = true;
        return false;
      }
    }

    // 6. LangGraph invoke step
    if (step.type === "langgraph_invoke") {
      if (
        step.langGraphTargetNodeId &&
        meta.allIdsSet.has(step.langGraphTargetNodeId)
      ) {
        changed = true;
        return false;
      }
    }

    return true;
  });

  if (!changed && filtered.length === steps.length) {
    return { steps, changed: false };
  }

  return {
    steps: filtered.map((s, idx) => ({ ...s, order: idx + 1 })),
    changed: true,
  };
}

/**
 * Cleans up internal references on remaining nodes (auth, types, transformer_ref,
 * webPage, service) when other nodes have been deleted.
 */
export function cleanRemainingNodes(
  nodes: BackendNode[],
  meta: DeletedNodesMeta,
): BackendNode[] {
  const {
    allIdsSet,
    deletedBrokerIds,
    deletedBrokerTopicIds,
    deletedBrokerTopicNames,
    deletedBrokerPackageNames,
  } = meta;

  return nodes
    .filter((n) => !allIdsSet.has(n.id))
    .map((node) => {
      // 1. Auth node references cleanup
      if (node.type === "auth" && node.data) {
        let changed = false;
        const newData = { ...node.data };

        // Clean up databaseId if the referenced database node was deleted
        if (newData.databaseId && allIdsSet.has(newData.databaseId)) {
          newData.databaseId = undefined;
          changed = true;
        }

        // Clean up table mappings if referenced entity was deleted
        if (newData.tableMappings) {
          const newMappings: Record<string, string | undefined> = {
            ...newData.tableMappings,
          };
          let mappingsChanged = false;
          for (const [key, entId] of Object.entries(newMappings)) {
            if (entId && allIdsSet.has(entId)) {
              delete newMappings[key];
              mappingsChanged = true;
            }
          }
          if (mappingsChanged) {
            newData.tableMappings = newMappings;
            changed = true;
          }
        }

        // Clean up userEntityId / userSchemaId
        if (newData.userEntityId && allIdsSet.has(newData.userEntityId)) {
          newData.userEntityId = undefined;
          changed = true;
        }
        if (newData.userSchemaId && allIdsSet.has(newData.userSchemaId)) {
          newData.userSchemaId = undefined;
          changed = true;
        }

        // Clean up authFunctions
        if (
          newData.authFunctions &&
          newData.authFunctions.some(
            (af: { entityNodeId?: string }) =>
              af.entityNodeId && allIdsSet.has(af.entityNodeId),
          )
        ) {
          newData.authFunctions = newData.authFunctions.filter(
            (af: { entityNodeId?: string }) =>
              !af.entityNodeId || !allIdsSet.has(af.entityNodeId),
          );
          changed = true;
        }

        if (changed) {
          return { ...node, data: newData };
        }
      }

      // 2. Types node (consolidated EntityTypes node)
      if (
        node.type === "types" &&
        (node.id === "types-entity-schemas" ||
          Boolean(node.data?.isEntitySchemas) ||
          node.data?.label === "Entity Types")
      ) {
        const currentTypes = node.data?.types || [];
        const nextTypes = currentTypes.filter((t: any) => {
          for (const deletedId of allIdsSet) {
            if (
              t.id === `type-entity-${deletedId}` ||
              t.id.startsWith(`type-entity-${deletedId}`) ||
              t.description?.includes(deletedId)
            ) {
              return false;
            }
          }
          return true;
        });

        if (nextTypes.length !== currentTypes.length) {
          return {
            ...node,
            data: {
              ...node.data,
              types: nextTypes,
            },
          };
        }
      }

      // 3. TransformerRef node
      if (node.type === "transformer_ref" && node.data?.transformerRef) {
        if (allIdsSet.has(node.data.transformerRef)) {
          return {
            ...node,
            data: {
              ...node.data,
              transformerRef: undefined,
            },
          };
        }
      }

      // 4. WebPage node (sections stateObjects, actions, realtimeConnections)
      if (
        node.type === "webPage" &&
        (node.data?.sections || node.data?.realtimeConnections)
      ) {
        let changed = false;
        const newSections = (node.data.sections || []).map((section: any) => {
          let secChanged = false;
          let remainingStates = section.stateObjects;
          if (section.stateObjects && Array.isArray(section.stateObjects)) {
            remainingStates = section.stateObjects.filter(
              (st: any) => !st.storeId || !allIdsSet.has(st.storeId),
            );
            if (remainingStates.length !== section.stateObjects.length) {
              secChanged = true;
            }
          }

          let remainingActions = section.actions;
          if (section.actions && Array.isArray(section.actions)) {
            remainingActions = section.actions.map((act: any) => {
              let actModified = false;
              let nextAct = act;
              if (
                act.storeActionBinding?.storeNodeId &&
                allIdsSet.has(act.storeActionBinding.storeNodeId)
              ) {
                actModified = true;
                const { storeActionBinding, ...rest } = nextAct;
                nextAct = rest;
              }
              if (nextAct.actionSteps && Array.isArray(nextAct.actionSteps)) {
                const cleaned = cleanFrontendActionSteps(nextAct.actionSteps, meta);
                if (cleaned.changed) {
                  actModified = true;
                  nextAct = { ...nextAct, actionSteps: cleaned.steps };
                }
              }
              if (actModified) {
                secChanged = true;
                return nextAct;
              }
              return act;
            });
          }

          if (secChanged) {
            changed = true;
            return {
              ...section,
              stateObjects: remainingStates,
              actions: remainingActions,
            };
          }
          return section;
        });

        let newEvents = node.data.events;
        if (node.data.events && Array.isArray(node.data.events)) {
          newEvents = node.data.events.map((evt: any) => {
            if (evt.actionSteps && Array.isArray(evt.actionSteps)) {
              const cleaned = cleanFrontendActionSteps(evt.actionSteps, meta);
              if (cleaned.changed) {
                changed = true;
                return { ...evt, actionSteps: cleaned.steps };
              }
            }
            return evt;
          });
        }

        let newRealtime = node.data.realtimeConnections;
        if (
          node.data.realtimeConnections &&
          Array.isArray(node.data.realtimeConnections)
        ) {
          newRealtime = node.data.realtimeConnections.map((c: any) => {
            let connModified = false;
            let nextConn = c;
            if (
              c.storeActionBinding?.storeNodeId &&
              allIdsSet.has(c.storeActionBinding.storeNodeId)
            ) {
              connModified = true;
              const { storeActionBinding, ...rest } = nextConn;
              nextConn = rest;
            }
            if (nextConn.actionSteps && Array.isArray(nextConn.actionSteps)) {
              const cleaned = cleanFrontendActionSteps(nextConn.actionSteps, meta);
              if (cleaned.changed) {
                connModified = true;
                nextConn = { ...nextConn, actionSteps: cleaned.steps };
              }
            }
            if (connModified) {
              changed = true;
              return nextConn;
            }
            return c;
          });
        }

        if (changed) {
          return {
            ...node,
            data: {
              ...node.data,
              sections: newSections,
              ...(newEvents ? { events: newEvents } : {}),
              realtimeConnections: newRealtime,
            },
          };
        }
      }

      // 5. Service node (publishedEvents, consumedEvents, endpoints)
      if (node.type === "service" && node.data && deletedBrokerIds.size > 0) {
        let srvChanged = false;
        const newSrvData = { ...node.data };

        if (newSrvData.publishedEvents) {
          const filtered = newSrvData.publishedEvents.filter(
            (pe: PublishedEventItem) =>
              !(
                pe.targetNodeId &&
                (allIdsSet.has(pe.targetNodeId) ||
                  deletedBrokerIds.has(pe.targetNodeId))
              ) &&
              !(
                pe.brokerNodeId &&
                (allIdsSet.has(pe.brokerNodeId) ||
                  deletedBrokerIds.has(pe.brokerNodeId))
              ) &&
              !(
                pe.messagingResourceId &&
                deletedBrokerTopicIds.has(pe.messagingResourceId)
              ),
          );
          if (filtered.length !== newSrvData.publishedEvents.length) {
            newSrvData.publishedEvents = filtered;
            srvChanged = true;
          }
        }

        if (newSrvData.consumedEvents) {
          const filtered = newSrvData.consumedEvents.filter(
            (ce: ConsumedEventItem) =>
              !(
                ce.targetNodeId &&
                (allIdsSet.has(ce.targetNodeId) ||
                  deletedBrokerIds.has(ce.targetNodeId))
              ) &&
              !(
                ce.brokerNodeId &&
                (allIdsSet.has(ce.brokerNodeId) ||
                  deletedBrokerIds.has(ce.brokerNodeId))
              ) &&
              !(
                ce.messagingResourceId &&
                deletedBrokerTopicIds.has(ce.messagingResourceId)
              ),
          );
          if (filtered.length !== newSrvData.consumedEvents.length) {
            newSrvData.consumedEvents = filtered;
            srvChanged = true;
          }
        }

        if (newSrvData.endpoints) {
          const newEps = newSrvData.endpoints.map((ep: Endpoint) => {
            let epChanged = false;
            let epPubs = ep.publishedEvents;
            if (epPubs) {
              const filtered = epPubs.filter(
                (pe: PublishedEventItem) =>
                  !(
                    pe.brokerNodeId &&
                    (allIdsSet.has(pe.brokerNodeId) ||
                      deletedBrokerIds.has(pe.brokerNodeId))
                  ) &&
                  !(
                    pe.messagingResourceId &&
                    deletedBrokerTopicIds.has(pe.messagingResourceId)
                  ),
              );
              if (filtered.length !== epPubs.length) {
                epPubs = filtered;
                epChanged = true;
              }
            }

            let epSteps = ep.pipelineSteps;
            if (epSteps) {
              const filtered = epSteps.filter((step: PipelineStep) => {
                if (step.type !== "kafka_publish") return true;
                if (
                  step.brokerNodeId &&
                  (allIdsSet.has(step.brokerNodeId) ||
                    deletedBrokerIds.has(step.brokerNodeId))
                ) {
                  return false;
                }
                if (
                  step.messagingResourceId &&
                  deletedBrokerTopicIds.has(step.messagingResourceId)
                ) {
                  return false;
                }
                if (
                  step.functionRef?.importPath &&
                  Array.from(deletedBrokerPackageNames).some((pkg) =>
                    step.functionRef!.importPath!.startsWith(pkg),
                  )
                ) {
                  return false;
                }
                if (
                  step.functionRef?.name &&
                  Array.from(deletedBrokerTopicNames).some((tn) =>
                    step
                      .functionRef!.name!.toLowerCase()
                      .includes(tn.replace(/[^a-z0-9]/g, "")),
                  )
                ) {
                  return false;
                }
                return true;
              });
              if (filtered.length !== epSteps.length) {
                epSteps = filtered;
                epChanged = true;
              }
            }

            if (epChanged) {
              srvChanged = true;
              return { ...ep, publishedEvents: epPubs, pipelineSteps: epSteps };
            }
            return ep;
          });
          if (srvChanged) {
            newSrvData.endpoints = newEps;
          }
        }

        if (srvChanged) {
          return { ...node, data: newSrvData };
        }
      }

      return node;
    });
}
