import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface PaginatedResponse {
  pagination: { totalPages: number; currentPage: number };
  data: unknown[];
}

async function fetchPage(page: number): Promise<PaginatedResponse> {
  const res = await fetch(`https://api.vesu.xyz/positions?page=${page}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Vesu API returned ${res.status} on page ${page}`);
  return res.json();
}

export async function GET() {
  try {
    const first = await fetchPage(1);
    const totalPages = first.pagination.totalPages;
    const rest = await Promise.all(
      Array.from({ length: totalPages - 1 }, (_, i) => fetchPage(i + 2))
    );
    const all = [first, ...rest].flatMap((p) => p.data);
    return NextResponse.json(all);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch positions" },
      { status: 500 }
    );
  }
}
