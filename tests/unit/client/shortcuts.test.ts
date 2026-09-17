/** Phase 7: the shortcut table, the typing/activation guards, and the Escape layer order. */
import { describe, it, expect } from 'vitest';
import {
  ESCAPE_PRIORITY, RESERVED_MOD_KEYS, SCOPE_LABEL, SHORTCUTS,
  closeTopEscapeLayer, eventMatches, findCollisions, findShortcut, getShortcut, isSpaceActivatable, isTypingTarget,
  matchesShortcut, openEscapeLayerCount, pushEscapeLayer, shouldFire, topEscapeLayer,
  type KeyLike, type Shortcut, type TargetLike,
} from '@/lib/client/shortcuts';

const key = (k: string, mods: Partial<KeyLike> = {}): KeyLike => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });
const el = (tagName: string, extra: Partial<TargetLike> & { attrs?: Record<string, string> } = {}): TargetLike => {
  const { attrs = {}, ...rest } = extra;
  return { tagName, getAttribute: (n) => attrs[n] ?? null, ...rest };
};
const BODY = el('BODY');

describe('shortcut table', () => {
  it('has unique ids, a label, a description and a known scope on every row', () => {
    const ids = SHORTCUTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SHORTCUTS) {
      expect(s.keys.length).toBeGreaterThan(0);
      expect(s.label.trim()).not.toBe('');
      expect(s.description.trim()).not.toBe('');
      expect(SCOPE_LABEL[s.scope]).toBeTruthy();
      // Keys are stored the way the matcher normalizes them: single characters lower-case.
      for (const k of s.keys) expect(k.length === 1 ? k.toLowerCase() : k).toBe(k);
    }
  });

  it('binds no key twice among shortcuts that can be live together', () => {
    expect(findCollisions()).toEqual([]);
  });

  it('the collision check itself catches a duplicate', () => {
    const dup: Shortcut = { ...getShortcut('focus-map'), id: 'focus-graph', keys: ['m'] };
    expect(findCollisions([getShortcut('focus-map'), dup])).toEqual([['focus-map', 'focus-graph']]);
    // Same key in two different single-field scopes is not a collision (Enter in search vs Enter in the analyst box).
    expect(findCollisions([getShortcut('search-choose'), getShortcut('analyst-send')])).toEqual([]);
    // …but a field key against a global one would be.
    const globalEnter: Shortcut = { ...getShortcut('help'), keys: ['Enter'] };
    expect(findCollisions([getShortcut('search-choose'), globalEnter])).toHaveLength(1);
  });

  it('takes no Ctrl/Cmd chord the browser owns, and plain keys never fire under Ctrl/Cmd/Alt', () => {
    for (const s of SHORTCUTS) {
      if (s.mod) for (const k of s.keys) expect(RESERVED_MOD_KEYS).not.toContain(k);
      for (const k of s.keys) {
        expect(eventMatches(s, key(k, { altKey: true, ctrlKey: Boolean(s.mod) }))).toBe(false);
        if (!s.mod) {
          expect(eventMatches(s, key(k, { ctrlKey: true }))).toBe(false);
          expect(eventMatches(s, key(k, { metaKey: true }))).toBe(false);
        }
      }
    }
  });
});

describe('eventMatches', () => {
  it('matches letters case-insensitively (Caps Lock) but refuses Shift+letter', () => {
    expect(matchesShortcut('focus-graph', key('g'))).toBe(true);
    expect(matchesShortcut('focus-graph', key('G'))).toBe(true);
    expect(matchesShortcut('focus-graph', key('G', { shiftKey: true }))).toBe(false);
    expect(matchesShortcut('focus-graph', key('m'))).toBe(false);
  });

  it('lets layout-dependent keys through whatever Shift is doing', () => {
    expect(matchesShortcut('help', key('?', { shiftKey: true }))).toBe(true);
    expect(matchesShortcut('help', key('?'))).toBe(true);
    expect(matchesShortcut('focus-search', key('/', { shiftKey: true }))).toBe(true);
  });

  it('requires Ctrl or Cmd for the brief save and nothing else', () => {
    expect(matchesShortcut('brief-save', key('s'))).toBe(false);
    expect(matchesShortcut('brief-save', key('s', { ctrlKey: true }))).toBe(true);
    expect(matchesShortcut('brief-save', key('S', { metaKey: true }))).toBe(true);
    expect(matchesShortcut('brief-save', key('s', { ctrlKey: true, shiftKey: true }))).toBe(false);
  });

  it('ignores auto-repeat except for list navigation, and ignores IME composition', () => {
    expect(matchesShortcut('toggle-replay', key(' ', { repeat: true }))).toBe(false);
    expect(matchesShortcut('help', key('?', { repeat: true }))).toBe(false);
    expect(matchesShortcut('search-next', key('ArrowDown', { repeat: true }))).toBe(true);
    expect(matchesShortcut('analyst-send', key('Enter', { isComposing: true }))).toBe(false);
    expect(matchesShortcut('analyst-send', key('Enter', { shiftKey: true }))).toBe(false);
    expect(matchesShortcut('analyst-send', key('Enter'))).toBe(true);
  });
});

describe('isTypingTarget', () => {
  it('is true for text inputs, textareas, selects and contenteditable', () => {
    expect(isTypingTarget(el('INPUT'))).toBe(true);
    for (const type of ['text', 'search', 'email', 'password', 'number', 'datetime-local', 'url', 'tel']) expect(isTypingTarget(el('INPUT', { type }))).toBe(true);
    expect(isTypingTarget(el('input', { type: 'SEARCH' }))).toBe(true);
    expect(isTypingTarget(el('TEXTAREA'))).toBe(true);
    expect(isTypingTarget(el('SELECT'))).toBe(true);
    expect(isTypingTarget(el('DIV', { isContentEditable: true }))).toBe(true);
    expect(isTypingTarget(el('DIV', { attrs: { contenteditable: '' } }))).toBe(true);
    expect(isTypingTarget(el('DIV', { attrs: { contenteditable: 'plaintext-only' } }))).toBe(true);
    expect(isTypingTarget(el('DIV', { attrs: { role: 'textbox' } }))).toBe(true);
    expect(isTypingTarget(el('DIV', { attrs: { role: 'combobox' } }))).toBe(true);
  });

  it('is false for inputs that take no text, for other elements, and for non-elements', () => {
    for (const type of ['checkbox', 'radio', 'range', 'button', 'submit', 'file']) expect(isTypingTarget(el('INPUT', { type }))).toBe(false);
    expect(isTypingTarget(el('BUTTON'))).toBe(false);
    expect(isTypingTarget(BODY)).toBe(false);
    expect(isTypingTarget(el('DIV', { attrs: { contenteditable: 'false' } }))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget(undefined)).toBe(false);
    expect(isTypingTarget({})).toBe(false); // window / document as event target
  });
});

describe('isSpaceActivatable', () => {
  it('is true wherever Space already clicks, toggles, opens or types', () => {
    for (const t of [el('BUTTON'), el('A'), el('SUMMARY'), el('SELECT'), el('TEXTAREA'), el('INPUT'), el('INPUT', { type: 'checkbox' }), el('INPUT', { type: 'radio' }),
      el('MARK', { attrs: { role: 'button' } }), el('DIV', { attrs: { role: 'tab' } }), el('DIV', { attrs: { role: 'option' } })]) {
      expect(isSpaceActivatable(t)).toBe(true);
    }
  });

  it('is false on the page body, plain containers and range sliders (the timeline scrubber)', () => {
    expect(isSpaceActivatable(BODY)).toBe(false);
    expect(isSpaceActivatable(el('DIV', { attrs: { role: 'dialog' } }))).toBe(false);
    expect(isSpaceActivatable(el('INPUT', { type: 'range' }))).toBe(false);
    expect(isSpaceActivatable(null)).toBe(false);
  });
});

describe('shouldFire / findShortcut', () => {
  it('single-key shortcuts stand down in a text field; Escape does not', () => {
    const search = el('INPUT', { type: 'search' });
    for (const id of ['help', 'focus-search', 'open-analyst', 'focus-graph', 'focus-map', 'toggle-replay'] as const) {
      const s = getShortcut(id);
      expect(shouldFire(s, key(s.keys[0]), search)).toBe(false);
      expect(shouldFire(s, key(s.keys[0]), el('TEXTAREA'))).toBe(false);
      expect(shouldFire(s, key(s.keys[0]), BODY)).toBe(true);
    }
    expect(shouldFire(getShortcut('escape'), key('Escape'), search)).toBe(true);
  });

  it('Space does not fire on a focused button or checkbox, but does on the scrubber', () => {
    const space = getShortcut('toggle-replay');
    expect(shouldFire(space, key(' '), el('BUTTON'))).toBe(false);
    expect(shouldFire(space, key(' '), el('INPUT', { type: 'checkbox' }))).toBe(false);
    expect(shouldFire(space, key(' '), el('INPUT', { type: 'range' }))).toBe(true);
    // Letters are free on a button: pressing G with a toolbar button focused still focuses the chart.
    expect(shouldFire(getShortcut('focus-graph'), key('g'), el('BUTTON'))).toBe(true);
  });

  it('only looks in the scopes it is given', () => {
    expect(findShortcut(key('g'), BODY, ['global'])).toBeNull();
    expect(findShortcut(key('g'), BODY, ['global', 'workspace'])?.id).toBe('focus-graph');
    expect(findShortcut(key('?', { shiftKey: true }), BODY, ['global'])?.id).toBe('help');
    expect(findShortcut(key('?', { shiftKey: true }), el('INPUT', { type: 'search' }), ['global', 'workspace'])).toBeNull();
    expect(findShortcut(key('x'), BODY, ['global', 'workspace'])).toBeNull();
  });
});

describe('Escape layers', () => {
  it('topEscapeLayer prefers priority, then recency', () => {
    const noop = () => {};
    expect(topEscapeLayer([])).toBeNull();
    const layers = [
      { seq: 1, priority: ESCAPE_PRIORITY.menu, close: noop },
      { seq: 2, priority: ESCAPE_PRIORITY.reader, close: noop },
      { seq: 3, priority: ESCAPE_PRIORITY.menu, close: noop },
    ];
    expect(topEscapeLayer(layers)?.seq).toBe(3);
    expect(topEscapeLayer([...layers, { seq: 0, priority: ESCAPE_PRIORITY.help, close: noop }])?.seq).toBe(0);
  });

  it('closes one layer per call: help, then the menu, then the reader', () => {
    const closed: string[] = [];
    const pops: Record<string, () => void> = {};
    const open = (name: string, priority: number) => { pops[name] = pushEscapeLayer(priority, () => { closed.push(name); pops[name](); }); };
    expect(closeTopEscapeLayer()).toBe(false);
    open('reader', ESCAPE_PRIORITY.reader);
    open('help', ESCAPE_PRIORITY.help);
    open('menu', ESCAPE_PRIORITY.menu);
    expect(openEscapeLayerCount()).toBe(3);
    expect(closeTopEscapeLayer()).toBe(true);
    expect(closed).toEqual(['help']);
    expect(closeTopEscapeLayer()).toBe(true);
    expect(closeTopEscapeLayer()).toBe(true);
    expect(closed).toEqual(['help', 'menu', 'reader']);
    expect(closeTopEscapeLayer()).toBe(false);
    expect(openEscapeLayerCount()).toBe(0);
  });

  it('unregistering twice is harmless', () => {
    const pop = pushEscapeLayer(1, () => {});
    pop(); pop();
    expect(openEscapeLayerCount()).toBe(0);
  });
});
