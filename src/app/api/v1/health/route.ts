import { NextResponse } from "next/server";
import { ENGINE_VERSION } from "@/core/engine";
import { listModels } from "@/models";

export const dynamic = "force-dynamic";

/** Endpoint de santé — sans authentification, sans donnée sensible. */
export async function GET() {
  return NextResponse.json({
    status: "UP",
    engineVersion: ENGINE_VERSION,
    models: listModels().map((m) => ({
      modelId: m.modelId,
      version: m.version,
      status: m.status,
    })),
    time: new Date().toISOString(),
  });
}
