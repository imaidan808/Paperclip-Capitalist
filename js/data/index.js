// The one place the engine reads game content from: sixteen districts, the asset classes and the buyers.
// DEVELOPMENT BINDING: points at generated stand-in content until the four content tiers are merged (then this file imports tier1..4.js instead).
import dev from './devdata.js';
export const ZONES = dev.zones, ASSETS = dev.assets, BUYERS = dev.buyers;
export const ZONE_IDS = Object.keys(ZONES).map(Number).sort((a, b) => a - b);
export const ZONE_COUNT = ZONE_IDS.length;
