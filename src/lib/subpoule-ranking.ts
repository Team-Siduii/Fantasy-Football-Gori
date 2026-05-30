export type SubpouleManagerScore = {
  email: string;
  displayName: string;
  subpoule: string;
  points: number;
};

export type SubpouleStanding = {
  subpoule: string;
  rank: number;
  totalManagersInSubpoule: number;
  points: number;
};

export function computeSubpouleStanding(input: {
  managerEmail: string;
  managers: SubpouleManagerScore[];
}): SubpouleStanding | null {
  const normalizedEmail = input.managerEmail.trim().toLowerCase();
  const current = input.managers.find((m) => m.email.trim().toLowerCase() === normalizedEmail);
  if (!current) return null;

  const poolMembers = input.managers
    .filter((m) => m.subpoule === current.subpoule)
    .sort((a, b) => b.points - a.points || a.displayName.localeCompare(b.displayName));

  const rank = poolMembers.findIndex((m) => m.email.trim().toLowerCase() === normalizedEmail) + 1;
  if (rank <= 0) return null;

  return {
    subpoule: current.subpoule,
    rank,
    totalManagersInSubpoule: poolMembers.length,
    points: current.points,
  };
}
