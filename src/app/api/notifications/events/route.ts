import { NextResponse } from "next/server";
import { isAuthenticatedSession } from "@/lib/auth-session";
import {
  readNotificationEvents,
  recordNotificationEvent,
  type NotificationEventType,
} from "@/lib/notification-events";

const ALLOWED_TYPES: NotificationEventType[] = [
  "TRANSFER_WINDOW_OPENED",
  "TRANSFER_WINDOW_CLOSING_SOON",
  "TRADE_APPROVAL_REQUESTED",
];

export async function GET(request: Request) {
  if (!(await isAuthenticatedSession())) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const url = new URL(request.url);
  const managerId = url.searchParams.get("managerId") ?? undefined;
  const leagueId = url.searchParams.get("leagueId") ?? undefined;
  const type = url.searchParams.get("type") ?? undefined;

  const events = readNotificationEvents({
    managerId,
    leagueId,
    types: type && ALLOWED_TYPES.includes(type as NotificationEventType) ? [type as NotificationEventType] : undefined,
  });

  return NextResponse.json({ events });
}

export async function POST(request: Request) {
  if (!(await isAuthenticatedSession())) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  let body: {
    type?: NotificationEventType;
    leagueId?: string;
    managerId?: string;
    payload?: Record<string, unknown>;
  } = {};

  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  if (!body.type || !ALLOWED_TYPES.includes(body.type)) {
    return NextResponse.json({ error: "Ongeldig event type" }, { status: 400 });
  }

  if (!body.leagueId || !body.managerId) {
    return NextResponse.json({ error: "leagueId en managerId zijn verplicht" }, { status: 400 });
  }

  const event = recordNotificationEvent({
    type: body.type,
    leagueId: body.leagueId,
    managerId: body.managerId,
    payload: body.payload ?? {},
  });

  return NextResponse.json({ ok: true, event });
}
