import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectId, chatId, canvasStateContext, token, viewportCenter } = body;

    if (!projectId || !chatId) {
      return new Response("Missing required fields", { status: 400 });
    }

    // Proxy the request to the system-design-engine
    const systemDesignEngineUrl = process.env.SYSTEM_DESIGN_ENGINE_URL || "http://localhost:3002";
    const response = await fetch(`${systemDesignEngineUrl}/canvas-ai`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        projectId,
        chatId,
        canvasStateContext,
        convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL,
        token,
        viewportCenter
      }),
    });

    if (!response.ok) {
      console.error("System Design Engine error:", await response.text());
      return new Response("Error from backend AI service", { status: response.status });
    }

    // We can just stream the response body directly back to the client
    return new Response(response.body, {
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
