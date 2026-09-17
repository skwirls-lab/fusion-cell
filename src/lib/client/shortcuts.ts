/**
 * Keyboard shortcuts: the single source of truth (PRD §8).
 *
 * Every key binding in the app is a row in SHORTCUTS. The global handler
 * (src/hooks/useShortcuts.ts), the timeline, the search box, the analyst input
 * and the brief editor all match events through `matchesShortcut`, and the
 * help overlay (`?`) renders this same table — so the help can never drift
 * from what the keys do.
 *
 * Everything here is pure (structural types, no DOM globals) so it is unit
 * tested in node: tests/unit/client/shortcuts.test.ts.
 */

export type ShortcutScope = 'global' | 'workspace' | 'timeline' | 'search' | 'analyst' | 'briefs';

export type ShortcutId =
  | 'help' | 'focus-search' | 'escape'
  | 'open-analyst' | 'focus-graph' | 'focus-map'
  | 'toggle-replay'
  | 'search-next' | 'search-prev' | 'search-choose'
  | 'analyst-send' | 'brief-save';

export interface Shortcut {
  id: ShortcutId;
  /** `KeyboardEvent.key` values; single characters are compared case-insensitively (Caps Lock). */
  keys: readonly string[];
  /** What the help overlay prints for the key. */
  label: string;
  description: string;
  scope: ShortcutScope;
  /** Ctrl or Cmd must be held. Every other shortcut refuses Ctrl/Cmd so browser chords (Ctrl+A, Cmd+G…) pass through. */
  mod?: boolean;
  /**
   * 'forbid': Shift must be up. 'any': Shift is ignored, for keys whose Shift state depends on
   * the keyboard layout (`?` is Shift+/ on a US layout, `/` is Shift+7 on a German one).
   */
  shift: 'forbid' | 'any';
  /** Fires while focus is in a text field. Only field-owned keys and Escape set this. */
  whileTyping: boolean;
  /** Auto-repeat (key held down) keeps firing. Only list navigation wants that. */
  repeat?: boolean;
}

export const SCOPE_LABEL: Record<ShortcutScope, string> = {
  global: 'Everywhere',
  workspace: 'Workspace',
  timeline: 'Timeline (pointer over, or focus in, the live-feed drawer)',
  search: 'Global search results',
  analyst: 'AI Analyst input',
  briefs: 'Brief editor',
};

export const SHORTCUTS: readonly Shortcut[] = [
  { id: 'help', keys: ['?'], label: '?', description: 'Show or hide this shortcut list', scope: 'global', shift: 'any', whileTyping: false },
  { id: 'focus-search', keys: ['/'], label: '/', description: 'Focus global search', scope: 'global', shift: 'any', whileTyping: false },
  { id: 'escape', keys: ['Escape'], label: 'Esc', description: 'Close the topmost thing: shortcut list, then an open menu or result list, then the report reader; otherwise leave the text field, then clear the selection', scope: 'global', shift: 'any', whileTyping: true },
  { id: 'open-analyst', keys: ['a'], label: 'A', description: 'Open the AI Analyst tab and focus its input', scope: 'workspace', shift: 'forbid', whileTyping: false },
  { id: 'focus-graph', keys: ['g'], label: 'G', description: 'Focus the link chart (restores it if the map is maximized)', scope: 'workspace', shift: 'forbid', whileTyping: false },
  { id: 'focus-map', keys: ['m'], label: 'M', description: 'Focus the map (restores it if the link chart is maximized)', scope: 'workspace', shift: 'forbid', whileTyping: false },
  { id: 'toggle-replay', keys: [' '], label: 'Space', description: 'Play / pause the scenario replay', scope: 'timeline', shift: 'forbid', whileTyping: false },
  { id: 'search-next', keys: ['ArrowDown'], label: '↓', description: 'Next result', scope: 'search', shift: 'forbid', whileTyping: true, repeat: true },
  { id: 'search-prev', keys: ['ArrowUp'], label: '↑', description: 'Previous result', scope: 'search', shift: 'forbid', whileTyping: true, repeat: true },
  { id: 'search-choose', keys: ['Enter'], label: 'Enter', description: 'Open the highlighted result', scope: 'search', shift: 'forbid', whileTyping: true },
  { id: 'analyst-send', keys: ['Enter'], label: 'Enter', description: 'Send the question (Shift+Enter inserts a new line)', scope: 'analyst', shift: 'forbid', whileTyping: true },
  { id: 'brief-save', keys: ['s'], label: 'Ctrl/⌘ S', description: 'Save the brief as a new version', scope: 'briefs', mod: true, shift: 'forbid', whileTyping: true },
];

const BY_ID = new Map(SHORTCUTS.map((s) => [s.id, s]));

export function getShortcut(id: ShortcutId): Shortcut {
  const s = BY_ID.get(id);
  if (!s) throw new Error(`Unknown shortcut: ${id}`);
  return s;
}

// ---- matching ----------------------------------------------------------------------

/** The slice of KeyboardEvent the matcher reads (React's synthetic event satisfies it through `nativeEvent` fields too). */
export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat?: boolean;
  isComposing?: boolean;
}

export const normalizeKey = (key: string): string => (key.length === 1 ? key.toLowerCase() : key);

/** Key + modifiers only. Focus rules are separate: see `shouldFire`. */
export function eventMatches(s: Shortcut, e: KeyLike): boolean {
  if (e.isComposing) return false;                         // IME composition owns the keyboard
  if (e.altKey) return false;                              // no shortcut uses Alt; Alt chords belong to the browser/OS
  if (Boolean(s.mod) !== (e.ctrlKey || e.metaKey)) return false;
  if (s.shift === 'forbid' && e.shiftKey) return false;
  if (e.repeat && !s.repeat) return false;
  return s.keys.includes(normalizeKey(e.key));
}

export function matchesShortcut(id: ShortcutId, e: KeyLike): boolean {
  return eventMatches(getShortcut(id), e);
}

// ---- focus guards ----------------------------------------------------------------------

/** The slice of an element the guards read; a real HTMLElement satisfies it. */
export interface TargetLike {
  tagName?: string;
  type?: string;
  isContentEditable?: boolean;
  getAttribute?: (name: string) => string | null;
}

/** <input> types that take no text: a letter key pressed on them types nothing. */
const NON_TEXT_INPUT_TYPES = new Set(['button', 'checkbox', 'color', 'file', 'image', 'radio', 'range', 'reset', 'submit']);
const TEXT_ROLES = new Set(['textbox', 'searchbox', 'combobox', 'spinbutton']);
/** Roles (and, below, elements) on which Space already means "activate this". */
const SPACE_ROLES = new Set(['button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option']);

function asTarget(t: unknown): TargetLike | null {
  return t !== null && typeof t === 'object' && typeof (t as TargetLike).tagName === 'string' ? (t as TargetLike) : null;
}

/** True when a printable key pressed on this element would type (or type-ahead select) rather than be free for a shortcut. */
export function isTypingTarget(target: unknown): boolean {
  const t = asTarget(target);
  if (!t) return false;
  const tag = t.tagName!.toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') return !NON_TEXT_INPUT_TYPES.has((t.type ?? 'text').toLowerCase());
  if (t.isContentEditable) return true;
  const ce = t.getAttribute?.('contenteditable');
  if (ce !== null && ce !== undefined && ce.toLowerCase() !== 'false') return true;
  const role = t.getAttribute?.('role');
  return role !== null && role !== undefined && TEXT_ROLES.has(role);
}

/**
 * True when Space pressed on this element already does something natively — clicks a button,
 * follows a link, ticks a checkbox, opens a select — or types. A Space shortcut must stand down
 * there, otherwise the key does two things at once. A range input is deliberately not in the
 * list: Space does nothing on a slider, and the timeline scrubber is one.
 */
export function isSpaceActivatable(target: unknown): boolean {
  const t = asTarget(target);
  if (!t) return false;
  if (isTypingTarget(t)) return true;
  const tag = t.tagName!.toUpperCase();
  if (tag === 'BUTTON' || tag === 'SUMMARY' || tag === 'A' || tag === 'AREA' || tag === 'AUDIO' || tag === 'VIDEO') return true;
  if (tag === 'INPUT') return (t.type ?? 'text').toLowerCase() !== 'range';
  const role = t.getAttribute?.('role');
  return role !== null && role !== undefined && SPACE_ROLES.has(role);
}

/** Key, modifiers and focus together: should this shortcut run for this event on this target? */
export function shouldFire(s: Shortcut, e: KeyLike, target: unknown): boolean {
  if (!eventMatches(s, e)) return false;
  if (!s.whileTyping && isTypingTarget(target)) return false;
  if (s.keys.includes(' ') && isSpaceActivatable(target)) return false;
  return true;
}

/** The first shortcut in the given scopes that should run, or null. */
export function findShortcut(e: KeyLike, target: unknown, scopes: readonly ShortcutScope[]): Shortcut | null {
  for (const s of SHORTCUTS) if (scopes.includes(s.scope) && shouldFire(s, e, target)) return s;
  return null;
}

/**
 * Pairs of shortcuts that could both fire for one key press: same key, same modifier
 * requirement, and scopes that can be live at once. `search`, `analyst` and `briefs` each
 * belong to one focused field, so they never overlap each other.
 */
const FIELD_SCOPES = new Set<ShortcutScope>(['search', 'analyst', 'briefs']);
export function findCollisions(table: readonly Shortcut[] = SHORTCUTS): Array<[ShortcutId, ShortcutId]> {
  const out: Array<[ShortcutId, ShortcutId]> = [];
  for (let i = 0; i < table.length; i += 1) {
    for (let j = i + 1; j < table.length; j += 1) {
      const a = table[i], b = table[j];
      if (Boolean(a.mod) !== Boolean(b.mod)) continue;
      if (!a.keys.some((k) => b.keys.includes(k))) continue;
      if (a.scope !== b.scope && FIELD_SCOPES.has(a.scope) && FIELD_SCOPES.has(b.scope)) continue;
      out.push([a.id, b.id]);
    }
  }
  return out;
}

/**
 * Chords the browser owns that a page must never take. With `mod` the key is a Ctrl/Cmd chord.
 * (`/` is Firefox quick-find; it is taken on purpose, with preventDefault, as every web app's
 * "focus search" — and only outside text fields.)
 */
export const RESERVED_MOD_KEYS: readonly string[] = ['a', 'c', 'v', 'x', 'z', 'y', 'f', 'g', 'p', 'r', 't', 'w', 'n', 'l', 'd', 'h', 'j', 'k', 'o', 'u'];

// ---- Escape layers ----------------------------------------------------------------------

/** Higher closes first. */
export const ESCAPE_PRIORITY = { reader: 10, menu: 20, help: 30 } as const;

export interface EscapeLayer {
  seq: number;
  priority: number;
  close: () => void;
}

/** Topmost = highest priority; among equals, the one opened last. */
export function topEscapeLayer(layers: readonly EscapeLayer[]): EscapeLayer | null {
  let top: EscapeLayer | null = null;
  for (const l of layers) {
    if (!top || l.priority > top.priority || (l.priority === top.priority && l.seq > top.seq)) top = l;
  }
  return top;
}

const openLayers: EscapeLayer[] = [];
let nextSeq = 0;

/** An open overlay registers itself; the returned function unregisters it. */
export function pushEscapeLayer(priority: number, close: () => void): () => void {
  const layer: EscapeLayer = { seq: (nextSeq += 1), priority, close };
  openLayers.push(layer);
  return () => {
    const i = openLayers.indexOf(layer);
    if (i >= 0) openLayers.splice(i, 1);
  };
}

/** Closes exactly one layer — the topmost. False when nothing is open. */
export function closeTopEscapeLayer(): boolean {
  const top = topEscapeLayer(openLayers);
  if (!top) return false;
  top.close();
  return true;
}

export const openEscapeLayerCount = (): number => openLayers.length;
