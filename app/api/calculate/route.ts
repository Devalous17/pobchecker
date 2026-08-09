import { NextResponse } from "next/server";
import { calculateWithEngine, EngineUnavailableError } from "@/src/features/engine/client";
export async function POST(request: Request) {
  try { return NextResponse.json(await calculateWithEngine(await request.json())); }
  catch (error) { const status = error instanceof EngineUnavailableError ? 503 : 400; return NextResponse.json({ error: error instanceof Error ? error.message : "Calculation failed." }, { status }); }
}
