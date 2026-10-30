// Whose keyspace a tab plays in. No DOM and no globals: the storages are handed in, so a Node test can open any number of tabs of one browser (docs/ARCHITECTURE.md, "A tab is a founder").
//
// The browser keeps a run in localStorage as `pc.<name>.<slot>`. The slot was one per page address: `main`, or the one `?slot=name` named. So every tab of a browser was the same founder: one Founder ID, one saved
// run, one remembered alias. A classroom between tabs of one browser (BroadcastChannel) could not work that way: a student tab had the instructor's ID, so the instructor took the student's messages for its own,
// and two student tabs wrote over each other's save.
//
// What changes, and only for a student who joins a LOCAL room (no relay) from a tab that has no slot named in its address:
//   * the tab becomes a founder of its own. Its founder's names (`isFounderName`: the Founder ID, the relay key, the alias, the saved run, its daily checkpoints, the debrief notes) move to a slot made for the tab (`t-xxxxxx`),
//     and the tab remembers the slot in its own sessionStorage, so a refresh of that tab is the same founder and a new tab is a new one;
//   * everything else (settings, the Academy's progress, the Codex, the relay address, an instructor's room and recovery code) stays the browser's, in `main`, as it always was.
// Nothing else moves. A page opened with `?slot=name` keeps everything in that slot, exactly as before; a solo player's `main` is never read or written by a tab slot; a relay room keeps the browser's ID, because the
// relay binds an ID to its browser's key and a student who comes back in a new tab must still be that student.
//
// A tab that is copied (Duplicate tab) is given the same sessionStorage. Each tab keeps a claim on its slot fresh while it is open (`touch`), and one that finds its slot claimed by a tab that is alive is a copy: it lets
// the slot go and is, like any new tab, no founder yet. Slots of tabs closed for a month (or beyond the newest KEEP_MAX) are swept when a new one is made, with everything in them.

export const MAIN = 'main';
export const TAB_RECORD = 'pc.tab';              // in a tab's sessionStorage: the slot of the founder that plays in it
export const CLAIM_MS = 6000;                    // a claim touched this recently belongs to a tab that is open
export const TOUCH_MS = 2000;                    // ...and an open tab touches it this often
export const KEEP_MS = 30 * 24 * 3600 * 1000;    // the slot of a tab not seen for this long is swept...
export const KEEP_MAX = 40;                      // ...and so are the oldest slots beyond this many

const ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789';
const SLOT = /^t-[a-z0-9]{6,12}$/;
const CLAIM_KEY = /^pc\.claim\.(t-[a-z0-9]{6,12})$/;
const claimKey = (slot) => `pc.claim.${slot}`;
/** A slot this module made (a tab's own), as against the browser's `main` and a name a person typed in `?slot=`. */
export const isTabSlot = (s) => typeof s === 'string' && SLOT.test(s);
/** The names that belong to the founder who plays in a tab, as against the browser: who they are and what they are playing. */
export const isFounderName = (n) => n === 'pid' || n === 'key' || n === 'handle' || n === 'save' || n === 'ckdays' || n === 'reflection' || (typeof n === 'string' && /^ck\.\d{1,4}$/.test(n));

const safe = (fn, dflt = null) => { try { return fn(); } catch { return dflt; } };
/** A storage, or a function that gives it (the page's own is looked up each time, as a test or a private window may swap it), or null. */
const store = (s) => safe(() => (typeof s === 'function' ? s() : s)) || null;
const readClaim = (l, slot) => {
  const c = safe(() => JSON.parse(l.getItem(claimKey(slot))));
  return c && typeof c === 'object' && typeof c.id === 'string' && Number.isFinite(c.at) ? c : null;
};
const isLive = (c, now) => !!c && c.gone !== true && now - c.at < CLAIM_MS;
const newInstance = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/**
 * The tab's place among the browser's keyspaces, decided once, as the page opens.
 *   base      the browser's slot: `main`, or the one the address names
 *   own       the slot the founder's names live in: `base`, or this tab's own slot once it has taken one
 *   explicit  the address names a slot (`?slot=name`): the person chose, nothing here changes it
 * `now` is a function (a test's clock); `instance` tells this page from every other page of the same browser, and from the same tab before it was refreshed.
 */
export function openTab({ search = '', local = null, session = null, now = Date.now, instance = newInstance(), rand = Math.random } = {}) {
  const named = safe(() => new URLSearchParams(search).get('slot'), '') || '';
  const t = { base: named || MAIN, own: named || MAIN, explicit: !!named, instance, touched: -Infinity };
  const claim = (gone = false) => { const l = store(local); if (!l || t.own === t.base) return; const at = now(); t.touched = gone ? -Infinity : at; safe(() => l.setItem(claimKey(t.own), JSON.stringify({ id: instance, at, ...(gone ? { gone: true } : {}) }))); };

  /** The name of the keyspace a name is kept in. */
  t.slotOf = (name) => (isFounderName(name) ? t.own : t.base);
  /** This tab is a founder of its own. */
  t.isOwn = () => t.own !== t.base;
  /** A tab that has not taken a slot of its own and may: no `?slot=` in its address. */
  t.canTake = () => !t.explicit && t.own === t.base;
  /** Becomes a founder of its own: a new slot, remembered in this tab's sessionStorage (in memory only where that cannot be written). False when the tab is one already, or the address named a slot. */
  t.take = () => {
    if (!t.canTake()) return false;
    const l = store(local), s = store(session);
    let slot = '';
    for (let i = 0; i < 12 && !slot; i++) {
      const c = 't-' + Array.from({ length: 8 }, () => ALPHA[Math.floor(rand() * ALPHA.length)]).join('');
      if (!l || (safe(() => l.getItem(claimKey(c))) == null && safe(() => l.getItem(`pc.pid.${c}`)) == null)) slot = c;
    }
    if (!slot) return false;
    t.own = slot;
    if (s) safe(() => s.setItem(TAB_RECORD, slot));
    claim();
    sweepTabs(local, slot, now());
    return true;
  };
  /** Keeps this tab's claim fresh (called from the page's heartbeat; writes at most every TOUCH_MS, and not at all for a tab that is not a founder of its own). */
  t.touch = () => { if (t.own !== t.base && now() - t.touched >= TOUCH_MS) claim(); };
  /** The page is going away (a refresh, a close): the claim is let go, so the next page of this tab is not taken for a copy. */
  t.release = () => claim(true);

  if (!named) {
    const s = store(session), l = store(local), rec = s ? safe(() => s.getItem(TAB_RECORD)) : null;
    if (isTabSlot(rec)) {
      const c = l ? readClaim(l, rec) : null;
      if (c && c.id !== instance && isLive(c, now())) safe(() => s.removeItem(TAB_RECORD)); // a copy of a tab that is still open (the same sessionStorage): that founder is already playing there
      else { t.own = rec; claim(); }
    }
  }
  return t;
}

/** Every key of a slot, with its claim. */
function dropSlot(l, slot) {
  const keys = [], n = safe(() => l.length, 0);
  for (let i = 0; i < n; i++) { const k = safe(() => l.key(i)); if (typeof k === 'string' && k.startsWith('pc.') && k.endsWith('.' + slot)) keys.push(k); }
  for (const k of keys) safe(() => l.removeItem(k));
}
/**
 * Sweeps the slots of tabs that are gone: those not seen for `maxAge`, and those past the newest `max`. Never `keep` (the tab asking) and never a slot whose tab is alive. Where the storage cannot be listed (a stand-in with
 * no `key()`) nothing is swept. Returns the slots it removed.
 */
export function sweepTabs(local, keep, now = Date.now(), { maxAge = KEEP_MS, max = KEEP_MAX } = {}) {
  const l = store(local), n = l ? safe(() => l.length, NaN) : NaN;
  if (!l || typeof l.key !== 'function' || !Number.isInteger(n)) return [];
  const found = [];
  for (let i = 0; i < n; i++) {
    const m = CLAIM_KEY.exec(safe(() => l.key(i), '') || '');
    if (!m) continue;
    const c = readClaim(l, m[1]);
    found.push({ slot: m[1], at: c ? c.at : 0, live: isLive(c, now) });
  }
  found.sort((a, b) => b.at - a.at);
  const gone = found.filter((f, i) => f.slot !== keep && !f.live && (now - f.at > maxAge || i >= max)).map((f) => f.slot);
  for (const slot of gone) dropSlot(l, slot);
  return gone;
}

/**
 * The storage the session reads and writes, named `pc.<name>.<slot>` by the tab's keyspaces. `local` is the storage or a function that gives it; any fault in it (a private window, a full disk) is a miss or a false, never a throw.
 * Until a tab takes a slot of its own, every name is in `base` and the keys are the ones the game has always written.
 */
export function makeKv(tab, local) {
  const K = (n) => `pc.${n}.${tab.slotOf(n)}`;
  return {
    tab,
    get(n) { try { return JSON.parse(store(local).getItem(K(n))); } catch { return null; } },
    set(n, v) { try { store(local).setItem(K(n), JSON.stringify(v)); return true; } catch { return false; } },
    del(n) { try { store(local).removeItem(K(n)); } catch { /* noop */ } },
    /** Text stored as it is (a checkpoint is already JSON: encoding it again would escape every quote). */
    getRaw(n) { try { return store(local).getItem(K(n)); } catch { return null; } },
    setRaw(n, v) { try { store(local).setItem(K(n), v); return true; } catch { return false; } },
  };
}
