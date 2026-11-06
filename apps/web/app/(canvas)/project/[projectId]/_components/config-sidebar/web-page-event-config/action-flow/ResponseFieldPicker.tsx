"use client";

import React, { useMemo } from "react";
import type { ResponseFieldPickerProps } from "./types";
import { extractResponseFieldSuggestions, extractStepFieldOptions, KNOWN_FIELD_TYPES } from "./utils";
import { ActionFlowCombobox, ComboboxOption } from "./ActionFlowCombobox";

export const ResponseFieldPicker: React.FC<ResponseFieldPickerProps> = ({
  value,
  onChange,
  endpoint,
  step,
  allNodes,
  endpoints,
  customSuggestions = [],
  placeholder = "e.g. data.id or token",
  disabled = false,
  isStorage = false,
}) => {
  const suggestions = useMemo(() => {
    const stepOptions = step
      ? extractStepFieldOptions(step, { isStorage, allNodes, endpoints })
      : [];

    const endpointOptions: ComboboxOption[] = [];
    if (endpoint || isStorage) {
      const raw = extractResponseFieldSuggestions(endpoint, { isStorage });
      const endpointFieldTypes = new Map<string, string>();
      if (endpoint?.responseBody?.fields) {
        for (const f of endpoint.responseBody.fields) {
          if (f.name && f.type) endpointFieldTypes.set(f.name, f.type);
        }
      }
      if (endpoint?.responseFields) {
        for (const rf of endpoint.responseFields) {
          if (rf.name && rf.type) {
            endpointFieldTypes.set(rf.name, rf.type);
          }
        }
      }

      raw.forEach((item) => {
        endpointOptions.push({
          value: item,
          label: item,
          type: endpointFieldTypes.get(item) || KNOWN_FIELD_TYPES[item] || "property",
        });
      });
    }

    const seen = new Set<string>();
    const merged: ComboboxOption[] = [];

    [...stepOptions, ...endpointOptions, ...customSuggestions].forEach((opt) => {
      if (opt.value && !seen.has(opt.value)) {
        seen.add(opt.value);
        merged.push(opt);
      }
    });

    return merged;
  }, [step, endpoint, allNodes, endpoints, customSuggestions, isStorage]);

  return (
    <ActionFlowCombobox
      value={value}
      onChange={onChange}
      options={suggestions}
      placeholder={placeholder}
      headerLabel="Suggested Response Fields"
      disabled={disabled}
      rootOptionLabel="(whole response)"
    />
  );
};
