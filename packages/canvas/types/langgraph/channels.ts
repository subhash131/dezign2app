import type { CustomTypeItem } from "../custom-types";

export type LangGraphStateChannel = {
  key: string;
  type:
    | "messages"
    | "string"
    | "number"
    | "boolean"
    | "array"
    | "object";
  reducer:
    | "add_messages"
    | "append"
    | "replace"
    | "merge_object"
    | "concat_array"
    | (string & {});
  description?: string;
  defaultValue?:
    | string
    | number
    | boolean
    | Record<string, string | number | boolean>
    | string[];
  customReducerCode?: string;
  customTypeId?: string;
  customTypeName?: string;
  customTypeSchema?: CustomTypeItem;
};

export interface LangGraphCustomReducer {
  id: string;
  name: string;
  code: string;
  description?: string;
  targetField?: string;
}

export function isLangGraphChannelType(
  val: string,
): val is LangGraphStateChannel["type"] {
  switch (val) {
    case "messages":
    case "string":
    case "number":
    case "boolean":
    case "array":
    case "object":
      return true;
    default:
      return false;
  }
}

export type LangGraphInputTransition =
  | "direct"
  | "as_human_message"
  | "append_to_list"
  | "merge_object"
  | "parse_json"
  | "transformer";

export function isLangGraphInputTransition(
  val: string,
): val is LangGraphInputTransition {
  switch (val) {
    case "direct":
    case "as_human_message":
    case "append_to_list":
    case "merge_object":
    case "parse_json":
    case "transformer":
      return true;
    default:
      return false;
  }
}

export type LangGraphInputChannel = {
  id?: string;
  key: string;
  type:
    | "string"
    | "messages"
    | "number"
    | "boolean"
    | "object"
    | "array";
  required?: boolean;
  description?: string;
  defaultValue?:
    | string
    | number
    | boolean
    | Record<string, string | number | boolean>
    | string[];
  /** Whether this came from the connected endpoint or was manually added */
  source?: "request" | "custom";
  /** Which state channel key this input initializes / feeds */
  stateChannelKey?: string;
  /** Transition mode to transform raw input value before updating state channel */
  transition?: LangGraphInputTransition;
  /** ID or function name of a TransformerNode if transition === "transformer" */
  transformerRef?: string;
};

export type LangGraphOutputPort = {
  id: string;
  label: string;
  description?: string;
};

export interface OutputChannelConfig {
  id: string;
  name: string;
  type: "sse" | "websocket" | "event" | "webhook" | "rest";
  topicOrEventName?: string;
  targetStateChannel?: string;
  description?: string;
  streamContentMode?:
    | "ai_node_tokens"
    | "structured_output"
    | "step_output"
    | "full_state";
  sourceStepId?: string;
  boundRouteIds?: string[];
  schemaJson?: string;
  position?: { x: number; y: number };
}
