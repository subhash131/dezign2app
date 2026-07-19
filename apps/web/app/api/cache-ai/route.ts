import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { description } = body;

    if (!description) {
      return NextResponse.json({ error: "Missing description" }, { status: 400 });
    }

    let systemDesignEngineUrl = process.env.NEXT_PUBLIC_SYSTEM_DESIGN_ENGINE_URL || "http://localhost:3002";
    
    const response = await fetch(`${systemDesignEngineUrl}/generate-cache-config`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ description }),
    });

    if (!response.ok) {
      console.error("System Design Engine error:", await response.text());
      return NextResponse.json({ error: "Error from backend AI service" }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
