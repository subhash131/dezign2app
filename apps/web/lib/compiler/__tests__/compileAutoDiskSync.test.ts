import { describe, it, expect } from "vitest";
import { compileMonorepo } from "../compileMonorepo";
import { BackendNode, BackendEdge } from "@/types/canvas";

describe("Real-time Monorepo Disk Sync Verification", () => {
  it("should generate clean file list with distinct package paths for disk sync", () => {
    const authServiceNode: BackendNode = {
      id: "node-auth",
      type: "service",
      position: { x: 0, y: 0 },
      fractionalIndex: "a0",
      data: {
        label: "Auth Service",
        port: "8080",
      },
    };

    const edgeList: BackendEdge[] = [];
    const result = compileMonorepo([authServiceNode], [], [], edgeList, [], "Store App Monorepo");

    expect(result.files.length).toBeGreaterThan(0);
    expect(result.files.some((f) => f.filename === "package.json")).toBe(true);
    expect(result.files.some((f) => f.filename === "pnpm-workspace.yaml")).toBe(true);
    expect(result.files.some((f) => f.filename.startsWith("apps/auth-service/"))).toBe(true);

    // Verify all filenames are valid relative paths without leading slashes or Windows backslashes
    result.files.forEach((f) => {
      expect(f.filename.startsWith("/")).toBe(false);
      expect(f.filename.startsWith("\\")).toBe(false);
      expect(f.content).toBeDefined();
    });
  });

  it("should clean up stale folders and files when nodes are renamed or deleted on disk", async () => {
    const fs = await import("fs");
    const os = await import("os");
    const path = await import("path");
    const { writeProject } = await import("../../../../../apps/desktop/electron/services/fileWriter");

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "d2a-cleanup-test-"));

    try {
      // 1. Initial project write: order-service app and primary-sqlite database
      const initialFiles = [
        { filename: "package.json", language: "json", content: "{}" },
        { filename: "apps/order-service/package.json", language: "json", content: "{}" },
        { filename: "apps/order-service/src/index.ts", language: "typescript", content: "console.log('orders');" },
        { filename: "packages/db/package.json", language: "json", content: "{}" },
        { filename: "packages/db/helpers/user.ts", language: "typescript", content: "export const user = {};" },
        { filename: "packages/db/primary-sqlite/package.json", language: "json", content: "{}" },
        { filename: "packages/db/primary-sqlite/connection.ts", language: "typescript", content: "export const db = {};" },
        { filename: "packages/db/primary-sqlite/helpers/user.ts", language: "typescript", content: "export const user = {};" },
      ];

      await writeProject(tmpDir, initialFiles, { cleanStale: true });

      // Verify files created on disk
      expect(fs.existsSync(path.join(tmpDir, "apps/order-service/src/index.ts"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, "packages/db/primary-sqlite/connection.ts"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, "packages/db/helpers/user.ts"))).toBe(true);

      // 2. Rename node: order-service -> billing-service, primary-sqlite -> main-db, user -> customer
      const renamedFiles = [
        { filename: "package.json", language: "json", content: "{}" },
        { filename: "apps/billing-service/package.json", language: "json", content: "{}" },
        { filename: "apps/billing-service/src/index.ts", language: "typescript", content: "console.log('billing');" },
        { filename: "packages/db/package.json", language: "json", content: "{}" },
        { filename: "packages/db/helpers/customer.ts", language: "typescript", content: "export const customer = {};" },
        { filename: "packages/db/main-db/package.json", language: "json", content: "{}" },
        { filename: "packages/db/main-db/connection.ts", language: "typescript", content: "export const db = {};" },
        { filename: "packages/db/main-db/helpers/customer.ts", language: "typescript", content: "export const customer = {};" },
      ];

      await writeProject(tmpDir, renamedFiles, { cleanStale: true });

      // 3. Verify old folders and files are REMOVED
      expect(fs.existsSync(path.join(tmpDir, "apps/order-service"))).toBe(false);
      expect(fs.existsSync(path.join(tmpDir, "packages/db/primary-sqlite"))).toBe(false);
      expect(fs.existsSync(path.join(tmpDir, "packages/db/helpers/user.ts"))).toBe(false);

      // 4. Verify new folders and files EXIST
      expect(fs.existsSync(path.join(tmpDir, "apps/billing-service/src/index.ts"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, "packages/db/main-db/connection.ts"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, "packages/db/helpers/customer.ts"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, "packages/db/main-db/helpers/customer.ts"))).toBe(true);
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}
    }
  });
});
