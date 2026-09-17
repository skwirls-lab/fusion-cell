'use client';

/**
 * Page frame for /briefs: top bar, the shared left rail, a full-width main,
 * and the report reader (opened by citation chips) overlaying the right edge.
 * Mirrors the workspace's viewport arithmetic (two 28px exercise banners).
 */
import { TopBar } from '@/components/shell/TopBar';
import { LeftRail } from '@/components/shell/LeftRail';
import ReportReader from '@/components/feed/ReportReader';

export function BriefFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative grid h-[calc(100vh-56px)] grid-rows-[auto_1fr] overflow-hidden">
      <TopBar />
      <div className="grid min-h-0 grid-cols-[240px_1fr]">
        <LeftRail />
        <main className="min-h-0 min-w-0 overflow-hidden">{children}</main>
      </div>
      <ReportReader />
    </div>
  );
}
