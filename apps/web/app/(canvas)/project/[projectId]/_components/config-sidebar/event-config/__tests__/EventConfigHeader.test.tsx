import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EventConfigHeader } from "../EventConfigHeader";
import { ConfigItemData } from "../types";

describe("EventConfigHeader", () => {
  const mockBucketItem: ConfigItemData = {
    id: "bucket-media-1",
    name: "media-assets",
    storageType: "s3",
    accessPolicy: "public-read",
    nodeId: "node-storage-1",
  };

  it("renders BUCKET badge and editable input linked with bucket name", () => {
    const handleUpdate = vi.fn();
    render(
      <EventConfigHeader
        item={mockBucketItem}
        resourceArrayName="buckets"
        handleUpdate={handleUpdate}
      />,
    );

    expect(screen.getByText("BUCKET")).toBeDefined();
    const input = screen.getByPlaceholderText("e.g. avatars, documents");
    expect(input).toBeDefined();
    expect((input as HTMLInputElement).value).toBe("media-assets");
  });

  it("updates bucket name on change and invokes handleUpdate", () => {
    const handleUpdate = vi.fn();
    render(
      <EventConfigHeader
        item={mockBucketItem}
        resourceArrayName="buckets"
        handleUpdate={handleUpdate}
      />,
    );

    const input = screen.getByPlaceholderText("e.g. avatars, documents");
    fireEvent.change(input, { target: { value: "user-avatars" } });

    expect(handleUpdate).toHaveBeenCalledWith("bucket-media-1", {
      name: "user-avatars",
    });
  });

  it("sanitizes bucket name to valid format (lowercase, hyphens)", () => {
    const handleUpdate = vi.fn();
    render(
      <EventConfigHeader
        item={mockBucketItem}
        resourceArrayName="buckets"
        handleUpdate={handleUpdate}
      />,
    );

    const input = screen.getByPlaceholderText("e.g. avatars, documents");
    fireEvent.change(input, { target: { value: "User_Avatars@2026!" } });

    expect(handleUpdate).toHaveBeenCalledWith("bucket-media-1", {
      name: "user-avatars-2026-",
    });
  });
});
