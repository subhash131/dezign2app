"use client";

import React, { useMemo } from "react";
import type { ResponseFieldPickerProps } from "./types";
import { extractResponseFieldSuggestions } from "./utils";
import { ActionFlowCombobox, ComboboxOption } from "./ActionFlowCombobox";

const KNOWN_FIELD_TYPES: Record<string, string> = {
  presignedUrl: "url",
  signedUrl: "url",
  uploadUrl: "url",
  downloadUrl: "url",
  url: "url",
  fileUrl: "url",
  "data.presignedUrl": "url",
  "data.url": "url",
  key: "string",
  fileKey: "string",
  id: "string",
  fileName: "string",
  fileType: "string",
  fileSize: "number",
  status: "string",
  success: "boolean",
  data: "object",
  error: "string",
};

export const ResponseFieldPicker: React.FC<ResponseFieldPickerProps> = ({
  value,
  onChange,
  endpoint,
  placeholder = "e.g. data.id or token",
  disabled = false,
  isStorage = false,
}) => {
  const suggestions = useMemo(() => {
    const raw = extractResponseFieldSuggestions(endpoint, { isStorage });
    const options: ComboboxOption[] = [];

    // Map known field types or types from endpoint definition
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
      options.push({
        value: item,
        label: item,
        type: endpointFieldTypes.get(item) || KNOWN_FIELD_TYPES[item] || "property",
      });
    });

    return options;
  }, [endpoint, isStorage]);

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
