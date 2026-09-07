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
} from "./event-generators";

export type { EventComponentMeta };
export { METHOD_BADGE_CLASSES };

/**
 * Generates an event component for Next.js web clients.
 * Produces navigation links for page navigation, simple buttons for parameterless triggers,
 * or interactive form components for configured API parameters/body.
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

  // 3. Generate TypeScript Interfaces (reusing @workspace/types when connected to an endpoint)
  const endpointLink = serviceName && endpoint ? { serviceName, endpoint } : undefined;
  const typeDefs = generateTypeDefinitions(componentName, params, endpointLink);

  // 4A. If no form inputs configured, render a clean, direct action Button
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
    });
  }

  // 4B. Interactive Form Component with ONLY Configured Parameters & Body
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
  });
}
