import type { FrontendActionStepType, FrontendActionStepDraft } from "./types";

export function createDefaultFrontendStep(
  type: FrontendActionStepType,
  order: number,
  defaults?: Partial<FrontendActionStepDraft>,
): FrontendActionStepDraft {
  const id = `step-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

  switch (type) {
    case "api_call":
      return {
        id,
        order,
        type: "api_call",
        requestBindings: [],
        ...defaults,
      };

    case "storage_put":
      return {
        id,
        order,
        type: "storage_put",
        presignedUrlSource: {
          stepId: "",
          fieldPath: "presignedUrl",
        },
        fileSource: {
          kind: "user_input",
          key: "file",
        },
        contentType: "application/octet-stream",
        ...defaults,
      };

    case "state_mutation":
      return {
        id,
        order,
        type: "state_mutation",
        stateTargetKind: "local",
        stateKey: "stateVar",
        stateUpdateType: "set",
        stateValueSource: {
          kind: "literal",
          value: "",
        },
        ...defaults,
      };

    case "navigation":
      return {
        id,
        order,
        type: "navigation",
        navType: "route",
        targetRoute: "/",
        navCondition: "direct",
        navMethod: "router_push",
        pathParamBindings: [],
        ...defaults,
      };

    case "transform":
      return {
        id,
        order,
        type: "transform",
        outputVariable: "transformResult",
        transformerName: "transformData",
        transformBindings: [],
        ...defaults,
      };

    case "custom_code":
      return {
        id,
        order,
        type: "custom_code",
        code: "// Custom client-side action\nconsole.log('Action executed');",
        ...defaults,
      };

    case "condition":
      return {
        id,
        order,
        type: "condition",
        conditionExpr: "Boolean(data)",
        ...defaults,
      };

    case "notification":
      return {
        id,
        order,
        type: "notification",
        notifyType: "toast",
        notifyMessage: "Action completed successfully!",
        notifyLevel: "success",
        ...defaults,
      };

    case "reset_form":
      return {
        id,
        order,
        type: "reset_form",
        formTarget: "form",
        ...defaults,
      };

    case "update_query_params":
      return {
        id,
        order,
        type: "update_query_params",
        queryParamKey: "",
        queryParamMode: "set",
        queryParamNavMode: "replace",
        queryParamScroll: false,
        queryParamValueSource: {
          kind: "literal",
          value: "",
        },
        queryParamsUpdates: [
          {
            key: "",
            mode: "set",
            valueSource: {
              kind: "literal",
              value: "",
            },
          },
        ],
        ...defaults,
      };

    case "browser_storage":
      return {
        id,
        order,
        type: "browser_storage",
        name: "Browser Storage",
        storageEngine: "localStorage",
        storageOperation: "set",
        storageKey: "auth_token",
        storageValueSource: {
          kind: "literal",
          value: "",
        },
        ...defaults,
      };
  }
}
