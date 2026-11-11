import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-server";
import { creem } from "@/lib/creem";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(request.headers);

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const email = session.user.email;
    if (!email) {
      return NextResponse.json({ error: "No email found" }, { status: 400 });
    }

    const { productId } = await request.json();
    const targetProductId = productId || process.env.NEXT_PUBLIC_BETA_PRODUCT_ID || "prod_3SqZz0dwcsNP45v1pDXguW";

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    const successUrl = `${baseUrl}/projects`;

    try {
      const checkout = await creem.checkouts.create({
        productId: targetProductId,
        successUrl,
        customer: {
          email,
        },
      });

      if (checkout?.checkoutUrl) {
        return NextResponse.json({
          checkoutUrl: checkout.checkoutUrl,
        });
      }
    } catch (apiError) {
      console.warn("Creem checkouts.create failed, falling back to direct payment link:", apiError);
      const fallbackUrl = `https://www.creem.io/payment/${targetProductId}?email=${encodeURIComponent(email)}&customer_email=${encodeURIComponent(email)}`;
      return NextResponse.json({
        checkoutUrl: fallbackUrl,
      });
    }

    const fallbackUrl = `https://www.creem.io/payment/${targetProductId}?email=${encodeURIComponent(email)}&customer_email=${encodeURIComponent(email)}`;
    return NextResponse.json({
      checkoutUrl: fallbackUrl,
    });
  } catch (error) {
    console.error("Checkout error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout" },
      { status: 500 },
    );
  }
}
