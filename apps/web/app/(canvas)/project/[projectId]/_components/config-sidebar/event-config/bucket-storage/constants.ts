import {
  StorageProviderOption,
  StorageClassOption,
  AccessPolicyOption,
  OperationOption,
  PresetExpirationOption,
  EventTriggerOption,
} from "./types";

export const STORAGE_PROVIDERS: readonly StorageProviderOption[] = [
  { value: "s3", label: "AWS S3", icon: "Amazon S3" },
  // { value: "r2", label: "Cloudflare R2", icon: "Cloudflare R2" },
  // { value: "gcs", label: "Google Cloud Storage (GCS)", icon: "GCS" },
  // { value: "blob", label: "Azure Blob Storage", icon: "Azure Blob" },
  // { value: "minio", label: "MinIO (S3-Compatible)", icon: "MinIO" },
  // { value: "local", label: "Local Disk Storage", icon: "Local Disk" },
  // { value: "custom", label: "Custom / Other", icon: "Custom" },
];

export const STORAGE_CLASSES: readonly StorageClassOption[] = [
  { value: "STANDARD", label: "Standard / Hot (Active access)" },
  { value: "STANDARD_IA", label: "Infrequent Access (Standard-IA)" },
  { value: "GLACIER", label: "Glacier / Cold Archive (Low cost)" },
  { value: "DEEP_ARCHIVE", label: "Deep Archive (Long-term retention)" },
  { value: "INTELLIGENT_TIERING", label: "Intelligent-Tiering (Auto-optimizing)" },
];

export const ACCESS_POLICIES: readonly AccessPolicyOption[] = [
  {
    value: "private",
    label: "Private (Backend & IAM Only)",
    desc: "Only authorized backend services and roles can read/write. Best for sensitive data.",
  },
  {
    value: "public-read",
    label: "Public Read (CDN & Assets)",
    desc: "Direct anonymous HTTP read access to objects. Ideal for public images and static assets.",
  },
  {
    value: "presigned-only",
    label: "Presigned URLs Only",
    desc: "Clients must obtain temporary cryptographically signed URLs from backend services.",
  },
  {
    value: "authenticated-read",
    label: "Authenticated Users Only",
    desc: "Requires valid session or authentication token to read files.",
  },
];

export const OPERATIONS: readonly OperationOption[] = [
  { key: "read", label: "Read / Download", desc: "GetObject & Range reads" },
  { key: "write", label: "Write / Upload", desc: "PutObject & Multipart upload" },
  { key: "delete", label: "Delete", desc: "DeleteObject & Batch purge" },
  { key: "list", label: "List Bucket", desc: "ListObjects & Metadata enumeration" },
];

export const CORS_METHODS: readonly string[] = ["GET", "PUT", "POST", "DELETE", "HEAD"];

export const PRESET_EXPIRATIONS: readonly PresetExpirationOption[] = [
  { label: "5m", value: "300" },
  { label: "15m", value: "900" },
  { label: "1h", value: "3600" },
  { label: "24h", value: "86400" },
];

export const PRESET_FILE_SIZES: readonly string[] = [
  "250KB",
  "500KB",
  "1MB",
  "5MB",
  "10MB",
  "50MB",
  "100MB",
  "1GB",
];

export const DATA_TYPES: readonly string[] = [
  "Image",
  "Video",
  "Audio",
  "Document",
  "JSON",
  "Archive",
  "Binary",
  "Other",
];

export const EVENT_TRIGGERS: readonly EventTriggerOption[] = [
  { key: "s3:ObjectCreated:*", label: "Object Created (Upload / Put)", desc: "Triggers when a new file is uploaded" },
  { key: "s3:ObjectRemoved:*", label: "Object Removed (Delete)", desc: "Triggers when a file is permanently removed" },
  { key: "s3:ObjectRestore:*", label: "Object Restored", desc: "Triggers when an archive object finishes restoring" },
];
