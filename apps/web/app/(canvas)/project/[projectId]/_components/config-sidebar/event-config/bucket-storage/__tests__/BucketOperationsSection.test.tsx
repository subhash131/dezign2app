import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BucketOperationsSection } from "../BucketOperationsSection";
import { ConfigItemData } from "../../types";

interface MockSelectProps {
  children?: React.ReactNode;
  value?: string;
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

vi.mock("@workspace/ui/components/select", () => ({
  Select: ({ children, value }: MockSelectProps) => (
    <div data-testid="select" data-value={value}>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: MockSelectSubComponentProps) => <button>{children}</button>,
  SelectValue: ({ placeholder }: MockSelectValueProps) => <span>{placeholder}</span>,
  SelectContent: ({ children }: MockSelectSubComponentProps) => <div>{children}</div>,
  SelectItem: ({ children, value }: MockSelectItemProps) => <div data-value={value}>{children}</div>,
}));

// Mock Dialog & Subcomponents
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

vi.mock("@workspace/ui/components/switch", () => ({
  Switch: ({ checked, onCheckedChange }: { checked?: boolean; onCheckedChange?: (c: boolean) => void }) => (
    <input
      type="checkbox"
      data-testid="op-switch"
      checked={Boolean(checked)}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
    />
  ),
}));

describe("BucketOperationsSection", () => {
  const mockBucketItem: ConfigItemData = {
    id: "bucket-media-1",
    name: "media-assets",
    storageType: "s3",
    accessPolicy: "public-read",
    nodeId: "node-storage-1",
  };

  it("renders bucket operations header and standard storage operations", () => {
    const handleUpdate = vi.fn();
    render(<BucketOperationsSection item={mockBucketItem} handleUpdate={handleUpdate} />);

    expect(screen.getByText("Bucket Operations")).toBeDefined();
    expect(screen.getByText("getUploadPresignedUrl")).toBeDefined();
    expect(screen.getByText("uploadObject")).toBeDefined();
    expect(screen.getByText("getDownloadPresignedUrl")).toBeDefined();
    expect(screen.getByText("downloadObject")).toBeDefined();
    expect(screen.getByText("deleteObject")).toBeDefined();
  });

  it("calls handleUpdate with toggled operation state when switch is toggled", () => {
    const handleUpdate = vi.fn();
    render(<BucketOperationsSection item={mockBucketItem} handleUpdate={handleUpdate} />);

    const switches = screen.getAllByTestId("op-switch");
    expect(switches.length).toBeGreaterThan(0);

    // Toggle the first operation off
    fireEvent.click(switches[0]!);
    expect(handleUpdate).toHaveBeenCalledTimes(1);
    expect(handleUpdate).toHaveBeenCalledWith(
      "bucket-media-1",
      expect.objectContaining({
        storageOperations: expect.arrayContaining([
          expect.objectContaining({
            name: "getUploadPresignedUrl",
            enabled: false,
          }),
        ]),
      }),
    );
  });

  it("opens add operation dialog when clicking Add Op button", () => {
    const handleUpdate = vi.fn();
    render(<BucketOperationsSection item={mockBucketItem} handleUpdate={handleUpdate} />);

    const addOpBtn = screen.getByTitle("Add Custom Operation for this Bucket");
    expect(addOpBtn).toBeDefined();

    fireEvent.click(addOpBtn);
    expect(screen.getByTestId("storage-operation-dialog")).toBeDefined();
    expect(screen.getByText("New Custom Storage Operation")).toBeDefined();
  });

  it("opens operation configuration dialog when clicking operation settings button", () => {
    const handleUpdate = vi.fn();
    render(<BucketOperationsSection item={mockBucketItem} handleUpdate={handleUpdate} />);

    const settingsBtns = screen.getAllByTitle("Configure, Preview, or Test Operation");
    expect(settingsBtns.length).toBeGreaterThan(0);

    fireEvent.click(settingsBtns[0]!);
    expect(screen.getByTestId("storage-operation-dialog")).toBeDefined();
    expect(screen.getByText("Configure")).toBeDefined();
    expect(screen.getByText("Preview Code")).toBeDefined();
    expect(screen.getByText("Test Runner")).toBeDefined();
  });
});
