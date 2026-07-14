import type { ZoneState } from "@/domain/lineup-state";

/**
 * Een pending sell is alleen presentatie-/workflowstatus.
 * De speler blijft zichtbaar in het team totdat de transfer definitief is verwerkt.
 */
export function preservePendingSellVisibility<T extends { id: string }>(
  state: ZoneState<T>,
  pendingSellId: string | null,
): ZoneState<T> {
  void pendingSellId;
  return state;
}
