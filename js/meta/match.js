// Event matching shared by quests, achievements, Academy steps and Codex unlocks (docs/V2_DESIGN.md section 12).
// A `match` is a shallow subset test against an event payload; a value is a literal or { gte|lte|gt|lt|eq|in }.
export function matchEvent(match, evt) {
  if (!evt) return false;
  if (!match) return true;
  for (const [k, want] of Object.entries(match)) {
    const have = evt[k];
    if (want !== null && typeof want === 'object' && !Array.isArray(want)) {
      for (const [op, v] of Object.entries(want)) {
        const num = typeof have === 'number' && Number.isFinite(have);
        const ok = op === 'gte' ? num && have >= v : op === 'lte' ? num && have <= v : op === 'gt' ? num && have > v : op === 'lt' ? num && have < v
          : op === 'eq' ? have === v : op === 'in' ? Array.isArray(v) && v.includes(have) : false;
        if (!ok) return false;
      }
    } else if (have !== want) return false;
  }
  return true;
}
/** Does `evt` count toward `goal = { event, match?, count, sum? }`, and by how much? (0 when it does not) */
export function goalDelta(goal, evt) {
  if (!goal || !evt || evt.type !== goal.event || !matchEvent(goal.match, evt)) return 0;
  if (goal.sum) { const v = evt[goal.sum]; return typeof v === 'number' && Number.isFinite(v) ? v : 0; }
  return 1;
}
export const goalDone = (goal, progress) => progress >= goal.count;
