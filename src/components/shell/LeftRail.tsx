'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import FilterPanel from '@/components/filters';

const NAV: ReadonlyArray<{ label: string; href: string }> = [
  { label: 'Workspace', href: '/' },
  { label: 'Reports', href: '/reports' },
  { label: 'Entities', href: '/entities' },
  { label: 'Briefs', href: '/briefs' },
  { label: 'Ingest', href: '/ingest' },
  { label: 'Admin', href: '/admin' },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 pb-1 pt-3 font-mono text-[10px] font-semibold tracking-[0.18em] text-muted">
      {children}
    </div>
  );
}

/** Navigation + the filter panel (bound to the shared selection store). */
export function LeftRail() {
  const pathname = usePathname();
  return (
    <aside className="flex min-h-0 flex-col overflow-y-auto border-r border-border bg-panel" aria-label="Navigation and filters">
      <SectionLabel>NAVIGATION</SectionLabel>
      <nav>
        <ul>
          {NAV.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={
                    'flex w-full items-center px-3 py-1.5 text-left text-[12px] ' +
                    (active
                      ? 'border-l-2 border-concord bg-panel-2 text-text'
                      : 'border-l-2 border-transparent text-muted hover:bg-panel-2 hover:text-text')
                  }
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <SectionLabel>FILTERS</SectionLabel>
      <FilterPanel />
    </aside>
  );
}
