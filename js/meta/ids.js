// The Codex ids every v2 piece of meta content may refer to (docs/V2_DESIGN.md section 12). codex.js must define all of REQUIRED_CODEX;
// academy.js and quests.js may reference only these ids.
import { TEACHES } from '../data/schema.js';
export const CORE_CODEX = ['fair-market-value', 'asset-utility-score', 'creativity-multiplier', 'market-saturation', 'persona-fit', 'urgency-premium', 'margin', 'depreciation',
  'opportunity-cost', 'cash-flow-velocity', 'compounding', 'interest-and-compounding', 'debt-to-equity', 'margin-call', 'collateral', 'cac-vs-ltv', 'sla', 'audit-compliance', 'tariffs',
  'credit-crunch', 'demand-shock', 'diversification', 'hedging', 'anchoring', 'batna-zopa', 'adverse-selection', 'due-diligence', 'comparative-advantage', 'specialization',
  'economies-of-scale', 'network-effects', 'risk-of-ruin', 'expected-value', 'eei-score', 'reputation', 'exit-valuation'];
export const REQUIRED_CODEX = [...TEACHES, ...CORE_CODEX];
export const BACKGROUND_IDS = ['connected', 'grad', 'trades', 'immigrant', 'veteran', 'heir', 'creator', 'gigger', 'roots', 'native', 'second', 'pro'];
export const DOCK_IDS = ['stock', 'market', 'crew', 'bank', 'travel', 'codex', 'quests'];
export const EVENT_TYPES = ['pitch', 'buy', 'sell-pool', 'repair', 'ship', 'hire', 'upgrade', 'pipe-level', 'cycle', 'draw', 'repay', 'client', 'audit', 'zone', 'milestone', 'shock', 'p2p', 'skill',
  'level', 'inspect', 'haggle', 'auction', 'streak', 'day', 'margin-call', 'insolvent', 'exit', 'perk'];
