import crypto from "node:crypto";

import type {
  StorageConnectionConfig,
  CheckStorageConnectionResult,
  ExecuteStorageOperationPayload,
  ExecuteStorageOperationResult,
} from "@workspace/canvas/types";

export type {
  StorageConnectionConfig,
  CheckStorageConnectionResult,
  ExecuteStorageOperationPayload,
  ExecuteStorageOperationResult,
};

// ─────────────────────────────────────────────────────────────────────────────
// S3 URL & Credentials Resolution
// ─────────────────────────────────────────────────────────────────────────────

export function resolveCredentials(config: StorageConnectionConfig): {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
} {
  const accessKeyId =
    config.accessKeyId ||
    (config.accessKeyIdEnv ? process.env[config.accessKeyIdEnv] : undefined) ||
    process.env.AWS_ACCESS_KEY_ID ||
    process.env.STORAGE_ACCESS_KEY_ID ||
    "";

  const secretAccessKey =
    config.secretAccessKey ||
    (config.secretAccessKeyEnv ? process.env[config.secretAccessKeyEnv] : undefined) ||
    process.env.AWS_SECRET_ACCESS_KEY ||
    process.env.STORAGE_SECRET_ACCESS_KEY ||
    "";

  const sessionToken =
    config.sessionToken ||
    (config.sessionTokenEnv ? process.env[config.sessionTokenEnv] : undefined) ||
    process.env.AWS_SESSION_TOKEN ||
    process.env.STORAGE_SESSION_TOKEN ||
    undefined;

  return { accessKeyId, secretAccessKey, sessionToken };
}

export function resolveStorageUrl(config: StorageConnectionConfig, objectKey: string = ""): {
  endpoint: string;
  url: string;
  host: string;
  isPathStyle: boolean;
} {
  const region = config.region || process.env.AWS_REGION || "us-east-1";
  const rawEndpoint = (config.endpointUrl || "").trim();
  const bucket = config.bucketName || "default-bucket";
  const cleanKey = objectKey.replace(/^\/+/, "");

  let endpoint = rawEndpoint;
  if (!endpoint) {
    endpoint = `https://s3.${region}.amazonaws.com`;
  }

  // Normalize endpoint without trailing slash
  endpoint = endpoint.replace(/\/+$/, "");

  // Determine path-style vs virtual-hosted-style
  const urlObj = new URL(endpoint);
  const isLocalOrIp =
    urlObj.hostname === "localhost" ||
    urlObj.hostname === "127.0.0.1" ||
    /^\d+\.\d+\.\d+\.\d+$/.test(urlObj.hostname);

  const forcePathStyle =
    config.forcePathStyle !== undefined
      ? Boolean(config.forcePathStyle)
      : isLocalOrIp || config.storageType === "minio";

  let fullUrl: string;
  let hostHeader: string;

  if (forcePathStyle) {
    const pathPart = cleanKey ? `/${bucket}/${cleanKey}` : `/${bucket}`;
    fullUrl = `${urlObj.origin}${pathPart}`;
    hostHeader = urlObj.host;
  } else {
    // Virtual hosted style: https://bucket.s3.region.amazonaws.com/key
    const newHost = `${bucket}.${urlObj.host}`;
    const pathPart = cleanKey ? `/${cleanKey}` : "";
    fullUrl = `${urlObj.protocol}//${newHost}${pathPart}`;
    hostHeader = newHost;
  }

  return {
    endpoint,
    url: fullUrl,
    host: hostHeader,
    isPathStyle: forcePathStyle,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AWS SigV4 Signer
// ─────────────────────────────────────────────────────────────────────────────

function hmac(key: string | Buffer, data: string): Buffer {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256(data: string | Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

export function signS3Request(params: {
  method: string;
  url: string;
  region: string;
  host: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  body?: string | Buffer;
  extraHeaders?: Record<string, string>;
}): Record<string, string> {
  const {
    method,
    url,
    region,
    host,
    accessKeyId,
    secretAccessKey,
    sessionToken,
    body,
    extraHeaders = {},
  } = params;

  if (!accessKeyId || !secretAccessKey) {
    // Unauthenticated request
    return {
      Host: host,
      ...extraHeaders,
    };
  }

  const parsedUrl = new URL(url);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = sha256(body || "");

  const canonicalHeadersMap: Record<string, string> = {
    host: host,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": payloadHash,
  };

  if (sessionToken) {
    canonicalHeadersMap["x-amz-security-token"] = sessionToken;
  }

  Object.entries(extraHeaders).forEach(([k, v]) => {
    canonicalHeadersMap[k.toLowerCase()] = v.trim();
  });

  const sortedHeaderKeys = Object.keys(canonicalHeadersMap).sort();
  const canonicalHeaders = sortedHeaderKeys
    .map((k) => `${k}:${canonicalHeadersMap[k]}\n`)
    .join("");
  const signedHeaders = sortedHeaderKeys.join(";");

  // Canonical query string
  const searchParams = new URLSearchParams(parsedUrl.search);
  const queryKeys = Array.from(searchParams.keys()).sort();
  const canonicalQueryString = queryKeys
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(searchParams.get(k) || "")}`)
    .join("&");

  const canonicalUri = parsedUrl.pathname || "/";

  const canonicalRequest = [
    method.toUpperCase(),
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n");

  const kDate = hmac("AWS4" + secretAccessKey, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  const signature = crypto.createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");

  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const resultHeaders: Record<string, string> = {
    Host: host,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": payloadHash,
    Authorization: authorization,
    ...extraHeaders,
  };

  if (sessionToken) {
    resultHeaders["x-amz-security-token"] = sessionToken;
  }

  return resultHeaders;
}

export function generatePresignedUrlSigV4(params: {
  method: string;
  url: string;
  region: string;
  host: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  expiresInSeconds?: number;
}): string {
  const {
    method,
    url,
    region,
    host,
    accessKeyId,
    secretAccessKey,
    sessionToken,
    expiresInSeconds = 900,
  } = params;

  const parsedUrl = new URL(url);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;

  parsedUrl.searchParams.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
  parsedUrl.searchParams.set("X-Amz-Credential", `${accessKeyId}/${credentialScope}`);
  parsedUrl.searchParams.set("X-Amz-Date", amzDate);
  parsedUrl.searchParams.set("X-Amz-Expires", String(expiresInSeconds));
  parsedUrl.searchParams.set("X-Amz-SignedHeaders", "host");

  if (sessionToken) {
    parsedUrl.searchParams.set("X-Amz-Security-Token", sessionToken);
  }

  const queryKeys = Array.from(parsedUrl.searchParams.keys()).sort();
  const canonicalQueryString = queryKeys
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(parsedUrl.searchParams.get(k) || "")}`)
    .join("&");

  const canonicalHeaders = `host:${host}\n`;
  const canonicalRequest = [
    method.toUpperCase(),
    parsedUrl.pathname || "/",
    canonicalQueryString,
    canonicalHeaders,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join("\n");

  const kDate = hmac("AWS4" + secretAccessKey, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, "s3");
  const kSigning = hmac(kService, "aws4_request");
  const signature = crypto.createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");

  parsedUrl.searchParams.set("X-Amz-Signature", signature);

  return parsedUrl.toString();
}

// ─────────────────────────────────────────────────────────────────────────────
// XML Parser Helper (Extract basic S3 XML tags without external libs)
// ─────────────────────────────────────────────────────────────────────────────

export function parseS3XmlResponse(text: string): Record<string, unknown> | null {
  if (!text || (!text.includes("<") && !text.includes(">"))) return null;

  const result: Record<string, unknown> = {};

  const codeMatch = text.match(/<Code>([^<]+)<\/Code>/i);
  if (codeMatch) result.code = codeMatch[1];

  const msgMatch = text.match(/<Message>([^<]+)<\/Message>/i);
  if (msgMatch) result.message = msgMatch[1];

  const bucketMatch = text.match(/<BucketName>([^<]+)<\/BucketName>/i);
  if (bucketMatch) result.bucket = bucketMatch[1];

  const keyMatch = text.match(/<Key>([^<]+)<\/Key>/i);
  if (keyMatch) result.key = keyMatch[1];

  const resourceMatch = text.match(/<Resource>([^<]+)<\/Resource>/i);
  if (resourceMatch) result.resource = resourceMatch[1];

  // ListObjects parse
  const contentsMatches = text.matchAll(/<Contents>[\s\S]*?<Key>([^<]+)<\/Key>[\s\S]*?<Size>([^<]+)<\/Size>[\s\S]*?<\/Contents>/gi);
  const items: Array<{ Key: string; Size: number }> = [];
  for (const match of contentsMatches) {
    const itemKey = match[1] || "";
    const itemSize = parseInt(match[2] || "0", 10) || 0;
    if (itemKey) {
      items.push({ Key: itemKey, Size: itemSize });
    }
  }
  if (items.length > 0) {
    result.items = items;
    result.keyCount = items.length;
  }

  return Object.keys(result).length > 0 ? result : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core Live Runners: Connection & Operations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sends a real HTTP request to the configured S3 / storage server to test connection.
 */
export async function checkStorageConnectionLive(
  config: StorageConnectionConfig,
): Promise<CheckStorageConnectionResult> {
  const startTime = performance.now();
  const region = config.region || process.env.AWS_REGION || "us-east-1";
  const { accessKeyId, secretAccessKey, sessionToken } = resolveCredentials(config);
  const resolved = resolveStorageUrl(config, "");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const headers = signS3Request({
      method: "HEAD",
      url: resolved.url,
      region,
      host: resolved.host,
      accessKeyId,
      secretAccessKey,
      sessionToken,
    });

    const response = await fetch(resolved.url, {
      method: "HEAD",
      headers,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    const durationMs = Math.max(1, Math.round(performance.now() - startTime));

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((v, k) => {
      responseHeaders[k] = v;
    });

    const serverHeader = response.headers.get("server") || undefined;
    const isSuccess = response.status >= 200 && response.status < 400;

    return {
      success: isSuccess,
      serverActive: true,
      status: response.status,
      statusText: response.statusText || (isSuccess ? "OK" : "Error"),
      durationMs,
      endpoint: resolved.endpoint,
      bucket: config.bucketName,
      region,
      serverHeader,
      headers: responseHeaders,
      error: !isSuccess
        ? `Storage server responded with HTTP ${response.status} ${response.statusText || ""}`
        : undefined,
      tip:
        response.status === 403
          ? "Storage server is reachable, but access was denied. Verify your accessKeyId and secretAccessKey."
          : response.status === 404
            ? `Storage server is reachable, but bucket "${config.bucketName}" was not found. You may need to create the bucket first.`
            : undefined,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    const durationMs = Math.max(1, Math.round(performance.now() - startTime));

    const isAbort = err.name === "AbortError";
    const errorMsg = isAbort
      ? `Connection timed out after 6000ms while reaching ${resolved.endpoint}`
      : err?.message || String(err);

    return {
      success: false,
      serverActive: false,
      status: 0,
      statusText: "Connection Failed",
      durationMs,
      endpoint: resolved.endpoint,
      bucket: config.bucketName,
      region,
      error: `Could not connect to storage server at ${resolved.endpoint} (${errorMsg}).`,
      tip: `Ensure your storage server (e.g. MinIO, LocalStack, or cloud S3) is running and reachable at "${resolved.endpoint}".`,
    };
  }
}

/**
 * Executes a real operation (upload, download, head, delete, list) against the configured server.
 */
export async function executeStorageOperationLive(
  payload: ExecuteStorageOperationPayload,
): Promise<ExecuteStorageOperationResult> {
  const { connection, operation, params } = payload;
  const startTime = performance.now();
  const region = connection.region || process.env.AWS_REGION || "us-east-1";
  const { accessKeyId, secretAccessKey, sessionToken } = resolveCredentials(connection);

  const key = params.key || "test-file.txt";
  const resolved = resolveStorageUrl(connection, key);

  let method = "GET";
  let requestUrl = resolved.url;
  let body: string | Buffer | undefined = undefined;
  let extraHeaders: Record<string, string> = {};
  let presignedResultUrl: string | undefined = undefined;

  switch (operation) {
    case "uploadObject": {
      method = "PUT";
      body = params.body || "Hello world from live storage test";
      extraHeaders["Content-Type"] = params.contentType || "application/octet-stream";
      if (params.metadata) {
        Object.entries(params.metadata).forEach(([k, v]) => {
          extraHeaders[`x-amz-meta-${k.toLowerCase()}`] = String(v);
        });
      }
      break;
    }

    case "downloadObject": {
      method = "GET";
      break;
    }

    case "objectExists": {
      method = "HEAD";
      break;
    }

    case "deleteObject": {
      method = "DELETE";
      break;
    }

    case "listObjects": {
      method = "GET";
      const listResolved = resolveStorageUrl(connection, "");
      const searchParams = new URLSearchParams();
      searchParams.set("list-type", "2");
      if (params.prefix) searchParams.set("prefix", params.prefix);
      if (params.maxKeys) searchParams.set("max-keys", String(params.maxKeys));
      requestUrl = `${listResolved.url}?${searchParams.toString()}`;
      break;
    }

    case "getUploadPresignedUrl": {
      const ttl = Number(params.ttl) || 900;
      presignedResultUrl = generatePresignedUrlSigV4({
        method: "PUT",
        url: resolved.url,
        region,
        host: resolved.host,
        accessKeyId: accessKeyId || "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: secretAccessKey || "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        sessionToken,
        expiresInSeconds: ttl,
      });

      // Also do a preflight OPTIONS check to verify server reachability
      method = "OPTIONS";
      extraHeaders["Origin"] = "http://localhost:3000";
      extraHeaders["Access-Control-Request-Method"] = "PUT";
      break;
    }

    case "getDownloadPresignedUrl": {
      const ttl = Number(params.ttl) || 3600;
      presignedResultUrl = generatePresignedUrlSigV4({
        method: "GET",
        url: resolved.url,
        region,
        host: resolved.host,
        accessKeyId: accessKeyId || "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: secretAccessKey || "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        sessionToken,
        expiresInSeconds: ttl,
      });
      method = "HEAD";
      break;
    }

    case "getPublicObjectUrl": {
      method = "HEAD";
      if (connection.cdnUrl) {
        requestUrl = `${connection.cdnUrl.replace(/\/+$/, "")}/${key.replace(/^\/+/, "")}`;
      }
      break;
    }

    default: {
      method = "GET";
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const signedHeaders = signS3Request({
      method,
      url: requestUrl,
      region,
      host: new URL(requestUrl).host,
      accessKeyId,
      secretAccessKey,
      sessionToken,
      body,
      extraHeaders,
    });

    const fetchOptions: RequestInit = {
      method,
      headers: signedHeaders,
      signal: controller.signal,
    };

    if (body && ["PUT", "POST"].includes(method)) {
      fetchOptions.body = body;
    }

    const response = await fetch(requestUrl, fetchOptions);
    clearTimeout(timeoutId);
    const durationMs = Math.max(1, Math.round(performance.now() - startTime));

    const resHeaders: Record<string, string> = {};
    response.headers.forEach((v, k) => {
      resHeaders[k] = v;
    });

    const isSuccess = response.status >= 200 && response.status < 400;
    const rawText = await response.text();

    let parsedData: unknown = null;
    const xmlParsed = parseS3XmlResponse(rawText);

    if (xmlParsed) {
      parsedData = xmlParsed;
    } else {
      try {
        parsedData = JSON.parse(rawText);
      } catch {
        parsedData = rawText || (isSuccess ? { status: "Success", httpStatusCode: response.status } : null);
      }
    }

    if (operation === "objectExists") {
      parsedData = {
        exists: response.status === 200,
        status: response.status,
        bucket: connection.bucketName,
        key: key,
        headers: resHeaders,
      };
    } else if (operation === "getUploadPresignedUrl" || operation === "getDownloadPresignedUrl") {
      parsedData = {
        presignedUrl: presignedResultUrl,
        serverPreflightStatus: response.status,
        serverPreflightText: response.statusText,
        method: operation === "getUploadPresignedUrl" ? "PUT" : "GET",
        expiresInSeconds: Number(params.ttl) || (operation === "getUploadPresignedUrl" ? 900 : 3600),
      };
    }

    return {
      success: isSuccess,
      serverActive: true,
      status: response.status,
      statusText: response.statusText || (isSuccess ? "OK" : "Error"),
      durationMs,
      endpoint: resolved.endpoint,
      method,
      url: requestUrl,
      headers: resHeaders,
      data: parsedData,
      rawResponse: rawText ? rawText.slice(0, 1000) : undefined,
      signedUrl: presignedResultUrl,
      error: !isSuccess
        ? `Server responded with ${response.status} ${response.statusText}`
        : undefined,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    const durationMs = Math.max(1, Math.round(performance.now() - startTime));

    const isAbort = err.name === "AbortError";
    const errorMsg = isAbort
      ? `Operation timed out after 8000ms connecting to ${resolved.endpoint}`
      : err?.message || String(err);

    return {
      success: false,
      serverActive: false,
      status: 0,
      statusText: "Connection Failed",
      durationMs,
      endpoint: resolved.endpoint,
      method,
      url: requestUrl,
      data: {
        error: "NetworkError",
        message: errorMsg,
        endpoint: resolved.endpoint,
      },
      error: `Could not reach configured storage server at ${resolved.endpoint}: ${errorMsg}`,
      tip: `Check that your storage server at "${resolved.endpoint}" is running, or verify network and CORS settings.`,
    };
  }
}
