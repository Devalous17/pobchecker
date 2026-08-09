import { NextResponse } from "next/server";
import { getEngineStatus } from "@/src/features/engine/client";

export async function GET() {
  return NextResponse.json(await getEngineStatus());
}
