import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json({
      ok: true,
      service: "telepons-web",
      database: "available",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("HEALTHCHECK_DATABASE_FAILED", error);
    return NextResponse.json(
      {
        ok: false,
        service: "telepons-web",
        database: "unavailable",
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
