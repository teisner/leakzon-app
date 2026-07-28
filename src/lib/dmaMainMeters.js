// Works out what each DMA's main meter is, and where that same meter also acts
// as a sub-meter of a neighbouring DMA.
//
// A boundary meter commonly does both: it measures everything entering DMA A
// (its main), while the water it passes is billed as consumption of DMA B — so
// B carries it as a sub-meter. In the network that is a real connection between
// the two areas, and the flow diagram should say so rather than leaving the
// reader to work it out from the meter table.

// The DMA a meter supplies, if any. dma.main_meter_id has no unique constraint,
// so one meter can be the main for several DMAs.
export function mainMeterFor(dma, meters) {
  if (!dma?.main_meter_id) return null;
  return (meters || []).find((m) => m.id === dma.main_meter_id) || null;
}

// Meters that this DMA meters as consumers while being another DMA's main.
export function incomingSubMeters(dma, meters, dmas) {
  if (!dma) return [];
  return (meters || [])
    .filter((m) => m.sub_meter_dma_id === dma.id && m.is_main)
    .map((m) => ({
      meter: m,
      // Which DMAs this meter supplies — the areas on the other side of it.
      suppliesDmas: (dmas || []).filter((d) => d.main_meter_id === m.id),
    }))
    .filter((x) => x.suppliesDmas.length > 0);
}

// Everything a DMA block needs to describe its meter roles in one call.
export function dmaMeterRoles(dma, meters, dmas) {
  const main = mainMeterFor(dma, meters);
  return {
    // The meter measuring water into this DMA.
    main,
    // Where that meter is itself metered as a consumer, if anywhere.
    mainAlsoSubIn: main?.sub_meter_dma_id
      ? (dmas || []).find((d) => d.id === main.sub_meter_dma_id) || null
      : null,
    // Meters this DMA bills that are another DMA's main.
    incoming: incomingSubMeters(dma, meters, dmas),
  };
}

// DMAs that should be placed alongside `dma` because a single meter ties them
// together, plus the direction of flow between them. Used when a DMA is dragged
// onto the canvas so the pair arrives connected instead of needing to be
// rediscovered by hand.
//
// Direction: the DMA that *bills* the meter sits upstream of the DMA the meter
// *supplies* — water passes through it on the way.
export function linkedDmaPairs(dma, meters, dmas) {
  const pairs = [];
  const seen = new Set();
  const add = (from, to, meter) => {
    if (!from || !to || from.id === to.id) return;
    const key = `${from.id}->${to.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push({ from, to, meter });
  };

  const { main, mainAlsoSubIn, incoming } = dmaMeterRoles(dma, meters, dmas);
  // This DMA's main is billed by a neighbour: neighbour feeds this DMA.
  if (main && mainAlsoSubIn) add(mainAlsoSubIn, dma, main);
  // This DMA bills a meter that supplies others: this DMA feeds them.
  for (const { meter, suppliesDmas } of incoming) {
    for (const target of suppliesDmas) add(dma, target, meter);
  }
  return pairs;
}
