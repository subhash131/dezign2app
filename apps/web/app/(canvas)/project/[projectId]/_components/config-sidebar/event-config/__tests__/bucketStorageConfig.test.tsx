import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BucketStorageConfig } from "../BucketStorageConfig";
import { ConfigItemData } from "../types";

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

interface MockSwitchProps {
  id?: string;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

interface MockBadgeProps {
  children?: React.ReactNode;
  className?: string;
}

interface MockButtonProps {
  children?: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  className?: string;
}

// Mock @workspace/ui components
vi.mock("@workspace/ui/components/select", () => ({
  Select: ({ children, value, onValueChange }: MockSelectProps) => (
    <div data-testid="select" data-value={value} onClick={() => onValueChange?.("blob")}>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: MockSelectSubComponentProps) => <button>{children}</button>,
  SelectValue: ({ placeholder }: MockSelectValueProps) => <span>{placeholder}</span>,
  SelectContent: ({ children }: MockSelectSubComponentProps) => <div>{children}</div>,
  SelectItem: ({ children, value }: MockSelectItemProps) => <div data-value={value}>{children}</div>,
}));

vi.mock("@workspace/ui/components/switch", () => ({
  Switch: ({ id, checked, onCheckedChange }: MockSwitchProps) => (
    <input
      id={id}
      type="checkbox"
      role="switch"
      data-testid={id || "switch"}
      checked={Boolean(checked)}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
    />
  ),
}));

vi.mock("@workspace/ui/components/badge", () => ({
  Badge: ({ children, className }: MockBadgeProps) => <span className={className}>{children}</span>,
}));

vi.mock("@workspace/ui/components/button", () => ({
  Button: ({ children, onClick, className }: MockButtonProps) => (
    <button onClick={onClick} className={className}>
      {children}
    </button>
  ),
}));

vi.mock("@workspace/ui/components/dialog", () => ({
  Dialog: ({ children, open }: { children?: React.ReactNode; open?: boolean }) =>
    open ? <div data-testid="storage-operation-dialog">{children}</div> : null,
  DialogContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children?: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@workspace/ui/components/tabs", () => ({
  Tabs: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children?: React.ReactNode }) => <button>{children}</button>,
  TabsContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("../../../backend-nodes/graph-nodes/Editors", () => ({
  SchemaEditor: ({ title }: { title?: string }) => (
    <div data-testid="schema-editor">{title}</div>
  ),
}));

describe("BucketStorageConfig component", () => {
  const baseItem: ConfigItemData = {
    id: "bucket-user-avatars",
    name: "user-avatars",
    storageType: "s3",
    accessPolicy: "private",
    allowedOperations: ["read", "write"],
    storedDataTypes: ["Image"],
    enablePresignedUrls: true,
    presignedUrlTtl: "900",
    enableCors: true,
    corsOrigins: "*",
    corsMethods: ["GET", "PUT", "POST", "HEAD"],
    encryption: "SSE-S3",
    versioning: "Enabled",
    eventTriggers: ["s3:ObjectCreated:*"],
  };

  it("renders status chips and configured sections", () => {
    const handleUpdate = vi.fn();
    render(<BucketStorageConfig item={baseItem} handleUpdate={handleUpdate} />);

    // Renders section titles
    expect(screen.getByText("Object Metadata Schema")).toBeDefined();
    expect(screen.getByText("Bucket Tier & Storage Class")).toBeDefined();
    expect(screen.getByText("Connectability & Access Control")).toBeDefined();
    expect(screen.getByText("CORS & Web Client Ingress")).toBeDefined();
    expect(screen.getByText("Object Types & Size Limits")).toBeDefined();
    expect(screen.getByText("Bucket Event Notifications")).toBeDefined();
  });

  it("hides metadata fields by default when enableMetadata is false/undefined", () => {
    const handleUpdate = vi.fn();
    render(<BucketStorageConfig item={baseItem} handleUpdate={handleUpdate} />);

    // SchemaEditor should not be visible when metadata is not enabled
    expect(screen.queryByTestId("schema-editor")).toBeNull();

    // Toggle switch is unchecked
    const metadataSwitch = screen.getByTestId("enable-metadata-switch") as HTMLInputElement;
    expect(metadataSwitch.checked).toBe(false);

    // Clicking switch toggles enableMetadata to true
    fireEvent.click(metadataSwitch);
    expect(handleUpdate).toHaveBeenCalledWith(
      "bucket-user-avatars",
      expect.objectContaining({
        enableMetadata: true,
      }),
    );
  });

  it("shows metadata fields when enableMetadata is true", () => {
    const handleUpdate = vi.fn();
    render(
      <BucketStorageConfig
        item={{ ...baseItem, enableMetadata: true }}
        handleUpdate={handleUpdate}
      />,
    );

    // SchemaEditor should now be visible
    expect(screen.getByTestId("schema-editor")).toBeDefined();
    expect(screen.getByText("Custom Metadata Fields")).toBeDefined();

    // Toggle switch is checked
    const metadataSwitch = screen.getByTestId("enable-metadata-switch") as HTMLInputElement;
    expect(metadataSwitch.checked).toBe(true);

    // Clicking switch toggles enableMetadata to false
    fireEvent.click(metadataSwitch);
    expect(handleUpdate).toHaveBeenCalledWith(
      "bucket-user-avatars",
      expect.objectContaining({
        enableMetadata: false,
      }),
    );
  });

  it("supports KB preset file sizes like 250KB and 500KB", () => {
    const handleUpdate = vi.fn();
    render(<BucketStorageConfig item={baseItem} handleUpdate={handleUpdate} />);

    // Verify 250KB preset is available
    const preset250kb = screen.getByRole("button", { name: "250KB" });
    expect(preset250kb).toBeDefined();

    fireEvent.click(preset250kb);
    expect(handleUpdate).toHaveBeenCalledWith(
      "bucket-user-avatars",
      expect.objectContaining({
        maxFileSize: "250KB",
      }),
    );
  });

  it("toggles allowed operations", () => {
    const handleUpdate = vi.fn();
    render(<BucketStorageConfig item={baseItem} handleUpdate={handleUpdate} />);

    // Click 'Delete' operation toggle button
    const deleteButton = screen.getByText("Delete").closest("button");
    expect(deleteButton).not.toBeNull();
    fireEvent.click(deleteButton!);

    expect(handleUpdate).toHaveBeenCalledWith(
      "bucket-user-avatars",
      expect.objectContaining({
        allowedOperations: ["read", "write", "delete"],
      }),
    );
  });

  it("toggles CORS HTTP methods", () => {
    const handleUpdate = vi.fn();
    render(<BucketStorageConfig item={baseItem} handleUpdate={handleUpdate} />);

    // Find DELETE method in CORS methods
    const deleteCorsMethodBtn = screen.getByRole("button", { name: "DELETE" });
    fireEvent.click(deleteCorsMethodBtn);

    expect(handleUpdate).toHaveBeenCalledWith(
      "bucket-user-avatars",
      expect.objectContaining({
        corsMethods: expect.arrayContaining(["GET", "PUT", "POST", "HEAD", "DELETE"]),
      }),
    );
  });

  it("updates presigned URL TTL preset", () => {
    const handleUpdate = vi.fn();
    render(<BucketStorageConfig item={baseItem} handleUpdate={handleUpdate} />);

    // Click 1h preset
    const preset1h = screen.getByText("1h");
    fireEvent.click(preset1h);

    expect(handleUpdate).toHaveBeenCalledWith(
      "bucket-user-avatars",
      expect.objectContaining({
        presignedUrlTtl: "3600",
      }),
    );
  });

  it("toggles event notification triggers", () => {
    const handleUpdate = vi.fn();
    render(<BucketStorageConfig item={baseItem} handleUpdate={handleUpdate} />);

    // Find the Object Removed trigger
    const removeTrigger = screen.getByText("Object Removed (Delete)");
    fireEvent.click(removeTrigger);

    expect(handleUpdate).toHaveBeenCalledWith(
      "bucket-user-avatars",
      expect.objectContaining({
        eventTriggers: expect.arrayContaining([
          "s3:ObjectCreated:*",
          "s3:ObjectRemoved:*",
        ]),
      }),
    );
  });

  it("renders live configuration and SDK preview with all settings", () => {
    const handleUpdate = vi.fn();
    render(<BucketStorageConfig item={baseItem} handleUpdate={handleUpdate} />);

    expect(screen.getByText("Configuration & SDK Preview")).toBeDefined();
    expect(screen.getByText("SDK Code")).toBeDefined();
    expect(screen.getByText("Config Spec (JSON)")).toBeDefined();
    expect(screen.getByText(".env File")).toBeDefined();
    expect(screen.getByText(/import \{ S3Client.*\} from "@aws-sdk\/client-s3"/)).toBeDefined();
    expect(screen.getAllByText(/user-avatars/).length).toBeGreaterThan(0);
    expect(screen.getByText(/AWS_ACCESS_KEY_ID/)).toBeDefined();
  });
});
