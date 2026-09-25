import { GlobalStoreAction, GlobalStoreField } from "@workspace/canvas/types";

export interface ActionValidation {
  errors: string[];
  warnings: string[];
}

export function validateStoreAction({
  action,
  allActions,
  fields,
}: {
  action: GlobalStoreAction;
  allActions: GlobalStoreAction[];
  fields: GlobalStoreField[];
}): ActionValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  const name = action.name?.trim();
  if (!name) {
    errors.push("Action name is required");
  } else {
    if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name)) {
      errors.push("Action name must be alphanumeric with no spaces");
    }

    const duplicates = allActions.filter(
      (a) => a.id !== action.id && a.name?.trim().toLowerCase() === name.toLowerCase(),
    );
    if (duplicates.length > 0) {
      errors.push(`Action "${name}" is duplicated in this store`);
    }

    const lower = name.toLowerCase();
    const isBuiltinCollision = lower === "populate" || lower === "reset" || lower === "load";
    const setterCollision = fields.some(
      (f) => lower === `set${f.name.toLowerCase()}`,
    );
    if (!action.defaultManipulatorType && (isBuiltinCollision || setterCollision)) {
      warnings.push(`"${name}" collides with a default manipulator name.`);
    }
  }

  if (action.parameters && action.parameters.length > 0) {
    const paramNames = new Set<string>();
    const reservedWords = new Set([
      "set",
      "get",
      "initialState",
      "state",
      "function",
      "var",
      "let",
      "const",
      "return",
    ]);
    action.parameters.forEach((p, idx) => {
      const pName = p.name?.trim();
      if (!pName) {
        errors.push(`Arg #${idx + 1} name is empty`);
      } else {
        if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(pName)) {
          errors.push(`Arg "${pName}" has invalid identifier characters`);
        }
        if (reservedWords.has(pName)) {
          errors.push(`Arg "${pName}" conflicts with store scope reserved word`);
        }
        if (paramNames.has(pName.toLowerCase())) {
          errors.push(`Duplicate argument name "${pName}"`);
        }
        paramNames.add(pName.toLowerCase());
      }
    });
  }

  if (action.actionType === "custom" && (!action.code || !action.code.trim())) {
    warnings.push("Custom action has no implementation code yet");
  }

  return { errors, warnings };
}
