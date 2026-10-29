// The two facts about taking a room back that the title screen and the instructor dashboard both say. They live here, not in js/ui/instructor.js, so the title screen does not have to load the dashboard (and
// everything it imports) to print a sentence: js/ui/instructor.js re-exports both, and the tests keep importing them from there.

/** How long a room taken back waits to hear the class's clock before it starts paused (js/session.js `RECOVER_WAIT_MS`, 15 000 ms; tests/finish-repair.test.mjs holds the two together). */
export const RECOVER_WAIT_SECONDS = 15;
/** The one sentence the dashboard and the title screen both say about that wait. */
export const FOLLOW_NOTE = `Students follow your new Founder ID once the old one has been silent for about a minute, not at once. Wait that long before you change the pace, deploy a shock or rewind, because until then they ignore it.`;
