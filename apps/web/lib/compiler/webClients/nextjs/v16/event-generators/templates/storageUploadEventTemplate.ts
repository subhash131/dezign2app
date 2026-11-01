import { StoreActionBinding } from "@workspace/canvas/types";
import { resolveStoreActionMethodName } from "../../storeActionResolver";
import { resolveBaseUrlInfo } from "../paramUtils";

export interface StorageUploadConfig {
  /** Maximum file size in megabytes derived from the connected bucket config */
  maxSizeMb: number;
  /** Comma-separated accepted MIME types, e.g. "image/jpeg,image/png" */
  acceptedMimeTypes: string;
  /** Whether to show a thumbnail preview for images */
  showPreview: boolean;
}

/**
 * Generates a file-upload React component for WebPage actions connected to a StorageRef node.
 *
 * Features:
 *  - Hidden <input type="file"> with accept attribute from bucket config
 *  - Client-side type and size validation with inline warning
 *  - Optional thumbnail preview for image uploads
 *  - Two-step upload: POST /endpoint -> get { signedUrl, key }, then PUT file to signedUrl
 */
export function generateStorageUploadEventTemplate({
  componentName,
  eventName,
  eventType,
  url,
  upperMethod,
  requireAuth = false,
  typeDefs,
  storageConfig,
  storeActionBinding,
  storeActionBindings,
  serviceName,
}: {
  componentName: string;
  eventName: string;
  eventType: string;
  url: string;
  upperMethod: string;
  requireAuth?: boolean;
  typeDefs: string[];
  storageConfig: StorageUploadConfig;
  storeActionBinding?: StoreActionBinding;
  storeActionBindings?: StoreActionBinding[];
  serviceName?: string;
}): string {
  const { maxSizeMb, acceptedMimeTypes, showPreview } = storageConfig;
  const urlInfo = resolveBaseUrlInfo(url, serviceName);

  const bindings: StoreActionBinding[] =
    Array.isArray(storeActionBindings) && storeActionBindings.length > 0
      ? storeActionBindings
      : storeActionBinding
      ? [storeActionBinding]
      : [];

  const uniqueStoreNames = Array.from(
    new Set(
      bindings
        .map((b) => b.storeName?.replace(/Store$/i, ""))
        .filter((n): n is string => Boolean(n)),
    ),
  );

  const storeImports =
    uniqueStoreNames.length > 0
      ? uniqueStoreNames
          .map((raw) => {
            const hook = `use${raw.charAt(0).toUpperCase() + raw.slice(1)}Store`;
            return `import { ${hook} } from "@/lib/stores";`;
          })
          .join("\n") + "\n"
      : "";

  const generatePostStoreUpdates = (): string => {
    let postTrigger = "";
    bindings.forEach((b) => {
      const rawStoreName = b.storeName?.replace(/Store$/i, "");
      if (!rawStoreName) return;
      const hookName = `use${rawStoreName.charAt(0).toUpperCase() + rawStoreName.slice(1)}Store`;
      const actionName = resolveStoreActionMethodName(b);
      postTrigger += `      ${hookName}.getState().${actionName}({ signedUrl, key: objectKey });\n`;
    });
    return postTrigger;
  };

  const postStoreUpdates = generatePostStoreUpdates();
  const acceptAttr = acceptedMimeTypes ? ` accept="${acceptedMimeTypes}"` : "";

  const previewStateDecl = showPreview
    ? `  const [preview, setPreview] = useState<string | null>(null);\n`
    : "";

  const previewLogic = showPreview
    ? `    // Show thumbnail for image files\n    if (file.type.startsWith("image/")) {\n      const objUrl = URL.createObjectURL(file);\n      setPreview(objUrl);\n    } else {\n      setPreview(null);\n    }\n`
    : "";

  const previewJsx = showPreview
    ? `      {preview && (\n        <img src={preview} alt="File preview" className="w-24 h-24 object-cover rounded-md border border-border" />\n      )}\n`
    : "";

  const typedefsJoined = typeDefs.join("\n\n");
  const requireAuthStr = String(Boolean(requireAuth));

  return `"use client";

import React, { useState, useRef } from "react";
import { Button } from "@workspace/ui/components/button";
import { Upload } from "lucide-react";
${storeImports}
${typedefsJoined}

// Storage constraints derived from connected bucket config
const MAX_FILE_SIZE_MB = ${maxSizeMb};
const ACCEPTED_TYPES: string = "${acceptedMimeTypes}";

export function ${componentName}({ onTrigger }: ${componentName}Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
${previewStateDecl}  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setWarning(null);
    const file = e.target.files?.[0];
    if (!file) { setSelectedFile(null); return; }

    // Type validation
    if (ACCEPTED_TYPES.length > 0) {
      const accepted: string[] = ACCEPTED_TYPES.split(",").map((t: string) => t.trim().toLowerCase()).filter(Boolean);
      const isAllowed =
        accepted.length === 0 ||
        accepted.some((t: string) => {
          if (t.startsWith(".")) return file.name.toLowerCase().endsWith(t);
          if (t.endsWith("/*")) return file.type.toLowerCase().startsWith(t.slice(0, -1));
          return t === file.type.toLowerCase();
        });
      if (!isAllowed) {
        setWarning("Unsupported type: " + (file.type || file.name) + ". Accepted: " + ACCEPTED_TYPES);
        e.target.value = "";
        setSelectedFile(null);
        return;
      }
    }
    // Size validation
    if (MAX_FILE_SIZE_MB > 0 && file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setWarning(String('File too large (' + (file.size / 1024 / 1024).toFixed(1) + ' MB). Max: ${maxSizeMb} MB'));
      e.target.value = "";
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
${previewLogic}  };

  const handleUpload = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!selectedFile) { setWarning("Please select a file first."); return; }
    setIsSubmitting(true);
    setWarning(null);
    try {
      // Step 1: Request a presigned upload URL from the backend
${urlInfo.baseUrlDeclaration ? `      ${urlInfo.baseUrlDeclaration}\n` : ""}      const presignResult = await onTrigger?.(
        "${eventName}",
        "${eventType}",
        ${urlInfo.urlExpression},
        "${upperMethod}",
        ${requireAuthStr},
        undefined,
        undefined,
        { fileName: selectedFile.name, fileType: selectedFile.type, fileSize: selectedFile.size },
      );

      const presignObj: Record<string, string | number | boolean | null | undefined | Record<string, string | number | boolean | null | undefined>> =
        presignResult && typeof presignResult === "object" ? presignResult : {};
      const nestedData: Record<string, string | number | boolean | null | undefined> =
        presignObj.data && typeof presignObj.data === "object" ? presignObj.data : {};
      const signedUrl: string | undefined =
        typeof presignObj.signedUrl === "string"
          ? presignObj.signedUrl
          : typeof nestedData.signedUrl === "string"
          ? nestedData.signedUrl
          : typeof presignObj.presignedUrl === "string"
          ? presignObj.presignedUrl
          : typeof nestedData.presignedUrl === "string"
          ? nestedData.presignedUrl
          : typeof presignObj.uploadUrl === "string"
          ? presignObj.uploadUrl
          : typeof nestedData.uploadUrl === "string"
          ? nestedData.uploadUrl
          : typeof nestedData.url === "string"
          ? nestedData.url
          : typeof presignObj.url === "string" && presignObj.url !== ${urlInfo.urlExpression}
          ? presignObj.url
          : undefined;
      const objectKey: string | undefined =
        typeof presignObj.key === "string"
          ? presignObj.key
          : typeof nestedData.key === "string"
          ? nestedData.key
          : typeof presignObj.objectKey === "string"
          ? presignObj.objectKey
          : typeof nestedData.objectKey === "string"
          ? nestedData.objectKey
          : selectedFile.name;

      if (!signedUrl) throw new Error("No presigned URL returned from server");

      // Step 2: PUT the file directly to cloud storage (no server bandwidth consumed)
      const uploadHeaders: Record<string, string> = {};
      if (selectedFile.type) {
        uploadHeaders["Content-Type"] = selectedFile.type;
      }
      const uploadRes = await fetch(signedUrl, {
        method: "PUT",
        body: selectedFile,
        headers: uploadHeaders,
      });
      if (!uploadRes.ok) {
        throw new Error(String('Upload failed: ' + uploadRes.status + ' ' + uploadRes.statusText));
      }
${postStoreUpdates}    } catch (err) {
      setWarning(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
${previewJsx}      <input
        ref={fileInputRef}
        type="file"${acceptAttr}
        className="hidden"
        onChange={handleFileChange}
      />
      <div className="flex gap-2 items-center">
        <Button
          type="button"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={isSubmitting}
          className="cursor-pointer"
        >
          <Upload className="mr-2 h-4 w-4" />
          {selectedFile ? selectedFile.name : "Choose File"}
        </Button>
        <Button
          onClick={handleUpload}
          disabled={isSubmitting || !selectedFile}
          className="cursor-pointer font-medium shadow-sm"
        >
          {isSubmitting ? "Uploading..." : "${eventName}"}
        </Button>
      </div>
      {warning && <p className="text-sm text-destructive">{warning}</p>}
    </div>
  );
}

export default ${componentName};
`;
}