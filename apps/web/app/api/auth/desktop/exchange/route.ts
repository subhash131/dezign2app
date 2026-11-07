import { NextRequest, NextResponse } from "next/server";
import { consumeTicket } from "@/lib/desktop-auth";
import { log } from "@/lib/logger";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-electron-app",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function POST(req: NextRequest) {
  try {
    const { ticket } = await req.json();

    log("[Desktop Auth Exchange:route] Received exchange request. Ticket preview:", {
      hasTicket: !!ticket,
      preview: ticket ? `${String(ticket).substring(0, 15)}...` : null,
    });

    if (!ticket || typeof ticket !== "string") {
      console.warn("[Desktop Auth Exchange:route] Invalid or missing ticket received");
      return NextResponse.json(
        { error: "Invalid or missing ticket" },
        { status: 400, headers: corsHeaders },
      );
    }

    let ticketData = consumeTicket(ticket.trim());
    log("[Desktop Auth Exchange:route] consumeTicket local attempt result:", {
      success: !!ticketData,
      userId: ticketData?.userId,
      hasToken: !!ticketData?.token,
    });

    // Optional proxy fallback if running inside local desktop shell and remote auth URL is set in env
    if (!ticketData) {
      const remoteAuthUrl = process.env.NEXT_PUBLIC_DESKTOP_AUTH_URL;
      const requestHost = req.headers.get("host") || "";
      const isCurrentHost =
        Boolean(remoteAuthUrl) &&
        (req.nextUrl.origin.includes(remoteAuthUrl as string) ||
          (Boolean(requestHost) && (remoteAuthUrl as string).includes(requestHost)));

      log("[Desktop Auth Exchange:route] Local consume failed. Checking remoteAuthUrl:", {
        remoteAuthUrl,
        requestHost,
        isCurrentHost,
      });

      if (
        remoteAuthUrl &&
        !isCurrentHost &&
        !remoteAuthUrl.includes("localhost") &&
        !remoteAuthUrl.includes("127.0.0.1")
      ) {
        try {
          log("[Desktop Auth Exchange:route] Forwarding to remote exchange endpoint:", `${remoteAuthUrl}/api/auth/desktop/exchange`);
          const remoteRes = await fetch(`${remoteAuthUrl}/api/auth/desktop/exchange`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ticket: ticket.trim() }),
          });
          log("[Desktop Auth Exchange:route] Remote exchange status:", remoteRes.status);
          if (remoteRes.ok) {
            const remoteData = await remoteRes.json();
            log("[Desktop Auth Exchange:route] Remote exchange data received:", {
              hasToken: !!remoteData?.token,
              userId: remoteData?.userId,
            });
            if (remoteData?.token) {
              ticketData = {
                token: remoteData.token,
                userId: remoteData.userId || "desktop_user",
                expiresAt: Date.now() + 60000,
              };
            }
          }
        } catch (remoteErr) {
          console.warn("[Desktop Auth Exchange:route] Remote exchange attempt failed:", remoteErr);
        }
      }
    }

    if (!ticketData) {
      console.error("[Desktop Auth Exchange:route] Ticket expired or invalid after all attempts");
      return NextResponse.json(
        { error: "Ticket expired or invalid" },
        { status: 401, headers: corsHeaders },
      );
    }

    log("[Desktop Auth Exchange:route] Exchange successful! Returning token for userId:", ticketData.userId);

    const host = req.headers.get("host") || "";
    const isHttps =
      req.nextUrl.protocol === "https:" ||
      req.headers.get("x-forwarded-proto") === "https" ||
      process.env.NODE_ENV === "production";
    const isProdDomain = host.includes("dezign2app.com");
    const cookieDomain = isProdDomain ? ".dezign2app.com" : undefined;

    const response = NextResponse.json(
      {
        token: ticketData.token,
        userId: ticketData.userId,
        success: true,
      },
      { headers: corsHeaders },
    );

    const baseCookieOptions: Parameters<typeof response.cookies.set>[2] = {
      path: "/",
      maxAge: 30 * 24 * 60 * 60, // 30 days
      sameSite: "lax",
      httpOnly: false,
      secure: isHttps,
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    };

    response.cookies.set("better-auth.session_token", ticketData.token, baseCookieOptions);
    if (isHttps) {
      response.cookies.set(
        "__Secure-better-auth.session_token",
        ticketData.token,
        baseCookieOptions,
      );
    }
    response.cookies.set("is_electron", "1", baseCookieOptions);

    return response;
  } catch (error) {
    console.error("[Desktop Auth Exchange:route] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: corsHeaders },
    );
  }
}
