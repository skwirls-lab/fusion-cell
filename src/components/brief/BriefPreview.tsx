'use client';

/**
 * Live preview of a brief's markdown; [R-xxxx] renders as a chip that opens the
 * report reader. A number outside the brief's validated `citations` renders as
 * an invalid chip (red, struck through), the same rule as the analyst panel.
 */
import { useMemo } from 'react';
import Markdown, { type Components } from 'react-markdown';
import { useSelection } from '@/stores/selection';

const CITATION_RE = /\[(R-\d{4})\]/g;
const CITE_HREF = '#cite-';

export function BriefCitationChip({ number, invalid = false }: { number: string; invalid?: boolean }) {
  const openReport = useSelection((s) => s.openReport);
  return (
    <button
      type="button"
      data-testid="brief-citation"
      data-citation={number}
      data-invalid={invalid || undefined}
      title={invalid ? "not among this brief's validated citations" : `Open report ${number}`}
      onClick={() => openReport(number)}
      className={
        'mx-0.5 inline-block rounded border px-1 font-mono text-[10px] leading-4 align-baseline ' +
        (invalid
          ? 'border-hegemony/60 bg-hegemony/10 text-hegemony line-through decoration-hegemony/70'
          : 'border-concord/40 bg-concord/10 text-concord hover:bg-concord/25')
      }
    >
      {number}
    </button>
  );
}

export function BriefPreview({ markdown, citations }: { markdown: string; citations?: string[] }) {
  const source = useMemo(() => markdown.replace(CITATION_RE, (_, n: string) => `[${n}](${CITE_HREF}${n})`), [markdown]);
  const valid = useMemo(() => (citations ? new Set(citations) : null), [citations]);
  const components = useMemo<Components>(() => ({
    a: ({ href, children }) => {
      if (href?.startsWith(CITE_HREF)) {
        const n = href.slice(CITE_HREF.length);
        return <BriefCitationChip number={n} invalid={valid !== null && !valid.has(n)} />;
      }
      return <a href={href} target="_blank" rel="noreferrer" className="text-concord underline">{children}</a>;
    },
    h1: ({ children }) => <h1 className="mb-1 text-[18px] font-semibold leading-tight text-text">{children}</h1>,
    h2: ({ children }) => <h2 className="mb-1 mt-4 border-b border-border pb-0.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{children}</h2>,
    h3: ({ children }) => <h3 className="mt-3 text-[12.5px] font-semibold text-text">{children}</h3>,
    p: ({ children }) => <p className="my-1.5">{children}</p>,
    ul: ({ children }) => <ul className="my-1.5 list-disc pl-5">{children}</ul>,
    ol: ({ children }) => <ol className="my-1.5 list-decimal pl-5">{children}</ol>,
    li: ({ children }) => <li className="my-0.5">{children}</li>,
    strong: ({ children }) => <strong className="font-semibold text-text">{children}</strong>,
    code: ({ children }) => <code className="rounded bg-panel-2 px-1 font-mono text-[11px]">{children}</code>,
  }), [valid]);
  return (
    <div className="text-[12.5px] leading-relaxed text-text" data-testid="brief-preview">
      <Markdown components={components}>{source}</Markdown>
    </div>
  );
}
