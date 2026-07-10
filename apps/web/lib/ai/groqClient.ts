import Groq from "groq-sdk";
import { CanvasMode, CanvasOperation, CanvasAdapter } from "@/types/canvas";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

const frontendTools = [
  {
    type: "function",
    function: {
      name: "add_shape",
      description: "Add a new UI element to the frontend canvas.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", description: "Shape type, e.g., 'rectangle', 'ellipse', 'text', 'arrow', 'frame'" },
          x: { type: "number", description: "X coordinate" },
          y: { type: "number", description: "Y coordinate" },
          props: { type: "object", description: "Additional properties for the shape, such as w, h, text, color, etc." },
        },
        required: ["type", "x", "y"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_shape",
      description: "Update an existing UI element on the frontend canvas.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "The ID of the shape to update" },
          props: { type: "object", description: "The properties to update" },
        },
        required: ["id", "props"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_shape",
      description: "Delete a UI element from the frontend canvas.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "The ID of the shape to delete" },
        },
        required: ["id"],
      },
    },
  },
];

const backendTools = [
  {
    type: "function",
    function: {
      name: "add_node",
      description: "Add a service, database, queue, entity, external or actor node to the backend canvas.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["service", "database", "queue", "entity", "actor", "external"] },
          label: { type: "string", description: "Name of the node" },
          data: { type: "object", description: "Additional data for the node, like columns for 'entity'" },
        },
        required: ["type", "label"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_node",
      description: "Update an existing node on the backend canvas.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          changes: { type: "object" },
        },
        required: ["id", "changes"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_node",
      description: "Delete a node from the backend canvas.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
        },
        required: ["id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_edge",
      description: "Connect two nodes on the backend canvas.",
      parameters: {
        type: "object",
        properties: {
          source: { type: "string", description: "Source node ID" },
          target: { type: "string", description: "Target node ID" },
          type: { type: "string", enum: ["connection", "foreign-key", "message"] },
          data: { type: "object", description: "Optional data like label or sequenceOrder" },
        },
        required: ["source", "target", "type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_auto_layout",
      description: "Automatically arrange nodes on the backend canvas.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
];

export async function* streamCanvasAI(
  messages: any[],
  canvasMode: CanvasMode,
  canvasStateContext: string
) {
  const tools = canvasMode === "frontend" ? frontendTools : backendTools;
  const systemPrompt = `You are an expert AI software architect and UI designer. 
Your job is to assist the user in designing their system using the provided tools.
You are currently viewing the **${canvasMode}** canvas.

Current Canvas State:
${canvasStateContext}

Be concise in your textual responses. Prefer using tools to update the canvas to match the user's intent.`;

  const response = await groq.chat.completions.create({
    model: "openai/gpt-oss-120b",
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    tools: tools as any,
    tool_choice: "auto",
    stream: true,
  });

  let functionCallName = "";
  let functionCallArguments = "";
  
  for await (const chunk of response) {
    const delta = chunk.choices[0]?.delta;
    if (!delta) continue;

    if (delta.content) {
      yield { type: "text", content: delta.content };
    }

    if (delta.tool_calls) {
      for (const toolCall of delta.tool_calls) {
        if (toolCall.function?.name) {
          functionCallName = toolCall.function.name;
        }
        if (toolCall.function?.arguments) {
          functionCallArguments += toolCall.function.arguments;
        }
      }
    }
    
    // When the stream finishes a tool call
    if (chunk.choices[0]?.finish_reason === "tool_calls") {
      try {
        const args = JSON.parse(functionCallArguments);
        let op: CanvasOperation | null = null;
        
        if (functionCallName === "add_shape") {
          op = { op: "add_shape", type: args.type, x: args.x, y: args.y, props: args.props };
        } else if (functionCallName === "update_shape") {
          op = { op: "update_shape", id: args.id, props: args.props };
        } else if (functionCallName === "delete_shape") {
          op = { op: "delete_shape", id: args.id };
        } else if (functionCallName === "add_node") {
          op = { op: "add_node", type: args.type, label: args.label, data: args.data };
        } else if (functionCallName === "update_node") {
          op = { op: "update_node", id: args.id, changes: args.changes };
        } else if (functionCallName === "delete_node") {
          op = { op: "delete_node", id: args.id };
        } else if (functionCallName === "add_edge") {
          op = { op: "add_edge", source: args.source, target: args.target, type: args.type, data: args.data };
        } else if (functionCallName === "run_auto_layout") {
          op = { op: "run_auto_layout" };
        }

        if (op) {
          yield { type: "tool_call", op, name: functionCallName };
        }
        
      } catch (err) {
        console.error("Failed to parse tool call arguments", err);
      }
    }
  }
}
