// The Deal Room (docs/V2_DESIGN.md section 6). PLACEHOLDER: plays every deal as Quick (no minigames) until the real Deal Room replaces this file.
// spec: { kind: 'sell', assetId, leadId } | { kind: 'buy', zone, lotId } | { kind: 'repair', assetId }
export function openDeal(ctx, spec) {
  const g = ctx.g();
  const r = spec.kind === 'sell' ? g.pitch(spec.assetId, spec.leadId) : spec.kind === 'buy' ? g.buyLot(spec.zone, spec.lotId) : g.repair(spec.assetId);
  ctx.say(r);
  ctx.render();
  return r;
}
