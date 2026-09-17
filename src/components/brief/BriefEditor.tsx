'use client';

/**
 * The editor: title, a markdown textarea (mono, full height) with a live
 * preview toggle, Save (new version), Print / PDF (the print route in a new
 * tab), Delete. A markdown textarea rather than a rich-text editor: Tiptap is
 * not installed and cannot be in this build (DECISIONS.md).
 */
import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { useQueryClient } from '@tanstack/react-query';
import { BRIEFS_KEY, patchBrief, removeBrief, useBrief, type BriefFull } from '@/lib/client/api';
import { ErrorState, Skeleton, TypeBadge } from '@/lib/client/chips';
import { formatDtgFull } from '@/lib/client/format';
import { BriefPreview } from './BriefPreview';
import { TEMPLATE_LABEL } from './templates';

type Mode = 'edit' | 'preview';

function Editor({ brief, onDeleted }: { brief: BriefFull; onDeleted: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(brief.title);
  const [markdown, setMarkdown] = useState(brief.markdown);
  const [mode, setMode] = useState<Mode>('edit');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A new version from the server (save, or another tab) resets the draft.
  useEffect(() => { setTitle(brief.title); setMarkdown(brief.markdown); }, [brief.id, brief.version, brief.title, brief.markdown]);

  const dirty = title !== brief.title || markdown !== brief.markdown;

  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true); setError(null);
    try {
      const next = await patchBrief(brief.id, { title: title.trim() || brief.title, markdown });
      qc.setQueryData(['brief', brief.id], next);
      await qc.invalidateQueries({ queryKey: BRIEFS_KEY });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    if (deleting) return;
    if (!window.confirm(`Delete "${brief.title}" (${brief.id})? This cannot be undone.`)) return;
    setDeleting(true); setError(null);
    try {
      await removeBrief(brief.id);
      qc.removeQueries({ queryKey: ['brief', brief.id] });
      await qc.invalidateQueries({ queryKey: BRIEFS_KEY });
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDeleting(false);
    }
  };

  const print = () => {
    window.open(`/api/briefs/${encodeURIComponent(brief.id)}/print?print=1`, '_blank', 'noopener');
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void save(); }
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="brief-editor" data-id={brief.id} data-dirty={dirty || undefined} onKeyDown={onKeyDown}>
      <header className="flex shrink-0 flex-col gap-1.5 border-b border-border px-3 py-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Brief title"
          data-testid="brief-title-input"
          className="h-8 w-full rounded border border-border bg-bg px-2 text-[14px] font-semibold text-text focus:border-concord/60 focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] text-muted">
          <span className="text-text">{brief.id}</span>
          <TypeBadge>{TEMPLATE_LABEL[brief.template]}</TypeBadge>
          <span data-testid="brief-version">v{brief.version}</span>
          <span>·</span>
          <span title={brief.updatedAt}>updated {formatDtgFull(brief.updatedAt)}</span>
          {brief.citations.length > 0 && <span>· {brief.citations.length} cited</span>}
          {dirty ? (
            <span data-testid="brief-dirty" className="rounded-sm border border-banner/60 bg-banner/10 px-1 text-banner">UNSAVED CHANGES</span>
          ) : (
            <span data-testid="brief-clean" className="text-muted/70">saved</span>
          )}
          <span className="flex-1" />
          <div role="group" aria-label="Editor mode" className="flex overflow-hidden rounded border border-border">
            {(['edit', 'preview'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                data-testid={`brief-mode-${m}`}
                onClick={() => setMode(m)}
                className={clsx('px-2 py-0.5 text-[11px] font-sans', mode === m ? 'bg-panel-2 text-concord' : 'text-muted hover:text-text')}
              >
                {m === 'edit' ? 'Edit' : 'Preview'}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => void save()} disabled={!dirty || saving} data-testid="brief-save"
            className="h-6 rounded bg-concord px-2.5 font-sans text-[11px] font-medium text-bg hover:bg-concord/90 disabled:opacity-40">
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={print} data-testid="brief-print"
            className="h-6 rounded border border-border px-2 font-sans text-[11px] text-text hover:border-concord/50 hover:text-concord">
            Print / PDF
          </button>
          <button type="button" onClick={() => void del()} disabled={deleting} data-testid="brief-delete"
            className="h-6 rounded border border-hegemony/50 px-2 font-sans text-[11px] text-hegemony hover:bg-hegemony/10 disabled:opacity-40">
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
        {error && <div role="alert" className="rounded border border-hegemony/60 bg-hegemony/10 px-2 py-1 text-[11px] text-hegemony">{error}</div>}
      </header>

      <div className="min-h-0 flex-1">
        {mode === 'edit' ? (
          <textarea
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            spellCheck={false}
            aria-label="Brief markdown"
            data-testid="brief-markdown"
            className="h-full w-full resize-none bg-bg px-3 py-2 font-mono text-[12px] leading-[1.55] text-text focus:outline-none"
          />
        ) : (
          <div className="h-full overflow-y-auto px-4 py-3">
            <BriefPreview markdown={markdown} />
          </div>
        )}
      </div>
    </div>
  );
}

export function BriefEditor({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const q = useBrief(id);
  if (q.isPending) return <div className="p-3"><Skeleton rows={12} /></div>;
  if (q.error) return <ErrorState error={q.error} retry={() => void q.refetch()} />;
  return <Editor key={q.data.id} brief={q.data} onDeleted={onDeleted} />;
}
