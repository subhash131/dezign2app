import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectId, token } = body;

    if (!projectId) {
      return new NextResponse("Missing required fields", { status: 400 });
    }

    // Proxy the request to the system-design-engine
    const response = await fetch("http://localhost:3002/clear-supermemory", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        projectId,
        convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL,
        token,
      }),
    });

    if (!response.ok) {
      console.error("System Design Engine error:", await response.text());
      return new NextResponse("Error from backend AI service", { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("API error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
