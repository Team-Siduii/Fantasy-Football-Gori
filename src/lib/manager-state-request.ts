type ManagerStateRequestMode = "wk" | "eredivisie";

export function buildManagerStateRequestUrl(input: {
  mode: ManagerStateRequestMode;
  selectedRound: number | null;
  currentRound: number | null;
  cacheBust: number;
}) {
  const params = new URLSearchParams({
    mode: input.mode,
  });

  if (input.mode === "wk" && Number.isInteger(input.selectedRound) && (input.selectedRound ?? 0) > 0) {
    params.set("roundNumber", String(input.selectedRound));
  }

  params.set("_t", String(input.cacheBust));

  return `/api/manager/state?${params.toString()}`;
}
