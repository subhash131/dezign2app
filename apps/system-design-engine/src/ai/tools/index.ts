export * from "./nodes";
export * from "./edges";
export * from "./services";
export * from "./brokers";
export * from "./clients";
export * from "./databases";

import { addNodeTool, updateNodeTool, deleteNodeTool } from "./nodes";
import { addEdgeTool, deleteEdgeTool } from "./edges";
import { addServiceNodeTool } from "./services";
import { addKafkaNodeTool } from "./brokers";
import { addClientNodeTool } from "./clients";
import { addSchemaGroupTool, addSchemaTool, addDbRefNodeTool } from "./databases";

export const tools = [
  addNodeTool,
  updateNodeTool,
  deleteNodeTool,
  addEdgeTool,
  deleteEdgeTool,
  addServiceNodeTool,
  addKafkaNodeTool,
  addClientNodeTool,
  addSchemaGroupTool,
  addSchemaTool,
  addDbRefNodeTool
];
