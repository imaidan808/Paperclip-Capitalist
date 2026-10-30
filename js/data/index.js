// The one place the engine reads game content from: sixteen districts, the asset classes and the buyers, authored in four tiers of four districts.
import * as t1 from './tier1.js';
import * as t2 from './tier2.js';
import * as t3 from './tier3.js';
import * as t4 from './tier4.js';

const merge = (k) => Object.assign({}, t1[k], t2[k], t3[k], t4[k]);
export const ZONES = merge('zones'), ASSETS = merge('assets'), BUYERS = merge('buyers');
export const ZONE_IDS = Object.keys(ZONES).map(Number).sort((a, b) => a - b);
export const ZONE_COUNT = ZONE_IDS.length;
