import { UIEventItem } from "@/types/canvas";
import { Endpoint } from "@workspace/canvas";
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
  customRequestBody?: unknown,
  eventItem?: UIEventItem,
  endpoint?: Endpoint,
  serviceName?: string,
  storageConfig?: StorageUploadConfig,
): string {
  // 1. Navigation Event (e.g. navigateToPage)
  if (eventType === "navigateToPage") {
    return generateNavigationEventTemplate(componentName, eventName, targetRoute);
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
  const evtAny = eventItem as {
    storageNodeId?: string;
    uploadBucketId?: string;
    storageOperationBinding?: { bucketId?: string };
    uploadMaxFileSizeMb?: number;
    uploadAcceptedMimeTypes?: string;
  } | undefined;
  const epAny = endpoint as {
    connectedStorageNodeId?: string;
    uploadMaxFileSizeMb?: number;
    uploadAcceptedMimeTypes?: string;
  } | undefined;

  const isExplicitUpload =
    eventType === "fileUpload" ||
    Boolean(evtAny?.storageNodeId) ||
    Boolean(evtAny?.uploadBucketId) ||
    Boolean(evtAny?.storageOperationBinding) ||
    Boolean(
      (endpoint?.pipelineSteps || []).some(
        (s: { type?: string; functionRef?: { name?: string; importPath?: string } }) =>
          s.type === "storage_operation" ||
          s.type === "storage" ||
          s.functionRef?.importPath?.includes("/storage") ||
          s.functionRef?.name?.toLowerCase().includes("upload"),
      ),
    );

  const hasStorageConnection = Boolean(storageConfig) || isExplicitUpload;

  if (hasStorageConnection) {
    const resolvedStorageConfig: StorageUploadConfig = storageConfig ?? {
      maxSizeMb: evtAny?.uploadMaxFileSizeMb ?? epAny?.uploadMaxFileSizeMb ?? 10,
      acceptedMimeTypes:
        evtAny?.uploadAcceptedMimeTypes ??
        epAny?.uploadAcceptedMimeTypes ??
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
  });
}

