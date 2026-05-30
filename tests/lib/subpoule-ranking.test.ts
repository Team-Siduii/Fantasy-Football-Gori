import { describe, expect, it } from "vitest";
import { computeSubpouleStanding } from "../../src/lib/subpoule-ranking";

describe("subpoule ranking", () => {
  it("calculates rank within subpoule instead of global pool", () => {
    const standing = computeSubpouleStanding({
      managerEmail: "s.j.m.duindam@gmail.com",
      managers: [
        { email: "s.j.m.duindam@gmail.com", displayName: "Simon", subpoule: "A", points: 120 },
        { email: "johan201@hotmail.com", displayName: "Johan", subpoule: "A", points: 140 },
        { email: "thomasbart91@gmail.com", displayName: "Thomas", subpoule: "A", points: 110 },
        { email: "outsider@example.com", displayName: "Out", subpoule: "B", points: 999 },
      ],
    });

    expect(standing?.subpoule).toBe("A");
    expect(standing?.rank).toBe(2);
    expect(standing?.totalManagersInSubpoule).toBe(3);
  });
});
