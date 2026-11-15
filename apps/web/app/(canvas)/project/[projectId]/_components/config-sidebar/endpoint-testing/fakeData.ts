/**
 * Fake data generation and initial request body seeding for endpoint test cases.
 */
import { Endpoint, BackendNode, JSONValue, JSONObject } from "@/types/canvas";
import { isHealthEndpoint } from "@/lib/utils/healthCheckEndpoint";
import { useBackendCanvasStore } from "@/lib/stores/backendCanvasStore";

/**
 * Generates realistic fake data based on field name, type, and defaults.
 */
export function generateFakeDataForField(
  fieldName: string,
  rawType: string = "string",
  defaultValue?: string,
  required?: boolean,
): JSONValue {
  if (defaultValue !== undefined && defaultValue !== "") {
    try {
      const parsed: JSONValue = JSON.parse(defaultValue);
      return parsed;
    } catch {
      return defaultValue;
    }
  }

  const name = (fieldName || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const type = (rawType || "string").toLowerCase().trim();

  // 1. Specific Semantic Field Names Match
  if (name.includes("email")) {
    return "alice@example.com";
  }
  if (name.includes("password") || name.includes("passcode") || name.includes("secret")) {
    return "SecurePass123!";
  }
  if (name.includes("phone") || name.includes("mobile") || name.includes("tel")) {
    return "+1-555-0199";
  }
  if (name === "username" || name === "handle") {
    return "johndoe";
  }
  if (name.includes("firstname")) {
    return "John";
  }
  if (name.includes("lastname")) {
    return "Doe";
  }
  if (name === "name" || name.includes("fullname") || name.includes("author") || name.includes("creator")) {
    return "John Doe";
  }
  if (name.includes("title") || name.includes("subject") || name.includes("header")) {
    return "Sample Product Title";
  }
  if (
    name.includes("description") ||
    name.includes("desc") ||
    name.includes("bio") ||
    name.includes("summary") ||
    name.includes("details") ||
    name.includes("notes") ||
    name.includes("comment") ||
    name.includes("message") ||
    name.includes("content")
  ) {
    return "A detailed sample description for testing the API.";
  }
  if (
    name.includes("price") ||
    name.includes("amount") ||
    name.includes("cost") ||
    name.includes("total") ||
    name.includes("balance") ||
    name.includes("salary") ||
    name.includes("rate") ||
    name.includes("fee")
  ) {
    return 49.99;
  }
  if (
    name.includes("quantity") ||
    name.includes("qty") ||
    name.includes("count") ||
    name.includes("stock") ||
    name.includes("age") ||
    name.includes("limit") ||
    name.includes("size")
  ) {
    return 10;
  }
  if (name.includes("avatar") || name.includes("image") || name.includes("photo") || name.includes("picture") || name.includes("logo")) {
    return "https://images.unsplash.com/photo-1534528741775-53994a69daeb";
  }
  if (name.includes("url") || name.includes("link") || name.includes("website")) {
    return "https://example.com";
  }
  if (
    name.includes("uuid") ||
    name.includes("guid") ||
    name === "userid" ||
    name === "createdby" ||
    name === "authorid" ||
    name === "creatorid"
  ) {
    return "a0000000-0000-4000-8000-000000000001";
  }
  if (name.endsWith("id") || name.startsWith("id")) {
    return "rec_test_101";
  }
  if (name.includes("role")) {
    return "admin";
  }
  if (name.includes("status") || name.includes("state")) {
    return "active";
  }
  if (name.includes("address") || name.includes("street")) {
    return "123 Market Street, Suite 400";
  }
  if (name.includes("city")) {
    return "San Francisco";
  }
  if (name.includes("country")) {
    return "United States";
  }
  if (name.includes("zip") || name.includes("postal")) {
    return "94105";
  }
  if (name.includes("tags") || name.includes("categories") || name.includes("genres") || name.includes("topics")) {
    return ["electronics", "featured"];
  }
  if (name.includes("category") || name.includes("tag") || name.includes("genre") || name.includes("topic")) {
    return "electronics";
  }
  if (
    name.includes("date") ||
    name.includes("createdat") ||
    name.includes("updatedat") ||
    name.includes("timestamp") ||
    name.includes("expiresat") ||
    name.includes("time")
  ) {
    return new Date().toISOString();
  }
  if (
    name.startsWith("is") ||
    name.startsWith("has") ||
    name.includes("enabled") ||
    name.includes("active") ||
    name.includes("verified") ||
    name.includes("published") ||
    name.includes("completed") ||
    name.includes("instock")
  ) {
    return true;
  }

  // 2. Type-based defaults
  if (type === "number" || type === "int" || type === "integer") {
    return 42;
  }
  if (type === "float" || type === "double" || type === "decimal") {
    return 19.99;
  }
  if (type === "boolean" || type === "bool") {
    return true;
  }
  if (type === "array" || type === "list") {
    return ["sample_item_1", "sample_item_2"];
  }
  if (type === "object" || type === "json") {
    return { sampleKey: "sample_value" };
  }
  if (type === "date" || type === "datetime") {
    return new Date().toISOString();
  }

  // 3. Clean string fallback
  const humanReadable = fieldName
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]/g, " ")
    .trim();
  return humanReadable ? `Sample ${humanReadable}` : "sample_value";
}

/**
 * Safely extracts an initial JSON sample body populated with fake data from endpoint definition.
 */
export function getInitialBody(endpoint?: Endpoint | null): JSONValue {
  if (!endpoint) return {};

  // 1. If explicit fields configured in requestBody.fields
  if (endpoint.requestBody?.fields && endpoint.requestBody.fields.length > 0) {
    const obj: JSONObject = {};
    endpoint.requestBody.fields.forEach((f) => {
      const fieldKey = f.key || f.name;
      if (!fieldKey) return;
      obj[fieldKey] = generateFakeDataForField(
        fieldKey,
        f.type || "string",
        f.defaultValue,
        f.required,
      );
    });
    return obj;
  }

  // 2. If rawJson is configured
  if (endpoint.requestBody?.rawJson && endpoint.requestBody.rawJson.trim()) {
    try {
      const parsed: JSONValue = JSON.parse(endpoint.requestBody.rawJson);
      return parsed;
    } catch {}
  }

  // 3. If endpoint.body is configured
  if (endpoint.body && endpoint.body.trim()) {
    try {
      const parsed: JSONValue = JSON.parse(endpoint.body);
      return parsed;
    } catch {}
  }

  // 4. If endpoint has params
  if (endpoint.params && endpoint.params.length > 0) {
    const obj: JSONObject = {};
    endpoint.params.forEach((p) => {
      const key = p.name || p.key;
      if (key && !key.startsWith(":")) {
        obj[key] = generateFakeDataForField(
          key,
          p.type || "string",
          p.defaultValue || p.value,
          p.required,
        );
      }
    });
    if (Object.keys(obj).length > 0) return obj;
  }

  // 5. Default fallback based on HTTP method
  const method = (endpoint.type || "GET").toUpperCase();
  if (["POST", "PUT", "PATCH"].includes(method)) {
    const rawName = (endpoint.name || "item").replace(/^\//, "").replace(/[^a-zA-Z0-9]/g, " ").trim();
    return {
      title: rawName ? `Sample ${rawName}` : "Sample Item",
      description: "Test request payload for endpoint simulation.",
      status: "active",
    };
  }

  return {};
}

/**
 * Generates an expected response payload matching the endpoint's configured response contract.
 * Checks (in priority):
 * 1. Explicit return_response pipeline step bindings
 * 2. Configured responseBody schema (fields or rawJson)
 * 3. responseFields
 * 4. Health check endpoint standard response ({ status: "UP", service, port, timestamp })
 * 5. Method-based compiler fallback
 */
export function getExpectedResponseBody(
  endpoint?: Endpoint | null,
  serviceNode?: BackendNode | null,
): JSONValue {
  if (!endpoint) return {};

  const isHealth = isHealthEndpoint(endpoint);
  const endpointNodeId =
    (endpoint as { nodeId?: string }).nodeId ||
    useBackendCanvasStore.getState().endpoints.find((e) => e.id === endpoint.id)?.nodeId;

  const actualServiceNode =
    serviceNode ??
    (endpointNodeId
      ? useBackendCanvasStore.getState().nodes.find((n) => n.id === endpointNodeId)
      : useBackendCanvasStore.getState().nodes.find((n) =>
          ((n.data?.endpoints as Endpoint[] | undefined) || []).some((e) => e.id === endpoint.id),  
        ));
  const serviceName = actualServiceNode?.data?.label || serviceNode?.data?.label || "service";
  const servicePort = String(actualServiceNode?.data?.port || serviceNode?.data?.port || "8080");

  // Canonical Health Check endpoint contract
  if (isHealth) {
    return {
      status: "UP",
      service: serviceName,
      port: servicePort,
      timestamp: new Date().toISOString(),
    };
  }

  // 1. Pipeline Steps return_response step
  if (endpoint.pipelineSteps && endpoint.pipelineSteps.length > 0) {
    const returnStep = endpoint.pipelineSteps.find(
      (s) => s.type === "return_response" && s.enabled !== false,
    );
    if (returnStep && returnStep.inputBindings && returnStep.inputBindings.length > 0) {
      const bindings = returnStep.inputBindings;
      const first = bindings[0];

      // Single spread or unnamed binding
      if (bindings.length === 1 && first && (first.argName === "_spread" || !first.argName)) {
        const firstSource = first.source;
        if (firstSource?.kind === "inline") {
          const v = firstSource.value;
          if (typeof v === "string" && (v.trim().startsWith("{") || v.trim().startsWith("["))) {
            try {
              return JSON.parse(v);
            } catch {}
          }
          return v ?? "success";
        }
        if (firstSource?.kind === "req_body") {
          return getInitialBody(endpoint);
        }
        return { data: "success" };
      }

      // Explicit field-level bindings
      const obj: JSONObject = {};

      for (const b of bindings) {
        const key = b.argName?.trim();
        if (!key) continue;
        const source = b.source;
        if (!source) {
          obj[key] = generateFakeDataForField(key);
          continue;
        }

        switch (source.kind) {
          case "inline": {
            const v = source.value;
            if (typeof v === "number" || typeof v === "boolean") {
              obj[key] = v;
            } else {
              const strVal = String(v ?? "");
              if (strVal === "${new Date().toISOString()}" || strVal.includes("toISOString") || key.toLowerCase().includes("time")) {
                obj[key] = new Date().toISOString();
              } else if (
                (strVal.includes("${") && strVal.includes("PORT")) ||
                (key.toLowerCase() === "port" && (strVal === "8080" || strVal === "port" || !strVal))
              ) {
                obj[key] = servicePort;
              } else if (
                (strVal.includes("${") && (strVal.includes("service") || strVal.includes("name"))) ||
                (key.toLowerCase() === "service" && (strVal === "service" || strVal === "<service name>" || !strVal))
              ) {
                obj[key] = serviceName;
              } else if (!strVal.includes("${")) {
                obj[key] = strVal;
              } else {
                obj[key] = generateFakeDataForField(key);
              }
            }
            break;
          }
          case "req_body": {
            const body = getInitialBody(endpoint);
            const field = source.field;
            if (field && typeof body === "object" && body !== null && !Array.isArray(body)) {
              obj[key] = (body as JSONObject)[field] ?? generateFakeDataForField(key);
            } else {
              obj[key] = body;
            }
            break;
          }
          case "req_params": {
            const field = source.field;
            const param = endpoint.pathParams?.find((p) => p.name === field || p.key === field);
            obj[key] = param?.defaultValue || param?.value || "1";
            break;
          }
          case "req_query": {
            const field = source.field;
            const query = endpoint.queryParams?.find((p) => p.name === field || p.key === field);
            obj[key] = query?.defaultValue || query?.value || "sample";
            break;
          }
          case "req_headers": {
            const field = source.field;
            const header = endpoint.headers?.find((h) => h.key === field || h.name === field);
            obj[key] = header?.defaultValue || header?.value || generateFakeDataForField(key);
            break;
          }
          case "auth": {
            const field = source.field;
            const fakeAuth: Record<string, string | number> = {
              username: "johndoe",
              id: "usr_mock_123",
              userId: "usr_mock_123",
              email: "john@example.com",
              role: "user",
              name: "John Doe",
              sessionToken: "sess_mock_token_abc",
              expiresAt: Date.now() + 86400000,
            };
            obj[key] = field ? (fakeAuth[field] ?? generateFakeDataForField(key)) : fakeAuth;
            break;
          }
          case "env": {
            const envKey = source.field || key;
            const envVars = (actualServiceNode?.data?.envVars as any[]) || [];
            const envVar = envVars.find((e: any) => e.key === envKey || e.name === envKey);
            obj[key] = envVar?.value || generateFakeDataForField(key);
            break;
          }
          case "step_output": {
            const stepId = source.stepId;
            const priorStep = endpoint.pipelineSteps?.find((s) => s.id === stepId);
            if (priorStep) {
              if (priorStep.outputSchema && priorStep.outputSchema.length > 0) {
                if (source.field) {
                  const fieldMatch = priorStep.outputSchema.find(
                    (f) => f.name === source.field,
                  );
                  obj[key] = generateFakeDataForField(source.field, fieldMatch?.type || "string");
                } else {
                  const stepObj: JSONObject = {};
                  priorStep.outputSchema.forEach((f) => {
                    stepObj[f.name] = generateFakeDataForField(f.name, f.type || "string");
                  });
                  obj[key] = stepObj;
                }
              } else if (priorStep.tableNodeId) {
                const tableNode = useBackendCanvasStore
                  .getState()
                  .nodes.find((n) => n.id === priorStep.tableNodeId);
                if (tableNode?.data?.columns) {
                  if (source.field) {
                    const col = (tableNode.data.columns as any[]).find((c: any) => c.name === source.field);
                    obj[key] = generateFakeDataForField(source.field, col?.type || "string");
                  } else {
                    const row: JSONObject = {};
                    (tableNode.data.columns as any[]).forEach((c: any) => {
                      row[c.name] = generateFakeDataForField(c.name, c.type || "string");
                    });
                    obj[key] = row;
                  }
                } else {
                  obj[key] = generateFakeDataForField(key);
                }
              } else {
                obj[key] = generateFakeDataForField(key);
              }
            } else {
              obj[key] = generateFakeDataForField(key);
            }
            break;
          }
          default: {
            obj[key] = generateFakeDataForField(key);
            break;
          }
        }
      }

      if (Object.keys(obj).length > 0) {
        return obj;
      }
    }
  }

  // 2. responseBody configured with schema fields
  if (endpoint.responseBody?.fields && endpoint.responseBody.fields.length > 0) {
    const obj: JSONObject = {};
    endpoint.responseBody.fields.forEach((f) => {
      const fieldKey = f.key || f.name;
      if (!fieldKey) return;
      if (fieldKey.toLowerCase() === "service" && (f.defaultValue === "service" || f.value === "service" || !f.value)) {
        obj[fieldKey] = serviceName;
      } else if (fieldKey.toLowerCase() === "port" && (f.defaultValue === "8080" || f.value === "8080" || !f.value)) {
        obj[fieldKey] = servicePort;
      } else if (fieldKey.toLowerCase().includes("time") || fieldKey.toLowerCase().includes("date")) {
        obj[fieldKey] = new Date().toISOString();
      } else {
        obj[fieldKey] = generateFakeDataForField(
          fieldKey,
          f.type || "string",
          f.defaultValue,
          f.required,
        );
      }
    });
    return obj;
  }

  // 3. responseBody configured with rawJson
  if (endpoint.responseBody?.rawJson && endpoint.responseBody.rawJson.trim()) {
    try {
      const parsed: JSONValue = JSON.parse(endpoint.responseBody.rawJson);
      return parsed;
    } catch {}
  }

  // 4. responseFields
  if (endpoint.responseFields && endpoint.responseFields.length > 0) {
    const obj: JSONObject = {};
    endpoint.responseFields.forEach((f) => {
      const fieldKey = f.name;
      if (!fieldKey) return;
      if (fieldKey.toLowerCase() === "service") {
        obj[fieldKey] = serviceName;
      } else if (fieldKey.toLowerCase() === "port") {
        obj[fieldKey] = servicePort;
      } else if (fieldKey.toLowerCase().includes("time") || fieldKey.toLowerCase().includes("date")) {
        obj[fieldKey] = new Date().toISOString();
      } else {
        obj[fieldKey] = generateFakeDataForField(
          fieldKey,
          f.type || "string",
        );
      }
    });
    return obj;
  }

  // 5. Standard compiler fallback
  const method = (endpoint.type || "GET").toUpperCase();
  const rawPath = endpoint.name || "/";
  return {
    message: `Successfully executed ${method} ${rawPath}`,
  };
}

/**
 * Generates an expected error response payload matching the endpoint's error contract.
 */
export function getExpectedErrorResponseBody(
  endpoint?: Endpoint | null,
): JSONValue {
  if (!endpoint) return { error: "Validation Error" };

  if (endpoint.errorResponseBody?.fields && endpoint.errorResponseBody.fields.length > 0) {
    const obj: JSONObject = {};
    endpoint.errorResponseBody.fields.forEach((f) => {
      const fieldKey = f.key || f.name;
      if (!fieldKey) return;
      obj[fieldKey] = generateFakeDataForField(
        fieldKey,
        f.type || "string",
        f.defaultValue,
        f.required,
      );
    });
    return obj;
  }

  if (endpoint.errorResponseBody?.rawJson && endpoint.errorResponseBody.rawJson.trim()) {
    try {
      const parsed: JSONValue = JSON.parse(endpoint.errorResponseBody.rawJson);
      return parsed;
    } catch {}
  }

  return {
    error: "Validation Error",
  };
}

