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
/** Payload field names per event type (docs/V2_DESIGN.md 7.1). Every event also carries `type` and `day`. Goals, matches and sums in meta content may use only these. */
export const EVENT_PAYLOAD = {
  pitch: ['zone', 'cls', 'seg', 'outcome', 'gain', 'cm', 'S', 'fit', 'price', 'mult'], buy: ['zone', 'cls', 'price', 'fake', 'cond'], 'sell-pool': ['zone', 'total', 'count'],
  repair: ['cls', 'cost', 'quality', 'precision'], ship: ['from', 'to', 'count'], hire: ['kind', 'zone'], upgrade: ['id'], 'pipe-level': ['id', 'level'], cycle: ['zone', 'net'],
  draw: ['prod', 'amount'], repay: ['amount'], client: ['tier'], audit: ['choice', 'ok'], zone: ['id'], milestone: ['n'], shock: ['kind'], p2p: ['peer', 'variance'],
  skill: ['skill', 'level'], level: ['level'], inspect: ['score', 'fake', 'caught'], haggle: ['role', 'mult', 'score', 'deal'], auction: ['won', 'price', 'surplus'], streak: ['n'],
  day: ['day'], 'margin-call': [], insolvent: [], exit: ['kind'], perk: ['id', 'effect'],
};
