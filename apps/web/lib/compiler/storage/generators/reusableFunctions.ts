import { ReusableFunction } from "@workspace/canvas/types";

export function generateStorageReusableFunctions(
  packageName: string,
  packageFolder: string,
): ReusableFunction[] {
  return [
    {
      name: "getUploadPresignedUrl",
      importPath: `${packageName}/operations`,
      signature:
        "getUploadPresignedUrl(bucketName: string, key: string, options?: PresignedUrlOptions): Promise<string>",
      targetName: packageFolder,
      kind: "custom",
    },
    {
      name: "getDownloadPresignedUrl",
      importPath: `${packageName}/operations`,
      signature:
        "getDownloadPresignedUrl(bucketName: string, key: string, options?: { expiresInSeconds?: number }): Promise<string>",
      targetName: packageFolder,
      kind: "custom",
    },
    {
      name: "uploadObject",
      importPath: `${packageName}/operations`,
      signature:
        "uploadObject(bucketName: string, key: string, body: string | Uint8Array | Buffer | ReadableStream | Blob, options?: UploadObjectOptions): Promise<PutObjectCommandOutput>",
      targetName: packageFolder,
      kind: "custom",
    },
    {
      name: "downloadObject",
      importPath: `${packageName}/operations`,
      signature:
        "downloadObject(bucketName: string, key: string): Promise<ReadableStream | Blob | undefined>",
      targetName: packageFolder,
      kind: "custom",
    },
    {
      name: "deleteObject",
      importPath: `${packageName}/operations`,
      signature:
        "deleteObject(bucketName: string, key: string): Promise<DeleteObjectCommandOutput>",
      targetName: packageFolder,
      kind: "custom",
    },
    {
      name: "deleteObjects",
      importPath: `${packageName}/operations`,
      signature:
        "deleteObjects(bucketName: string, keys: string[]): Promise<DeleteObjectsCommandOutput>",
      targetName: packageFolder,
      kind: "custom",
    },
    {
      name: "listObjects",
      importPath: `${packageName}/operations`,
      signature:
        "listObjects(bucketName: string, prefix?: string, maxKeys?: number): Promise<_Object[]>",
      targetName: packageFolder,
      kind: "custom",
    },
    {
      name: "objectExists",
      importPath: `${packageName}/operations`,
      signature:
        "objectExists(bucketName: string, key: string): Promise<boolean>",
      targetName: packageFolder,
      kind: "custom",
    },
    {
      name: "copyObject",
      importPath: `${packageName}/operations`,
      signature:
        "copyObject(sourceBucket: string, sourceKey: string, destBucket: string, destKey: string): Promise<CopyObjectCommandOutput>",
      targetName: packageFolder,
      kind: "custom",
    },
    {
      name: "STORAGE_BUCKETS",
      importPath: `${packageName}/buckets`,
      signature: "STORAGE_BUCKETS: Record<string, string>",
      targetName: packageFolder,
      kind: "custom",
    },
    {
      name: "s3Client",
      importPath: `${packageName}/client`,
      signature: "s3Client: S3Client",
      targetName: packageFolder,
      kind: "custom",
    },
  ];
}
