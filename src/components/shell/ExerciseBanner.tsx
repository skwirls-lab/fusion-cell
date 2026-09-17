export const EXERCISE_BANNER_TEXT = 'EXERCISE – FICTIONAL DATA – NOT REAL INTELLIGENCE';

/** Pinned to the top and bottom of every page (PRD §8). Server component. */
export function ExerciseBanner() {
  return (
    <div
      data-testid="exercise-banner"
      role="note"
      className="flex h-7 shrink-0 items-center justify-center bg-banner font-mono text-[12px] font-bold tracking-[0.18em] text-[#1a0d02] select-none"
    >
      {EXERCISE_BANNER_TEXT}
    </div>
  );
}
