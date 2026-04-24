import { NextResponse } from "next/server";
import { isAuthenticatedSession } from "@/lib/auth-session";
import { readManagerState, setRoundLock } from "@/lib/manager-state";

export async function GET() {
  if (!(await isAuthenticatedSession())) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const state = readManagerState();
  return NextResponse.json({
    roundLocks: state.roundLocks,
    adminActionLog: state.adminActionLog,
  });
}

export async function PUT(request: Request) {
  if (!(await isAuthenticatedSession())) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  let body: {
    roundNumber?: number;
    locked?: boolean;
    reason?: string;
    actorId?: string;
  } = {};

  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  if (!Number.isInteger(body.roundNumber) || body.roundNumber! <= 0) {
    return NextResponse.json({ error: "roundNumber moet een positief geheel getal zijn" }, { status: 400 });
  }

  if (typeof body.locked !== "boolean") {
    return NextResponse.json({ error: "locked moet true/false zijn" }, { status: 400 });
  }

  if (typeof body.reason !== "string" || body.reason.trim().length === 0) {
    return NextResponse.json({ error: "reason is verplicht" }, { status: 400 });
  }

  if (typeof body.actorId !== "string" || body.actorId.trim().length === 0) {
    return NextResponse.json({ error: "actorId is verplicht" }, { status: 400 });
  }

  const roundNumber = body.roundNumber as number;
  const locked = body.locked as boolean;
  const reason = body.reason.trim();
  const actorId = body.actorId.trim();

  const state = setRoundLock({
    roundNumber,
    locked,
    reason,
    actorId,
  });

  return NextResponse.json({
    ok: true,
    roundLocks: state.roundLocks,
    adminActionLog: state.adminActionLog,
  });
}
