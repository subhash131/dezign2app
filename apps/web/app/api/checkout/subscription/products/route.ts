import { NextResponse } from "next/server";
import { creem } from "@/lib/creem";

export const dynamic = "force-dynamic";

export async function GET() {
  const defaultBetaItem = {
    id: process.env.NEXT_PUBLIC_BETA_PRODUCT_ID || "prod_3SqZz0dwcsNP45v1pDXguW",
    name: "Beta Access",
    description: "Everything you need to compile system architecture into production code.",
    price: 2000,
    currency: "USD",
    billingType: "recurring",
    billingPeriod: "every-month",
  };

  try {
    const data = await creem.products.list({ limit: 100 });
    const items = [...(data?.items || [])] as any[];
    // Ensure beta product is present even if in test mode or not in list
    if (!items.some((item: any) => item.id === defaultBetaItem.id)) {
      items.unshift(defaultBetaItem);
    }
    return NextResponse.json({ ...data, items });
  } catch (error) {
    console.error("Failed to fetch products from Creem API:", error);
    return NextResponse.json({ items: [defaultBetaItem] });
  }
}
