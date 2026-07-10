import { NextRequest } from "next/server";
import { streamCanvasAI } from "@/lib/ai/groqClient";
import { CanvasMode } from "@/types/canvas";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectId, messages, canvasMode, canvasStateContext } = body;

    if (!projectId || !messages || !canvasMode) {
      return new Response("Missing required fields", { status: 400 });
    }

    // We use a ReadableStream to stream the chunks back to the client
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const aiStream = streamCanvasAI(
            messages,
            canvasMode as CanvasMode,
            canvasStateContext || "Canvas is empty."
          );

          for await (const chunk of aiStream) {
            // Send each chunk as JSON delimited by newlines
            controller.enqueue(encoder.encode(JSON.stringify(chunk) + "\n"));
          }
          controller.close();
        } catch (err) {
          console.error("AI Streaming error:", err);
          controller.error(err);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("API error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
