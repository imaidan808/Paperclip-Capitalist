// The seven drawers, in dock order (docs/V2_DESIGN.md section 8). Each file owns one drawer; shell.js merges their actions.
import stock from './stock.js';
import market from './market.js';
import crew from './crew.js';
import bank from './bank.js';
import travel from './travel.js';
import codex from './codex.js';
import quests from './quests.js';

export const DRAWERS = [stock, market, crew, bank, travel, codex, quests];
