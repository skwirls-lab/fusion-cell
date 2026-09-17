'use client';

/**
 * Scenario timeline scrubber + replay (MAP-7, PRD §5.5 "scenario replay"),
 * done client-side: the cursor writes `filters.to`, and every view that
 * already honours the shared filters (map events, feed rows, profile
 * timelines) is cut off there. Cursor at day 1 → the picture is empty; press
 * play and it comes alive. Cursor at the end → `to: null`, no cutoff.
 *
 * The visual cursor advances per frame; filter pushes are quantized to the
 * 2-hour grid and throttled so a 12× replay fires a few queries a second,
 * not sixty. Under reduced motion the cursor itself steps on that grid.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { DEFAULT_FILTERS, useSelection } from '@/stores/selection';
import { useEvents } from '@/lib/client/api';
import { usePrefersReducedMotion } from '@/lib/client/motion';
import { SCENARIO_DAYS } from '@/lib/client/format';
import {
  SPEEDS, advance, clampFraction, cursorLabel, densityByDay, fractionToIso, isoToFraction, quantize, type Speed,
} from '@/lib/client/timeline';
import styles from './timeline.module.css';

const PUSH_THROTTLE_MS = 300;
const RANGE_STEPS = 10_000;

function PlayIcon({ playing }: { playing: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" fill="currentColor">
      {playing ? <><rect x="1" y="1" width="3" height="8" /><rect x="6" y="1" width="3" height="8" /></> : <path d="M2 1l7 4-7 4z" />}
    </svg>
  );
}

function StarBurstIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M1 5h8M5 1v8M2.2 2.2l5.6 5.6M7.8 2.2L2.2 7.8" />
    </svg>
  );
}

export function Timeline() {
  const to = useSelection((s) => s.filters.to);
  const setFilters = useSelection((s) => s.setFilters);
  const reduced = usePrefersReducedMotion();
  // All events, unfiltered: the density strip must not empty itself as the cursor rewinds.
  const all = useEvents(DEFAULT_FILTERS);
  const density = useMemo(() => densityByDay((all.data ?? []).map((e) => e.occurredAt)), [all.data]);
  const maxDensity = Math.max(1, ...density);

  const [fraction, setFraction] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(4);
  const [hover, setHover] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fractionRef = useRef(1);
  fractionRef.current = fraction;

  // ---- store ← cursor (quantized, throttled) ------------------------------------
  const lastPushed = useRef<string | null>(null);   // the last `to` we wrote; anything else is an external edit
  const pushTimer = useRef<number | undefined>(undefined);
  const pushAt = useRef(0);
  const push = useCallback((f: number, immediate = false) => {
    const q = quantize(f);
    const iso = q >= 1 ? null : fractionToIso(q);
    if (iso === lastPushed.current) return;
    const commit = () => {
      pushAt.current = performance.now();
      lastPushed.current = iso;
      setFilters({ to: iso });
    };
    window.clearTimeout(pushTimer.current);
    const wait = PUSH_THROTTLE_MS - (performance.now() - pushAt.current);
    if (immediate || wait <= 0) commit();
    else pushTimer.current = window.setTimeout(commit, wait);
  }, [setFilters]);
  useEffect(() => () => window.clearTimeout(pushTimer.current), []);

  // ---- store → cursor: the filter panel, URL hydration, or "Reset filters" moved it --
  useEffect(() => {
    if (to === lastPushed.current) return;
    lastPushed.current = to;
    setPlaying(false);
    setFraction(isoToFraction(to));
  }, [to]);

  const seek = useCallback((f: number, immediate = false) => {
    const c = clampFraction(f);
    setFraction(c);
    push(c, immediate);
  }, [push]);

  // ---- play loop -------------------------------------------------------------------
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const next = advance(fractionRef.current, now - last, speed);
      last = now;
      if (next >= 1) { setFraction(1); push(1, true); setPlaying(false); return; }
      setFraction(next);
      push(next);
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [playing, speed, push]);

  const playingRef = useRef(false);
  playingRef.current = playing;
  const togglePlay = useCallback(() => {
    if (playingRef.current) { setPlaying(false); return; }
    if (fractionRef.current >= 1) seek(0, true); // play from the end = replay from day 1
    setPlaying(true);
  }, [seek]);
  const reset = useCallback(() => { setPlaying(false); seek(1, true); }, [seek]);
  const replayFromStart = useCallback(() => { seek(0, true); setPlaying(true); }, [seek]);

  // Space toggles play while the drawer is hovered or holds focus; never inside a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const t = e.target;
      const inText = t instanceof HTMLElement && ((t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'range') || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if (inText) return;
      const drawer = wrapRef.current?.closest('#bottom-drawer');
      const focused = !!drawer && drawer.contains(document.activeElement);
      if (!hover && !focused) return;
      e.preventDefault();
      togglePlay();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hover, togglePlay]);

  const shown = reduced ? quantize(fraction) : fraction;
  const label = cursorLabel(shown);
  const cutoff = to !== null;

  return (
    <div
      ref={wrapRef}
      data-testid="timeline"
      data-playing={playing ? 'true' : 'false'}
      data-speed={speed}
      data-cursor={fractionToIso(shown)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="shrink-0 border-b border-border bg-panel px-2 pb-1 pt-0.5"
    >
      <div className="flex h-5 items-center gap-1">
        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? 'Pause replay' : 'Play replay'}
          aria-pressed={playing}
          className={clsx('flex h-4 w-6 items-center justify-center rounded-sm border text-[10px]', playing ? 'border-concord/60 bg-concord/15 text-concord' : 'border-border text-text hover:border-concord/50 hover:text-concord')}
        >
          <PlayIcon playing={playing} />
        </button>
        <div role="group" aria-label="Replay speed" className="flex overflow-hidden rounded-sm border border-border">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s)}
              aria-pressed={speed === s}
              className={clsx('h-4 px-1.5 font-mono text-[9px] leading-none', speed === s ? 'bg-concord/15 text-concord' : 'text-muted hover:text-text')}
            >
              {s}×
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={replayFromStart}
          className="flex h-4 items-center gap-1 rounded-sm border border-border px-1.5 font-mono text-[9px] tracking-wider text-muted hover:border-concord/50 hover:text-concord"
          title="Rewind to 01 0000Z and play: the map and feed fill in as the clock runs"
        >
          <StarBurstIcon />
          REPLAY FROM DAY 1
        </button>
        <button
          type="button"
          onClick={reset}
          aria-label="Reset timeline"
          disabled={!cutoff && !playing}
          className="h-4 rounded-sm border border-border px-1.5 font-mono text-[9px] tracking-wider text-muted hover:border-concord/50 hover:text-concord disabled:opacity-40 disabled:hover:border-border disabled:hover:text-muted"
          title="Clear the cutoff: show everything"
        >
          RESET
        </button>
        <span className="ml-auto flex items-center gap-2 font-mono text-[10px] tracking-wider">
          {cutoff && <span className="rounded-sm border border-cartel/50 px-1 text-[9px] leading-[13px] text-cartel">{playing ? 'REPLAY' : 'CUTOFF'}</span>}
          <span className={cutoff ? 'text-text' : 'text-muted'} data-testid="timeline-label">{label}</span>
        </span>
      </div>

      <div className="relative mt-0.5 h-5">
        {/* Density strip: one bar per day, events counted from the unfiltered query. */}
        <div className="absolute inset-x-0 bottom-0 flex h-4 items-end" aria-hidden="true" data-testid="timeline-density">
          {density.map((n, i) => (
            <div key={i} className="flex h-full flex-1 items-end border-l border-border/60 px-px" title={`Day ${i + 1} · ${n} event${n === 1 ? '' : 's'}`}>
              <div
                data-day={i + 1}
                data-count={n}
                className={clsx('w-full rounded-t-[1px]', (i + 1) / SCENARIO_DAYS <= shown ? 'bg-concord/60' : 'bg-muted/25')}
                style={{ height: `${Math.max(n > 0 ? 8 : 0, (n / maxDensity) * 100)}%` }}
              />
            </div>
          ))}
        </div>
        {/* Cut-off shading: what the views are not showing. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 bg-bg/55" style={{ left: `${shown * 100}%` }} />
        <input
          type="range"
          min={0}
          max={RANGE_STEPS}
          step={1}
          value={Math.round(fraction * RANGE_STEPS)}
          onChange={(e) => { setPlaying(false); seek(Number(e.target.value) / RANGE_STEPS); }}
          aria-label="Scenario timeline cursor"
          aria-valuetext={label}
          data-testid="timeline-scrubber"
          className={clsx(styles.range, 'absolute inset-0 z-10 h-full w-full')}
        />
        <div
          aria-hidden="true"
          className={clsx(styles.cursor, 'pointer-events-none absolute inset-y-0 w-px', cutoff ? 'bg-cartel' : 'bg-concord')}
          style={{ left: `calc(${shown * 100}% - ${shown >= 1 ? 1 : 0}px)` }}
        />
      </div>
    </div>
  );
}

export default Timeline;
