import { UIEventItem, Schema, Parameter } from "@/types/canvas";
import { Endpoint, JSONValue } from "@workspace/canvas";
import {
  EventComponentMeta,
  METHOD_BADGE_CLASSES,
  resolveEventParameters,
  generateTypeDefinitions,
  generateNavigationEventTemplate,
  generateSimpleButtonEventTemplate,
  generateInteractiveFormEventTemplate,
  generateStorageUploadEventTemplate,
  StorageUploadConfig,
} from "./event-generators";

export type { EventComponentMeta };
export { METHOD_BADGE_CLASSES };

/**
 * Generates an event component for Next.js web clients.
 * Produces navigation links for page navigation, storage upload components for
 * file-upload actions, simple buttons for parameterless triggers, or interactive
 * form components for configured API parameters/body.
 */
export function generateEventComponent(
  eventName: string,
  eventType: string,
  url: string,
  method: string,
  componentName: string,
  targetRoute?: string,
  targetPageLabel?: string,
  requireAuth: boolean = true,
  customHeaders?: Record<string, string>,
  customQueryParams?: Record<string, string>,
  customRequestBody?:
    | JSONValue
    | Schema
    | { fields?: Parameter[]; rawJson?: string; mode?: string },
  eventItem?: UIEventItem,
  endpoint?: Endpoint,
  serviceName?: string,
  storageConfig?: StorageUploadConfig,
): string {
  // 1. Navigation Event (pure navigation without transformers or other active steps)
  const navStep = Array.isArray(eventItem?.actionSteps)
    ? eventItem?.actionSteps.find((s) => s.type === "navigation")
    : undefined;

  const hasExecutionSteps =
    Array.isArray(eventItem?.actionSteps) &&
    eventItem.actionSteps.some(
      (s) =>
        s.type === "transform" ||
        s.type === "api_call" ||
        s.type === "storage_put" ||
        s.type === "state_mutation" ||
        s.type === "browser_storage",
    );

  const hasStoreBindings =
    Boolean(eventItem?.storeActionBinding) ||
    Boolean(eventItem?.storeActionBindings?.length) ||
    (Array.isArray(eventItem?.actionSteps) &&
      eventItem.actionSteps.some((s) => s.type === "state_mutation"));

  const isPureNavigation =
    (eventType === "navigateToPage" ||
      (navStep && !endpoint && (!url || url === "#"))) &&
    !hasExecutionSteps &&
    !hasStoreBindings &&
    navStep?.navCondition !== "on_success" &&
    navStep?.navCondition !== "on_error";

  if (isPureNavigation) {
    const effectiveRoute =
      navStep?.targetRoute || targetRoute || eventItem?.targetRoute;
    const pathParamBindings =
      navStep?.pathParamBindings || eventItem?.pathParamBindings;
    const queryParamBindings =
      navStep?.queryParamBindings || eventItem?.queryParamBindings;

    return generateNavigationEventTemplate(
      componentName,
      eventName,
      effectiveRoute,
      pathParamBindings,
      queryParamBindings,
    );
  }

  // 2. Resolve Parameters & Schemas
  const params = resolveEventParameters({
    url,
    method,
    requireAuth,
    customHeaders,
    customQueryParams,
    customRequestBody,
    eventItem,
    endpoint,
  });

  // 3. Generate TypeScript Interfaces
  const endpointLink = serviceName && endpoint ? { serviceName, endpoint } : undefined;
  const typeDefs = generateTypeDefinitions(componentName, params, endpointLink);

  // 4A. Storage Upload Component — rendered when a StorageRef node is connected
  const isExplicitUpload =
    eventType === "fileUpload" ||
    Boolean(eventItem?.storageNodeId) ||
    Boolean(eventItem?.uploadBucketId) ||
    Boolean(eventItem?.storageOperationBinding) ||
    Boolean(
      (endpoint?.pipelineSteps || []).some(
        (s) =>
          s.type === "storage_operation" ||
          s.functionRef?.importPath?.includes("/storage") ||
          s.functionRef?.name?.toLowerCase().includes("upload"),
      ),
    );

  const hasStorageConnection = Boolean(storageConfig) || isExplicitUpload;

  if (hasStorageConnection) {
    const resolvedStorageConfig: StorageUploadConfig = storageConfig ?? {
      maxSizeMb:
        eventItem?.uploadMaxFileSizeMb ??
        endpoint?.uploadMaxFileSizeMb ??
        10,
      acceptedMimeTypes:
        eventItem?.uploadAcceptedMimeTypes ??
        endpoint?.uploadAcceptedMimeTypes ??
        "image/jpeg,image/png,image/webp,image/gif",
      showPreview: true,
    };
    return generateStorageUploadEventTemplate({
      componentName,
      eventName,
      eventType,
      url,
      upperMethod: params.upperMethod,
      requireAuth,
      typeDefs,
      storageConfig: resolvedStorageConfig,
      storeActionBinding: eventItem?.storeActionBinding,
      storeActionBindings: eventItem?.storeActionBindings,
    serviceName,
    });
  }

  // 4B. If no form inputs configured, render a clean, direct action Button
  if (!params.hasFields) {
    return generateSimpleButtonEventTemplate({
      componentName,
      eventName,
      eventType,
      url,
      upperMethod: params.upperMethod,
      requireAuth,
      typeDefs,
      libraries: eventItem?.libraries || [],
      storeActionBinding: eventItem?.storeActionBinding,
      storeActionBindings: eventItem?.storeActionBindings,
      serviceName,
      actionSteps: eventItem?.actionSteps,
      targetRoute: navStep?.targetRoute || targetRoute || eventItem?.targetRoute,
    });
  }

  // 4C. Interactive Form Component with ONLY Configured Parameters & Body
  return generateInteractiveFormEventTemplate({
    componentName,
    eventName,
    eventType,
    url,
    upperMethod: params.upperMethod,
    requireAuth,
    typeDefs,
    params,
    libraries: eventItem?.libraries || [],
    storeActionBinding: eventItem?.storeActionBinding,
    storeActionBindings: eventItem?.storeActionBindings,
    serviceName,
    actionSteps: eventItem?.actionSteps,
    targetRoute: navStep?.targetRoute || targetRoute || eventItem?.targetRoute,
  });
}

