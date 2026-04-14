import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await fetch(
      "https://api.vesu.xyz/positions?type=borrow&type=multiply&type=earn&type=vault",
      { cache: "no-store" }
    );
    if (!res.ok) throw new Error(`Vesu API returned ${res.status}`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch positions" },
      { status: 500 }
    );
  }
}
