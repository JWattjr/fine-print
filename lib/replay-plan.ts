export type ReplayCapture = { timestamp: string; original: string; url: string; digest: string };
export type ReplayPlan = {
  id: string; status: 'PLANNED_NOT_RUN'; historicalReplay: true; baseline: ReplayCapture; later?: ReplayCapture;
  concern: string; passage?: string; targetOutcome: string; bountyWei: string; challengeSeconds?: number;
  offlinePreflight?: { laterPresence: boolean; baselineAbsence: boolean };
  challenge?: { ground: 'ALREADY_EXISTED' | 'WRONG_DOCUMENT'; baselinePassage: string; argument: string };
};
export function replayIds(id: string) { return { watch: `rw_${id}`, claim: `rc_${id}`, challenge: `rh_${id}`, ticket: `rt_${id}` }; }
