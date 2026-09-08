import type { LayoutNode, NodeHandleData } from "./types";

function getEntityColumns(node: LayoutNode) {
  if (
    node.data &&
    typeof node.data === "object" &&
    "columns" in node.data &&
    Array.isArray(node.data.columns)
  ) {
    return node.data.columns;
  }
  return [];
}

function getEntityIndexes(node: LayoutNode) {
  if (
    node.data &&
    typeof node.data === "object" &&
    "indexes" in node.data &&
    Array.isArray(node.data.indexes)
  ) {
    return node.data.indexes;
  }
  return [];
}

function getEntityDbType(node: LayoutNode): string | undefined {
  if (
    node.data &&
    typeof node.data === "object" &&
    "dbType" in node.data &&
    typeof node.data.dbType === "string"
  ) {
    return node.data.dbType;
  }
  return undefined;
}

function getRedisDataStructure(node: LayoutNode): string | undefined {
  if (
    node.data &&
    typeof node.data === "object" &&
    "redisDataStructure" in node.data &&
    typeof node.data.redisDataStructure === "string"
  ) {
    return node.data.redisDataStructure;
  }
  return undefined;
}

export function getLayoutNodeData(node: LayoutNode): NodeHandleData | undefined {
  if (!node.data || typeof node.data !== "object") {
    return undefined;
  }

  const endpoints =
    "endpoints" in node.data && Array.isArray(node.data.endpoints)
      ? node.data.endpoints
      : undefined;
  const events =
    "events" in node.data && Array.isArray(node.data.events)
      ? node.data.events
      : undefined;
  const topics =
    "topics" in node.data && Array.isArray(node.data.topics)
      ? node.data.topics
      : undefined;
  const consumedEvents =
    "consumedEvents" in node.data && Array.isArray(node.data.consumedEvents)
      ? node.data.consumedEvents
      : undefined;
  const publishedEvents =
    "publishedEvents" in node.data && Array.isArray(node.data.publishedEvents)
      ? node.data.publishedEvents
      : undefined;
  const zones =
    "zones" in node.data && Array.isArray(node.data.zones)
      ? (node.data.zones as NodeHandleData["zones"])
      : undefined;
  const sections =
    "sections" in node.data && Array.isArray(node.data.sections)
      ? (node.data.sections as NodeHandleData["sections"])
      : undefined;

  return {
    endpoints,
    events,
    topics,
    consumedEvents,
    publishedEvents,
    zones,
    sections,
  };
}

export function getNodeDimensions(node: LayoutNode): {
  width: number;
  height: number;
} {
  const measured =
    "measured" in node &&
    typeof node.measured === "object" &&
    node.measured !== null
      ? node.measured
      : undefined;

  const measuredWidth =
    measured && "width" in measured && typeof measured.width === "number"
      ? measured.width
      : undefined;
  const measuredHeight =
    measured && "height" in measured && typeof measured.height === "number"
      ? measured.height
      : undefined;

  const isMeasured = Boolean(
    measuredWidth !== undefined &&
      measuredHeight !== undefined &&
      measuredWidth > 0 &&
      measuredHeight > 0,
  );

  if (isMeasured && node.type !== "entity" && node.type !== "redis_schema" && measuredWidth !== undefined && measuredHeight !== undefined) {
    return {
      width: measuredWidth,
      height: measuredHeight,
    };
  }

  switch (node.type) {
    case "start":
    case "START":
      return { width: 180, height: 70 };
    case "state_global":
    case "STATE_GLOBAL":
      return { width: 260, height: 140 };
    case "langgraph":
    case "langgraph_agent":
    case "langgraph_node":
    case "agent":
      return { width: 280, height: 240 };
    case "langgraph_llm":
      return { width: 320, height: 220 };
    case "langgraph_tool":
      return { width: 300, height: 260 };
    case "langgraph_middleware":
      return { width: 280, height: 160 };
    case "langgraph_memory":
      return { width: 280, height: 160 };
    case "db_ref":
    case "vector_db_ref":
    case "redis-cache":
      return { width: 280, height: 80 };
    case "end":
    case "END":
      return { width: 140, height: 60 };
    case "port":
      return { width: 140, height: 50 };
    case "service":
    case "external":
    case "api_gateway":
    case "express":
    case "fastapi":
    case "web_client_page":
    case "kafka":
    case "pubsub":
    case "queue":
    case "eventConsumer": {
      return { width: 280, height: 160 };
    }
    case "database":
    case "redis_instance": {
      return { width: 280, height: 160 };
    }
    case "redis_schema": {
      const columns = getEntityColumns(node);
      const redisStructure = getRedisDataStructure(node);
      const colCount = columns.length > 0 ? columns.length : 1;

      // Header: 68px (title + redis instance dropdown)
      const headerH = 68;
      // Description box: ~44px
      const descH = 44;
      // Redis config block: ~130px
      const redisConfigH = 130;
      // Column list (for Hash / JSON): ~24px + 42px per field
      const showColumns = redisStructure === "hash" || redisStructure === "json" || !redisStructure;
      const columnsH = showColumns ? 24 + colCount * 42 : 0;
      // DbOperations header: ~30px
      const dbOpsH = 30;
      const paddingH = 16;

      const estHeight = headerH + descH + redisConfigH + columnsH + dbOpsH + paddingH;
      const estWidth = 320;

      if (isMeasured && measuredWidth !== undefined && measuredHeight !== undefined) {
        return {
          width: Math.max(measuredWidth, estWidth),
          height: Math.max(measuredHeight, estHeight),
        };
      }
      return { width: estWidth, height: estHeight };
    }
    case "flow": {
      const data = getLayoutNodeData(node);
      const epCount = Array.isArray(data?.endpoints)
        ? data.endpoints.length
        : 1;
      const estHeight = Math.max(140, 60 + epCount * 44);
      return { width: 280, height: estHeight };
    }
    case "zone": {
      return { width: 340, height: 260 };
    }
    case "event": {
      return { width: 260, height: 160 };
    }
    case "auth": {
      return { width: 300, height: 200 };
    }
    case "app": {
      return { width: 280, height: 180 };
    }
    case "webApp": {
      const data = getLayoutNodeData(node);
      const zones = data?.zones || [];
      const estHeight = Math.max(240, 180 + zones.length * 70);
      return { width: 330, height: estHeight };
    }
    case "webPage": {
      const data = getLayoutNodeData(node);
      const sections = data?.sections || [];
      const totalActions = sections.reduce(
        (acc: number, s) => acc + (s.actions?.length || 0),
        0,
      );
      const estHeight = 220 + sections.length * 34 + totalActions * 28;
      const estWidth = 280;
      if (isMeasured && measuredWidth !== undefined && measuredHeight !== undefined) {
        return {
          width: Math.max(measuredWidth, estWidth),
          height: Math.max(measuredHeight, estHeight),
        };
      }
      return { width: estWidth, height: Math.max(260, estHeight) };
    }
    case "transformer":
    case "transformer_ref":
    case "hook":
    case "hook_ref": {
      return { width: 240, height: 50 };
    }
    case "types": {
      const typesCount =
        node.data &&
        typeof node.data === "object" &&
        "types" in node.data &&
        Array.isArray(node.data.types)
          ? node.data.types.length
          : 1;
      const estHeight = Math.max(90, 60 + typesCount * 30 + 32);
      return { width: 270, height: estHeight };
    }

    case "group": {
      const data = getLayoutNodeData(node);
      const count =
        (Array.isArray(data?.endpoints) ? data.endpoints.length : 0) +
        (Array.isArray(data?.events) ? data.events.length : 0) +
        (Array.isArray(data?.topics) ? data.topics.length : 0);
      const estHeight = Math.max(180, 140 + count * 40);
      return { width: 320, height: estHeight };
    }
    case "entity": {
      const dbType = getEntityDbType(node);
      const isVector = dbType === "vector";
      const isRedis = dbType === "redis";
      const columns = getEntityColumns(node);
      const indexes = getEntityIndexes(node);
      const redisStructure = getRedisDataStructure(node);
      const colCount = columns.length > 0 ? columns.length : 1;
      const idxCount = indexes.length;

      // Header: 68px (standard SQL with engine select) or 44px (vector/redis)
      const headerH = isVector || isRedis ? 44 : 68;
      // Description box is always rendered in EntityNode DOM (~44px)
      const descH = 44;
      // Vector config block (if vector db type): ~120px
      const vectorConfigH = isVector ? 120 : 0;
      // Redis config block (if redis db type): ~130px
      const redisConfigH = isRedis ? 130 : 0;
      // Column list: rendered for relational, vector, or Redis Hash/JSON
      const showColumns =
        !isRedis ||
        redisStructure === "hash" ||
        redisStructure === "json" ||
        !redisStructure;
      const columnsH = showColumns ? 24 + colCount * 42 : 0;
      // Index list: header 24px + 44px per index row (if indexes present and not redis/vector)
      const indexesH = !isRedis && !isVector && idxCount > 0 ? 24 + idxCount * 44 : 0;
      // DbOperations list header: ~30px
      const dbOpsH = 30;
      // Card padding / bottom margin
      const paddingH = 16;

      const estHeight =
        headerH + descH + vectorConfigH + redisConfigH + columnsH + indexesH + dbOpsH + paddingH;
      const estWidth = 320;

      if (isMeasured && measuredWidth !== undefined && measuredHeight !== undefined) {
        return {
          width: Math.max(measuredWidth, estWidth),
          height: Math.max(measuredHeight, estHeight),
        };
      }

      return { width: estWidth, height: Math.max(220, estHeight) };
    }
    default:
      if (isMeasured && measuredWidth !== undefined && measuredHeight !== undefined) {
        return {
          width: measuredWidth,
          height: measuredHeight,
        };
      }
      return { width: 300, height: 200 };
  }
}

export function getHandleYRatio(
  node: LayoutNode,
  handleId?: string | null,
): number {
  if (!handleId) return 0.5;

  if (node.type === "entity" || node.type === "redis_schema") {
    const colMatch = handleId.match(/^(?:source|target)-(\d+)$/);
    if (colMatch) {
      const colIndex = parseInt(colMatch[1]!, 10);
      const dbType = getEntityDbType(node);
      const { height } = getNodeDimensions(node);

      const isVector = dbType === "vector";
      const isRedis = node.type === "redis_schema" || dbType === "redis";
      const headerH = isVector ? 44 : 68;
      const descH = 44;
      const vectorConfigH = isVector ? 120 : 0;
      const redisConfigH = isRedis ? 130 : 0;
      const columnHeaderH = 24;

      const topOffset = headerH + descH + vectorConfigH + redisConfigH + columnHeaderH;
      const targetY = topOffset + colIndex * 42 + 21;

      return Math.min(0.95, Math.max(0.05, targetY / height));
    }
  }

  const data = getLayoutNodeData(node);
  if (!data) return 0.5;

  if (Array.isArray(data.endpoints) && data.endpoints.length > 0) {
    const idx = data.endpoints.findIndex((ep) => {
      const id = ep && typeof ep === "object" && ("id" in ep && ep.id || "_id" in ep && ep._id);
      return Boolean(id && handleId.includes(String(id)));
    });
    if (idx !== -1) {
      return (idx + 0.5) / data.endpoints.length;
    }
  }

  if (Array.isArray(data.events) && data.events.length > 0) {
    const idx = data.events.findIndex((ev) => {
      const id = ev && typeof ev === "object" && ("id" in ev && ev.id || "_id" in ev && ev._id);
      return Boolean(id && handleId.includes(String(id)));
    });
    if (idx !== -1) {
      return (idx + 0.5) / data.events.length;
    }
  }

  if (Array.isArray(data.topics) && data.topics.length > 0) {
    const idx = data.topics.findIndex((tp) => {
      const id =
        tp &&
        typeof tp === "object" &&
        ("id" in tp && tp.id || "_id" in tp && tp._id || "name" in tp && tp.name);
      return Boolean(id && handleId.includes(String(id)));
    });
    if (idx !== -1) {
      return (idx + 0.5) / data.topics.length;
    }
  }

  if (Array.isArray(data.consumedEvents) && data.consumedEvents.length > 0) {
    const idx = data.consumedEvents.findIndex((ev) => {
      const id =
        typeof ev === "string"
          ? ev
          : ev && typeof ev === "object" && ("id" in ev && ev.id || "_id" in ev && ev._id);
      return Boolean(id && handleId.includes(String(id)));
    });
    if (idx !== -1) {
      return (idx + 0.5) / data.consumedEvents.length;
    }
  }

  if (Array.isArray(data.publishedEvents) && data.publishedEvents.length > 0) {
    const idx = data.publishedEvents.findIndex((ev) => {
      const id =
        typeof ev === "string"
          ? ev
          : ev && typeof ev === "object" && ("id" in ev && ev.id || "_id" in ev && ev._id);
      return Boolean(id && handleId.includes(String(id)));
    });
    if (idx !== -1) {
      return (idx + 0.5) / data.publishedEvents.length;
    }
  }

  const match = handleId.match(/(\d+)$/);
  if (match) {
    const parsedIdx = parseInt(match[1]!, 10);
    if (!isNaN(parsedIdx) && parsedIdx < 10) {
      return (parsedIdx + 0.5) / 5;
    }
  }

  return 0.5;
}

export function getIsPkNode(
  node?: LayoutNode,
  handleId?: string | null,
): boolean {
  if (!node || !handleId) return false;
  const columns = getEntityColumns(node);
  if (columns.length === 0) return false;
  const match = handleId.match(/^(?:source|target)-(\d+)$/);
  if (!match) return false;
  const idx = parseInt(match[1]!, 10);
  const col = columns[idx];
  return Boolean(
    col &&
      typeof col === "object" &&
      (("isPrimaryKey" in col && col.isPrimaryKey) ||
        ("name" in col && col.name === "_id")),
  );
}

export function getHandleYOffset(
  node: LayoutNode,
  handleId?: string | null,
): number {
  const { height } = getNodeDimensions(node);
  const ratio = getHandleYRatio(node, handleId);
  return height * ratio;
}

export function getHandleXOffset(
  node: LayoutNode,
  handleId?: string | null,
): number {
  const { width } = getNodeDimensions(node);
  const ratio = getHandleYRatio(node, handleId);
  return width * ratio;
}
