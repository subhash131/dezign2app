import { Endpoint, TargetDbOperation } from "@workspace/canvas/types";

export function buildResponsePayloadCode(
  ep: Endpoint,
  statusCode: number,
  path: string,
  pickedDbOps: TargetDbOperation[],
  targetVarMap: Map<string, string>,
  responseData: string,
): string {
  const mode = ep.responseMode || "schema_builder";

  if (mode === "custom_expression" && ep.responseExpression?.trim()) {
    return ep.responseExpression.trim();
  }

  if (mode === "inferred") {
    if (pickedDbOps.length > 0) {
      const sqlOps = pickedDbOps.filter(
        (op) => !op.fn.importPath.includes("redis") && !op.fn.name.toLowerCase().includes("cache"),
      );
      const primarySql =
        sqlOps.find((op) => op.operationKind === "create" || op.operationKind === "update") || sqlOps[0];
      const opToUse = primarySql || pickedDbOps[pickedDbOps.length - 1];
      let primaryVar =
        opToUse && opToUse.tableNodeId && targetVarMap.get(opToUse.tableNodeId)
          ? targetVarMap.get(opToUse.tableNodeId)!
          : opToUse
            ? `${opToUse.fn.name}Result`
            : "result";

      if (
        primaryVar.endsWith("Result") &&
        (primaryVar.toLowerCase().includes("cache") ||
          primaryVar.toLowerCase().includes("set") ||
          primaryVar.toLowerCase().includes("delete") ||
          primaryVar.toLowerCase().includes("invalidate"))
      ) {
        if (primarySql && primarySql.tableNodeId && targetVarMap.get(primarySql.tableNodeId)) {
          primaryVar = targetVarMap.get(primarySql.tableNodeId)!;
        } else if (["post", "put", "patch"].includes(ep.type?.toLowerCase() || "")) {
          primaryVar = "payload";
        }
      }

      return `{ message: "Successfully executed ${ep.type || "GET"} ${path}", data: ${primaryVar} }`;
    }
    return responseData;
  }

  // mode === "schema_builder"
  if (ep.responseFields && ep.responseFields.length > 0) {
    const fieldEntries: string[] = [];

    for (const f of ep.responseFields) {
      const fieldName = f.name || "field";
      if (!fieldName) continue;

      if (fieldName === "statusCode") {
        fieldEntries.push(`      ${fieldName}: ${statusCode}`);
        continue;
      }
      if (fieldName === "status") {
        if (f.type === "number") {
          fieldEntries.push(`      ${fieldName}: ${statusCode}`);
        } else {
          fieldEntries.push(`      ${fieldName}: "ok"`);
        }
        continue;
      }
      if (fieldName === "message") {
        fieldEntries.push(`      ${fieldName}: "Successfully executed ${ep.type || "GET"} ${path}"`);
        continue;
      }
      if (fieldName === "timestamp") {
        fieldEntries.push(`      ${fieldName}: new Date().toISOString()`);
        continue;
      }

      // Resolve variable name for DB field or entity payload
      let targetVar: string | null = null;
      if (f.type && f.type.startsWith("db:")) {
        const parts = f.type.split(":");
        const tableNodeId = parts[1];
        if (tableNodeId) {
          const mapVar = targetVarMap.get(tableNodeId);
          if (mapVar && !mapVar.endsWith("Result")) {
            targetVar = mapVar;
          }
        }
      }

      const sqlOps = pickedDbOps.filter(
        (op) => !op.fn.importPath.includes("redis") && !op.fn.name.toLowerCase().includes("cache"),
      );
      const primarySql =
        sqlOps.find((op) => op.operationKind === "create" || op.operationKind === "update") || sqlOps[0];

      if (!targetVar && pickedDbOps.length > 0) {
        const cleanName = fieldName.toLowerCase().replace(/[^a-z0-9]/g, "");
        const matchedOp = pickedDbOps.find((op) => {
          const targetClean = (op.fn.targetName || "").toLowerCase().replace(/[^a-z0-9]/g, "");
          const fnClean = op.fn.name.toLowerCase();
          return (
            (cleanName && targetClean && (cleanName.includes(targetClean) || targetClean.includes(cleanName))) ||
            (cleanName && fnClean.includes(cleanName))
          );
        });

        if (
          matchedOp &&
          matchedOp.tableNodeId &&
          targetVarMap.get(matchedOp.tableNodeId) &&
          !targetVarMap.get(matchedOp.tableNodeId)!.endsWith("Result")
        ) {
          targetVar = targetVarMap.get(matchedOp.tableNodeId)!;
        } else if (
          cleanName === "data" ||
          cleanName === "payload" ||
          cleanName === "result" ||
          (f.type && f.type.startsWith("db:"))
        ) {
          if (primarySql && primarySql.tableNodeId && targetVarMap.get(primarySql.tableNodeId)) {
            targetVar = targetVarMap.get(primarySql.tableNodeId)!;
          } else if (["post", "put", "patch"].includes(ep.type?.toLowerCase() || "")) {
            targetVar = "payload";
          } else {
            const firstOp = pickedDbOps[0];
            targetVar =
              firstOp && firstOp.tableNodeId && targetVarMap.get(firstOp.tableNodeId)
                ? targetVarMap.get(firstOp.tableNodeId)!
                : "result";
          }
        }
      }

      if (f.type && f.type.startsWith("db:")) {
        const parts = f.type.split(":");
        const category = parts[2] || "single";
        const isPartial = f.type.includes(":partial");
        const cols: string[] = f.selectedColumns || [];

        if (targetVar) {
          const isArrayCategory = category === "array" || category === "partial_array";
          const isSingleCategory = category === "single" || category === "partial_single";

          if (isPartial && cols.length > 0) {
            const pickProps = cols.map((c) => `${c}: item.${c}`).join(", ");
            if (isArrayCategory) {
              fieldEntries.push(
                `      ${fieldName}: (Array.isArray(${targetVar}) ? ${targetVar} : ${targetVar} ? [${targetVar}] : []).map((item) => ({ ${pickProps} }))`,
              );
            } else {
              fieldEntries.push(
                `      ${fieldName}: ${targetVar} ? ({ ${cols.map((c) => `${c}: ${targetVar}.${c}`).join(", ")} }) : null`,
              );
            }
          } else {
            if (isArrayCategory) {
              fieldEntries.push(
                `      ${fieldName}: Array.isArray(${targetVar}) ? ${targetVar} : ${targetVar} ? [${targetVar}] : []`,
              );
            } else if (isSingleCategory) {
              fieldEntries.push(
                `      ${fieldName}: Array.isArray(${targetVar}) ? ${targetVar}[0] : ${targetVar}`,
              );
            } else {
              fieldEntries.push(`      ${fieldName}: ${targetVar}`);
            }
          }
        } else {
          if (category === "array" || category === "partial_array") {
            fieldEntries.push(`      ${fieldName}: []`);
          } else {
            fieldEntries.push(`      ${fieldName}: {}`);
          }
        }
        continue;
      }

      if (targetVar && (fieldName === "data" || fieldName === "payload" || fieldName === "result")) {
        fieldEntries.push(`      ${fieldName}: ${targetVar}`);
        continue;
      }

      switch (f.type) {
        case "string":
          fieldEntries.push(`      ${fieldName}: "success"`);
          break;
        case "number":
          fieldEntries.push(`      ${fieldName}: 0`);
          break;
        case "boolean":
          fieldEntries.push(`      ${fieldName}: true`);
          break;
        case "array":
          fieldEntries.push(`      ${fieldName}: []`);
          break;
        case "object":
          fieldEntries.push(`      ${fieldName}: {}`);
          break;
        default:
          fieldEntries.push(`      ${fieldName}: ""`);
      }
    }

    if (fieldEntries.length > 0) {
      return `{\n${fieldEntries.join(",\n")}\n    }`;
    }
  }

  if (pickedDbOps.length > 0) {
    const lastOp = pickedDbOps[pickedDbOps.length - 1];
    const primaryVar =
      lastOp && lastOp.tableNodeId && targetVarMap.get(lastOp.tableNodeId)
        ? targetVarMap.get(lastOp.tableNodeId)!
        : lastOp
          ? `${lastOp.fn.name}Result`
          : "result";
    return `{ message: "Successfully executed ${ep.type || "GET"} ${path}", data: ${primaryVar} }`;
  }
  return responseData;
}
