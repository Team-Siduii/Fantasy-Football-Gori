import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import crypto from "crypto";

export type NotificationEventType =
  | "TRANSFER_WINDOW_OPENED"
  | "TRANSFER_WINDOW_CLOSING_SOON"
  | "TRADE_APPROVAL_REQUESTED";

export type NotificationEvent = {
  id: string;
  type: NotificationEventType;
  leagueId: string;
  managerId: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type NotificationEventInput = {
  type: NotificationEventType;
  leagueId: string;
  managerId: string;
  payload: Record<string, unknown>;
  createdAt?: string;
};

function getEventsPath() {
  if (process.env.NOTIFICATION_EVENTS_PATH) {
    return process.env.NOTIFICATION_EVENTS_PATH;
  }

  return path.join(process.cwd(), "data", "notification-events.json");
}

function readRawEvents(): NotificationEvent[] {
  const target = getEventsPath();

  if (!existsSync(target)) {
    return [];
  }

  try {
    const parsed = JSON.parse(readFileSync(target, "utf-8")) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((entry): entry is NotificationEvent => {
      return (
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as NotificationEvent).id === "string" &&
        typeof (entry as NotificationEvent).type === "string" &&
        typeof (entry as NotificationEvent).leagueId === "string" &&
        typeof (entry as NotificationEvent).managerId === "string" &&
        typeof (entry as NotificationEvent).createdAt === "string" &&
        typeof (entry as NotificationEvent).payload === "object" &&
        (entry as NotificationEvent).payload !== null
      );
    });
  } catch {
    return [];
  }
}

function saveRawEvents(events: NotificationEvent[]) {
  const target = getEventsPath();
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, JSON.stringify(events, null, 2), "utf-8");
}

export function recordNotificationEvent(input: NotificationEventInput): NotificationEvent {
  const next: NotificationEvent = {
    id: crypto.randomUUID(),
    type: input.type,
    leagueId: input.leagueId,
    managerId: input.managerId,
    payload: input.payload,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };

  const events = readRawEvents();
  events.push(next);
  saveRawEvents(events);
  return next;
}

export function readNotificationEvents(filters?: {
  managerId?: string;
  leagueId?: string;
  types?: NotificationEventType[];
  since?: string;
}): NotificationEvent[] {
  const events = readRawEvents();

  return events.filter((event) => {
    if (filters?.managerId && event.managerId !== filters.managerId) {
      return false;
    }

    if (filters?.leagueId && event.leagueId !== filters.leagueId) {
      return false;
    }

    if (filters?.types && filters.types.length > 0 && !filters.types.includes(event.type)) {
      return false;
    }

    if (filters?.since && event.createdAt < filters.since) {
      return false;
    }

    return true;
  });
}
