import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "@/lib/auth-server";
import { creem } from "@/lib/creem";

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

    const body = await request.json();
    const organizationId =
      typeof body?.organizationId === "string" ? body.organizationId : "";
    const rawSeats =
      typeof body?.additionalSeats === "number" ||
      typeof body?.additionalSeats === "string"
        ? body.additionalSeats
        : 1;

    if (!organizationId) {
      return NextResponse.json(
        { error: "Organization ID is required" },
        { status: 400 },
      );
    }

    const seats = Math.max(1, Math.floor(Number(rawSeats) || 1));
    const pricePerSeatUSD = 20; // $20/seat
    const totalAmountUSD = pricePerSeatUSD * seats;
    const totalAmountInCents = totalAmountUSD * 100;

    const successUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:46500"}/projects?seats_purchased=true`;

    const product = await creem.products.create({
      name: `Team Seat Add-on (${seats} ${seats === 1 ? "Seat" : "Seats"})`,
      description: `Additional team workspace seats (${seats} ${seats === 1 ? "seat" : "seats"} @ $${pricePerSeatUSD}/seat).`,
      price: totalAmountInCents,
      currency: "USD",
      billingType: "onetime",
      taxMode: "exclusive",
      taxCategory: "saas",
    });

    const checkout = await creem.checkouts.create({
      productId: product.id,
      successUrl,
      customer: {
        email,
      },
      metadata: {
        type: "org_seats",
        organizationId,
        seats: String(seats),
        userId: session.user.id,
      },
    });

    return NextResponse.json({
      checkoutUrl: checkout.checkoutUrl,
      productId: product.id,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create checkout";
    console.error("Seats checkout creation error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
