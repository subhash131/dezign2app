import { describe, it, expect } from "vitest";
import { BackendNode, BackendEdge } from "@/types/canvas";
import { compileStorageNodes } from "../storage";
import { compileMonorepo } from "../compileMonorepo";
import { getUniqueNodeLabel } from "@workspace/canvas";

describe("compileStorageNodes", () => {
  it("returns empty structure when no storage nodes exist", () => {
    const nodes: BackendNode[] = [
      {
        id: "service-1",
        type: "service",
        position: { x: 0, y: 0 },
        fractionalIndex: "a0",
        data: { label: "User Service" },
      },
    ];

    const result = compileStorageNodes(nodes);
    expect(result.files).toHaveLength(0);
    expect(result.reusableFunctions).toHaveLength(0);
    expect(result.packageFolder).toBe("storage");
    expect(result.packageName).toBe("@workspace/storage");
  });

  it("compiles a standalone storage node with bucket resources into @workspace/storage", () => {
    const nodes: BackendNode[] = [
      {
        id: "storage-1",
        type: "storage",
        position: { x: 100, y: 100 },
        fractionalIndex: "a0",
        data: {
          label: "Media Storage",
          storageProvider: "s3",
          defaultRegion: "us-west-2",
          accessPolicy: "private",
          buckets: [
            {
              id: "b-1",
              name: "user-avatars",
              description: "User profile pictures",
              accessPolicy: "public-read",
              enableCors: true,
              enableCdn: true,
              cdnDomain: "https://cdn.example.com",
            },
            {
              id: "b-2",
              name: "private-documents",
              description: "Invoices and contracts",
              accessPolicy: "private",
              enablePresignedUrls: true,
              presignedUrlTtl: "1800",
            },
          ],
        },
      },
    ];

    const result = compileStorageNodes(nodes);

    expect(result.packageFolder).toBe("storage");
    expect(result.packageName).toBe("@workspace/storage");
    expect(result.files.length).toBeGreaterThan(0);

    // 1. package.json
    const pkgJson = result.files.find((f) => f.filename === "package.json");
    expect(pkgJson).toBeDefined();
    const pkgParsed = JSON.parse(pkgJson!.content);
    expect(pkgParsed.name).toBe("@workspace/storage");
    expect(pkgParsed.dependencies["@aws-sdk/client-s3"]).toBeDefined();
    expect(pkgParsed.dependencies["@aws-sdk/s3-request-presigner"]).toBeDefined();

    // 2. tsconfig.json
    const tsconfig = result.files.find((f) => f.filename === "tsconfig.json");
    expect(tsconfig).toBeDefined();
    expect(tsconfig!.content).toContain("@workspace/typescript-config/base.json");

    // 3. config.ts
    const config = result.files.find((f) => f.filename === "src/config.ts");
    expect(config).toBeDefined();
    expect(config!.content).toContain('"us-west-2"');
    expect(config!.content).toContain('"s3"');

    // 4. client.ts
    const client = result.files.find((f) => f.filename === "src/client.ts");
    expect(client).toBeDefined();
    expect(client!.content).toContain("new S3Client");

    // 5. buckets.ts
    const buckets = result.files.find((f) => f.filename === "src/buckets.ts");
    expect(buckets).toBeDefined();
    expect(buckets!.content).toContain("USER_AVATARS: process.env.STORAGE_BUCKET_USER_AVATARS || \"user-avatars\"");
    expect(buckets!.content).toContain("PRIVATE_DOCUMENTS: process.env.STORAGE_BUCKET_PRIVATE_DOCUMENTS || \"private-documents\"");
    expect(buckets!.content).toContain('"https://cdn.example.com"');

    // 6. operations.ts
    const ops = result.files.find((f) => f.filename === "src/operations.ts");
    expect(ops).toBeDefined();
    expect(ops!.content).toContain("export async function getUploadPresignedUrl");
    expect(ops!.content).toContain("export async function getDownloadPresignedUrl");
    expect(ops!.content).toContain("export async function uploadObject");
    expect(ops!.content).toContain("export async function deleteObject");

    // 7. reusableFunctions
    expect(result.reusableFunctions.some((rf) => rf.name === "getUploadPresignedUrl")).toBe(true);
    expect(result.reusableFunctions.some((rf) => rf.name === "uploadObject")).toBe(true);
  });

  it("handles MinIO / custom S3-compatible provider with custom endpoint and forcePathStyle", () => {
    const nodes: BackendNode[] = [
      {
        id: "storage-minio",
        type: "storage",
        position: { x: 0, y: 0 },
        fractionalIndex: "a0",
        data: {
          label: "Local MinIO",
          storageProvider: "minio",
          endpointUrl: "http://localhost:9000",
          forcePathStyle: true,
          accessKeyIdEnv: "MINIO_ROOT_USER",
          secretAccessKeyEnv: "MINIO_ROOT_PASSWORD",
        },
      },
    ];

    const result = compileStorageNodes(nodes);
    const config = result.files.find((f) => f.filename === "src/config.ts");
    expect(config).toBeDefined();
    expect(config!.content).toContain('"http://localhost:9000"');
    expect(config!.content).toContain('process.env["MINIO_ROOT_USER"]');
    expect(config!.content).toContain('process.env["MINIO_ROOT_PASSWORD"]');
  });

  it("compiles multiple storage nodes into modular packages under packages/storage/<folder>", () => {
    const nodes: BackendNode[] = [
      {
        id: "s1",
        type: "storage",
        position: { x: 0, y: 0 },
        fractionalIndex: "a0",
        data: {
          label: "Public Assets",
          storageProvider: "s3",
          buckets: [{ id: "b1", name: "public-cdn" }],
        },
      },
      {
        id: "s2",
        type: "storage",
        position: { x: 200, y: 0 },
        fractionalIndex: "a1",
        data: {
          label: "Backup Archive",
          storageProvider: "r2",
          buckets: [{ id: "b2", name: "vault" }],
        },
      },
    ];

    const result = compileStorageNodes(nodes);
    expect(result.packages).toBeDefined();
    expect(result.packages!).toHaveLength(2);

    const pkg1 = result.packages![0]!;
    const pkg2 = result.packages![1]!;

    expect(pkg1.packageName).toBe("@workspace/storage-public-assets");
    expect(pkg1.packageFolder).toBe("storage/public-assets");

    expect(pkg2.packageName).toBe("@workspace/storage-backup-archive");
    expect(pkg2.packageFolder).toBe("storage/backup-archive");
  });

  it("compiles storage inside compileMonorepo and links it to connected services and root tsconfig", () => {
    const nodes: BackendNode[] = [
      {
        id: "srv-1",
        type: "service",
        position: { x: 0, y: 0 },
        fractionalIndex: "a0",
        data: {
          label: "Upload Service",
          techStack: "express",
        },
      },
      {
        id: "storage-1",
        type: "storage",
        position: { x: 300, y: 0 },
        fractionalIndex: "a1",
        data: {
          label: "Media Storage",
          storageProvider: "s3",
          buckets: [{ id: "bucket-uploads", name: "uploads" }],
        },
      },
    ];

    // Connected edge from service to storage
    const edges: BackendEdge[] = [
      {
        id: "edge-1",
        type: "connection",
        fractionalIndex: "a0",
        source: "srv-1",
        target: "storage-1",
        sourceHandle: "storage-target",
        targetHandle: "storage-target",
      },
    ];

    const monorepo = compileMonorepo(nodes, [], [], edges, [], "StorageTestProject");

    // 1. Storage package files are present under packages/storage/
    const storagePkgJson = monorepo.files.find((f) => f.filename === "packages/storage/package.json");
    expect(storagePkgJson).toBeDefined();

    // 2. Service package.json depends on @workspace/storage
    const srvPkgJson = monorepo.files.find((f) => f.filename === "apps/upload-service/package.json");
    expect(srvPkgJson).toBeDefined();
    const parsedSrvPkg = JSON.parse(srvPkgJson!.content);
    expect(parsedSrvPkg.dependencies["@workspace/storage"]).toBe("workspace:*");

    // 3. Root tsconfig references packages/storage
    const rootTsconfig = monorepo.files.find((f) => f.filename === "tsconfig.json");
    expect(rootTsconfig).toBeDefined();
    const parsedTsconfig = JSON.parse(rootTsconfig!.content);
    expect(parsedTsconfig.references.some((ref: { path: string }) => ref.path === "packages/storage")).toBe(true);

    // 4. Root README documents Object Storage Package
    const readme = monorepo.files.find((f) => f.filename === "README.md");
    expect(readme).toBeDefined();
    expect(readme!.content).toContain("Object Storage Package");
    expect(readme!.content).toContain("packages/storage");
  });
});

describe("Node Name Uniqueness Validation", () => {
  it("getUniqueNodeLabel generates unique labels across all existing canvas nodes", () => {
    const existingNodes = [
      { type: "service", data: { label: "User Service" } },
      { type: "database", data: { label: "User DB" } },
      { type: "storage", data: { label: "Storage" } },
    ];

    // Base name doesn't exist -> uses base
    expect(getUniqueNodeLabel(existingNodes, "Order Service", "service")).toBe("Order Service");

    // Base name already exists -> appends _1
    expect(getUniqueNodeLabel(existingNodes, "Storage", "storage")).toBe("Storage_1");

    // Colliding with different node type -> still appends _1 to ensure global uniqueness
    expect(getUniqueNodeLabel(existingNodes, "User DB", "service")).toBe("User DB_1");
  });
});
