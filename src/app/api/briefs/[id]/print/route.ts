/**
 * GET /api/briefs/[id]/print[?print=1] — the PDF export (PRD §5.8: browser
 * print-to-PDF). A self-contained HTML page: the brief's markdown rendered to
 * HTML, src/app/print.css inlined, the exercise banner fixed at the top and
 * bottom of every printed page, citation chips styled. `?print=1` calls
 * window.print() once the page has loaded.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getDb } from '@/lib/db';
import { handle, json } from '@/lib/api';
import { getBrief } from '@/lib/db/queries';
import { briefMarkdownToHtml, TEMPLATE_LABEL } from '@/lib/ai/brief';
import { EXERCISE_BANNER_TEXT } from '@/components/shell/ExerciseBanner';

export const dynamic = 'force-dynamic';

const CSS_PATH = path.resolve(process.cwd(), 'src/app/print.css');
/** The rules that must hold even if the stylesheet file is not shipped with the server bundle. */
const FALLBACK_CSS = [
  'body{margin:0;font-family:system-ui,sans-serif;font-size:13px;line-height:1.5}',
  '.banner{position:fixed;left:0;right:0;height:28px;display:flex;align-items:center;justify-content:center;background:#b45309;color:#1a0d02;font-family:monospace;font-weight:700;letter-spacing:.18em;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
  '.banner.top{top:0}.banner.bottom{bottom:0}main.brief{max-width:760px;margin:0 auto;padding:52px 32px}',
  '.cite{font-family:monospace;font-size:10px;border:1px solid #0a6e80;border-radius:3px;padding:0 5px;margin:0 2px}',
  '.cite.invalid{color:#b91c1c;border:1px dashed #b91c1c;background:#fef2f2;text-decoration:line-through}',
  '@page{margin:22mm 14mm}@media print{.toolbar{display:none}}',
].join('');

let cssCache: string | null = null;
function printCss(): string {
  if (cssCache !== null) return cssCache;
  try {
    cssCache = fs.readFileSync(CSS_PATH, 'utf8');
  } catch {
    cssCache = FALLBACK_CSS;
  }
  return cssCache;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const GET = handle(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const brief = await getBrief(await getDb(), id);
  if (!brief) return json({ error: 'not_found', id }, { status: 404 });
  const autoPrint = new URL(req.url).searchParams.get('print') === '1';

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(brief.title)} — Fusion Cell brief</title>
<style>${printCss()}</style>
</head>
<body>
<div class="banner top" role="note">${EXERCISE_BANNER_TEXT}</div>
<main class="brief" data-brief-id="${esc(brief.id)}" data-version="${brief.version}">
<div class="toolbar"><button type="button" onclick="window.print()">Print / Save as PDF</button></div>
<div class="meta">${esc(brief.id)} · ${esc(TEMPLATE_LABEL[brief.template])} · v${brief.version} · updated ${esc(brief.updatedAt)}</div>
${briefMarkdownToHtml(brief.markdown, new Set(brief.citations))}
</main>
<div class="banner bottom" role="note">${EXERCISE_BANNER_TEXT}</div>
${autoPrint ? '<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},50)})</script>' : ''}
</body>
</html>
`;
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
});
