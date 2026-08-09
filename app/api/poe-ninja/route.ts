import { NextResponse } from "next/server";
import { fetchPoeNinjaComparison } from "@/src/features/poeninja/comparison";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    return NextResponse.json(await fetchPoeNinjaComparison(String(body?.url ?? "")));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Poe.ninja comparison failed." }, { status: 400 });
  }
}
