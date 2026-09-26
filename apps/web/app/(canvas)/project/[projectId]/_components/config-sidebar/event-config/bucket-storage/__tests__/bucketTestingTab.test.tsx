import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BucketTestingTab } from "../BucketTestingTab";
import { ConfigItemData } from "../../types";
import {
  checkStorageConnection,
  executeStorageOperation,
  createStorageBucket,
  listStorageBuckets,
} from "@/lib/services/storageService";

interface MockSelectProps {
  children?: React.ReactNode;
  value?: string;
  onValueChange?: (value: string) => void;
}

interface MockSelectSubComponentProps {
  children?: React.ReactNode;
}

interface MockSelectValueProps {
  placeholder?: string;
}

interface MockSelectItemProps {
  children?: React.ReactNode;
  value?: string;
}

interface MockBadgeProps {
  children?: React.ReactNode;
  className?: string;
}

interface MockButtonProps {
  children?: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  className?: string;
  disabled?: boolean;
}

vi.mock("@workspace/ui/components/select", () => ({
  Select: ({ children, value, onValueChange }: MockSelectProps) => (
    <div
      data-testid="select"
      data-value={value}
      onClick={() => onValueChange?.("getUploadPresignedUrl")}
    >
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: MockSelectSubComponentProps) => <button>{children}</button>,
  SelectValue: ({ placeholder }: MockSelectValueProps) => <span>{placeholder}</span>,
  SelectContent: ({ children }: MockSelectSubComponentProps) => <div>{children}</div>,
  SelectItem: ({ children, value }: MockSelectItemProps) => <div data-value={value}>{children}</div>,
}));

vi.mock("@workspace/ui/components/badge", () => ({
  Badge: ({ children, className }: MockBadgeProps) => <span className={className}>{children}</span>,
}));

vi.mock("@workspace/ui/components/button", () => ({
  Button: ({ children, onClick, className, disabled }: MockButtonProps) => (
    <button onClick={onClick} className={className} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock("@/lib/services/storageService", () => ({
  checkStorageConnection: vi.fn(async (config) => ({
    success: true,
    serverActive: true,
    status: 200,
    statusText: "OK",
    durationMs: 24,
    endpoint: config.endpointUrl || "https://s3.us-east-1.amazonaws.com",
    bucket: config.bucketName,
    region: config.region || "us-east-1",
    serverHeader: "MinIO/RELEASE.2024",
    headers: { "x-amz-request-id": "req-123", server: "MinIO/RELEASE.2024" },
  })),
  executeStorageOperation: vi.fn(async (payload) => ({
    success: true,
    serverActive: true,
    status: 200,
    statusText: "OK",
    durationMs: 18,
    endpoint: payload.connection.endpointUrl || "https://s3.us-east-1.amazonaws.com",
    method: payload.operation === "uploadObject" ? "PUT" : "GET",
    url: `${payload.connection.endpointUrl || "https://s3.us-east-1.amazonaws.com"}/${payload.connection.bucketName}/${payload.params.key}`,
    headers: { "x-amz-request-id": "req-456", etag: '"3a8b2c"' },
    data: {
      $metadata: { httpStatusCode: 200 },
      ETag: '"3a8b2c"',
      bucket: payload.connection.bucketName,
      key: payload.params.key,
    },
  })),
  createStorageBucket: vi.fn(async (_connection, bucketName) => ({
    success: false,
    bucketName: bucketName || "default-bucket",
    status: 403,
    statusText: "Forbidden",
    message: "Access Denied. SignatureDoesNotMatch",
    error: "Access Denied. SignatureDoesNotMatch",
  })),
  listStorageBuckets: vi.fn(async () => ({
    success: true,
    buckets: [{ name: "existing-bucket-1" }, { name: "existing-bucket-2" }],
  })),
}));

describe("BucketTestingTab component", () => {
  const baseItem: ConfigItemData = {
    id: "bucket-user-avatars",
    name: "user-avatars",
    storageType: "s3",
    region: "us-east-1",
    accessPolicy: "private",
    allowedOperations: ["read", "write"],
    storedDataTypes: ["Image"],
    enablePresignedUrls: true,
    presignedUrlTtl: "900",
    maxFileSize: "10MB",
    enableMetadata: true,
  };

  it("renders operations runner view by default with live server banner and generated code preview", () => {
    render(<BucketTestingTab item={baseItem} />);

    expect(screen.getByText("Test Operations")).toBeDefined();
    expect(screen.getByText("Test Connection")).toBeDefined();
    expect(screen.getByText("Vitest Suite")).toBeDefined();
    expect(screen.getByText("Configured Storage Server:")).toBeDefined();
    expect(screen.getByText("Live Server Dispatch")).toBeDefined();
    expect(screen.getByText("Generated Code Under Test")).toBeDefined();
    expect(screen.getByText(/import \{ uploadObject \} from "@workspace\/storage\/operations"/)).toBeDefined();
  });

  it("dispatches live uploadObject() test to configured server and renders response", async () => {
    render(<BucketTestingTab item={baseItem} />);

    const runButton = screen.getByRole("button", { name: /Run uploadObject\(\) Test \(Hit Server\)/i });
    expect(runButton).toBeDefined();

    fireEvent.click(runButton);

    await waitFor(() => {
      expect(executeStorageOperation).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: "uploadObject",
          connection: expect.objectContaining({
            bucketName: "user-avatars",
          }),
        }),
      );
      expect(screen.getByText("Live Server Response:")).toBeDefined();
      expect(screen.getByText(/3a8b2c/)).toBeDefined();
    });
  });

  it("dispatches live connection test to configured server and verifies reachability", async () => {
    render(<BucketTestingTab item={baseItem} />);

    const connTabButton = screen.getByText("Test Connection");
    fireEvent.click(connTabButton);

    expect(screen.getByText("Storage Client Connection Spec")).toBeDefined();
    expect(screen.getByText("Generated Connection Test Code")).toBeDefined();
    expect(screen.getByText(/HeadBucketCommand/)).toBeDefined();

    const testConnButton = screen.getByRole("button", { name: /Ping Server & Test S3 Connection/i });
    fireEvent.click(testConnButton);

    await waitFor(() => {
      expect(checkStorageConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          bucketName: "user-avatars",
        }),
      );
      expect(screen.getByText("Server Active")).toBeDefined();
      expect(screen.getByText(/Successfully contacted storage server/)).toBeDefined();
      expect(screen.getByText("MinIO/RELEASE.2024")).toBeDefined();
    });
  });

  it("switches to Vitest Suite view and displays the generated test suite", () => {
    render(<BucketTestingTab item={baseItem} />);

    const suiteTabButton = screen.getByText("Vitest Suite");
    fireEvent.click(suiteTabButton);

    expect(screen.getByText("Generated Vitest Storage Suite")).toBeDefined();
    expect(screen.getByText(/describe\("user-avatars — Generated S3 Client & Operations Suite"/)).toBeDefined();
    expect(screen.getByText("Copy Test File")).toBeDefined();
  });

  it("handles live server connection failure gracefully with actionable error", async () => {
    vi.mocked(checkStorageConnection).mockResolvedValueOnce({
      success: false,
      serverActive: false,
      status: 0,
      statusText: "Connection Failed",
      durationMs: 15,
      endpoint: "http://localhost:9000",
      bucket: "user-avatars",
      region: "us-east-1",
      error: "Could not connect to storage server at http://localhost:9000 (ECONNREFUSED)",
      tip: "Ensure your MinIO/LocalStack/S3 server is running on the configured endpoint.",
    });

    render(<BucketTestingTab item={{ ...baseItem, endpointUrl: "http://localhost:9000" }} />);

    const connTabButton = screen.getByText("Test Connection");
    fireEvent.click(connTabButton);

    const testConnButton = screen.getByRole("button", { name: /Ping Server & Test S3 Connection/i });
    fireEvent.click(testConnButton);

    await waitFor(() => {
      expect(screen.getByText("Server Inactive / Unreachable")).toBeDefined();
      expect(screen.getByText(/ECONNREFUSED/)).toBeDefined();
      expect(screen.getByText(/Ensure your MinIO\/LocalStack\/S3 server is running/)).toBeDefined();
    });
  });

  it("displays inline error response without popups or alerts when bucket creation fails", async () => {
    vi.mocked(checkStorageConnection).mockResolvedValueOnce({
      success: false,
      serverActive: true,
      status: 404,
      statusText: "Not Found",
      durationMs: 12,
      endpoint: "http://localhost:8333",
      bucket: "missing-bucket",
      region: "us-east-1",
      bucketExists: false,
      error: "Bucket 'missing-bucket' does not exist (404 NoSuchBucket)",
      tip: "Verify your bucket name or create it.",
    });

    vi.mocked(createStorageBucket).mockResolvedValueOnce({
      success: false,
      bucketName: "missing-bucket",
      status: 403,
      statusText: "Forbidden",
      message: "Access Denied. Check credentials.",
      error: "Access Denied. Check credentials.",
    });

    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});

    render(<BucketTestingTab item={{ ...baseItem, name: "missing-bucket", endpointUrl: "http://localhost:8333" }} />);

    const connTabButton = screen.getByText("Test Connection");
    fireEvent.click(connTabButton);

    const testConnButton = screen.getByRole("button", { name: /Ping Server & Test S3 Connection/i });
    fireEvent.click(testConnButton);

    await waitFor(() => {
      expect(screen.getByText(/Bucket "missing-bucket" not found on server/i)).toBeDefined();
    });

    const createButton = screen.getByRole("button", { name: /Create Bucket on Server/i });
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(createStorageBucket).toHaveBeenCalled();
      expect(screen.getByText("Access Denied. Check credentials.")).toBeDefined();
      expect(alertSpy).not.toHaveBeenCalled();
    });

    alertSpy.mockRestore();
  });
});
