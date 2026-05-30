export function shouldUseWkcoachByDefault(includeWkcoachParam: string | null): boolean {
  if (includeWkcoachParam === null) return true;
  return includeWkcoachParam.toLowerCase() !== "false";
}

export function getPlayerPointsPriority(): string {
  return "wkcoach(primary)>fallback";
}
