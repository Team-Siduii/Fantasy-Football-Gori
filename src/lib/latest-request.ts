export type LatestRequestTracker = {
  begin: () => number;
  isActive: (requestId: number, aborted?: boolean) => boolean;
};

export function createLatestRequestTracker(): LatestRequestTracker {
  let latestRequestId = 0;

  return {
    begin() {
      latestRequestId += 1;
      return latestRequestId;
    },
    isActive(requestId, aborted = false) {
      return !aborted && requestId === latestRequestId;
    },
  };
}
