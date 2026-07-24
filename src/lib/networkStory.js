import { pointInPolygon } from "@/lib/polygonUtils";

const T = {
  en: {
    // Pluralization helpers
    plural: (n, singular, plural) => (n !== 1 ? plural : singular),
    // Overview
    overviewTitle: "Network Overview",
    overviewSummary: (dmas, links, meters) =>
      `${dmas} ${T.en.plural(dmas, "DMA", "DMAs")}, ${links} ${T.en.plural(links, "connection", "connections")}, ${meters} ${T.en.plural(meters, "meter", "meters")} total.`,
    sourceEntry: "Water enters the system at the Source node.",
    noSource: "⚠ No Source node — add one to define the water origin.",
    orphanCount: (n) => `${n} ${T.en.plural(n, "meter is", "meters are")} unassigned (orphans).`,
    // Flow
    flowTitle: "Water Flow Paths",
    // Detail
    detailTitle: "DMA Breakdown",
    detailLine: (name, subCount, mainPart, fedPart) =>
      `${name}: ${subCount} ${T.en.plural(subCount, "sub-meter", "sub-meters")}${mainPart}${fedPart}`,
    mainMeterLinked: (uid) => ` · main meter ${uid}`,
    noMainMeter: " · no main meter linked",
    fedBy: (names) => ` · fed by ${names.join(", ")}`,
    // Consumption
    consumptionTitle: "Consumption Calculation",
    consumptionNoMain: (name) => `${name}: no main meter — consumption cannot be calculated.`,
    consumptionNet: (name, uid, terms) => `${name} net = meter ${uid} − (${terms.join(" + ")})`,
    consumptionNetNoDown: (name, uid) => `${name} net = meter ${uid} (downstream DMAs have no main meters yet).`,
    consumptionSimple: (name, uid) => `${name} consumption = meter ${uid} reading`,
    // Warnings
    issuesTitle: "Issues to Review",
    meterOutside: (dmaName, uid) => `${dmaName}'s main meter (${uid}) is outside the DMA boundary — it should be inside ${dmaName}.`,
    isolatedTitle: "Isolated / Virtual DMAs",
    isolatedDesc: (name) => `${name} is isolated from all other DMAs — it is a fully virtual DMA with no connections to the network.`,
    // Narrative
    narOpening: (meters, dmas, links) =>
      `This network serves ${meters} ${T.en.plural(meters, "meter", "meters")} across ${dmas} ${T.en.plural(dmas, "DMA", "DMAs")}, connected by ${links} ${T.en.plural(links, "link", "links")}.`,
    narSource: " Water enters the system at the Source node, beginning its journey through the distribution network.",
    narNoSource: " However, no Source node has been defined yet — without it, the water's origin remains unknown.",
    narOrphan: (n) => ` ${n} ${T.en.plural(n, "meter remains", "meters remain")} unassigned, waiting to be placed into a DMA.`,
    narFlowSingle: (paths) => `From the Source, water travels along a single path: ${paths.join("; ")}.`,
    narFlowMulti: (count, paths) => `From the Source, water travels along ${count} paths: ${paths.join("; ")}.`,
    narDmaContains: (name, subCount) => `${name} contains ${subCount} ${T.en.plural(subCount, "sub-meter", "sub-meters")}`,
    narDmaMain: (uid) => ` and is monitored by main meter ${uid}`,
    narDmaNoMain: ` but has no main meter linked yet`,
    narFedBy: (names) => `. It receives water from ${names.join(", ")}`,
    narFeedsInto: (names) => `, and feeds into ${names.join(", ")}`,
    narConsumptionCalc: (name, terms, uid) => `To find ${name}'s own consumption, subtract ${terms.join(" + ")} from meter ${uid}'s reading.`,
    narMeterOutside: (dmaName, uid) => `${dmaName}'s main meter (${uid}) sits outside its own boundary — it should be relocated inside ${dmaName}.`,
    narDisconnected: (names, isSingle) => `${names.join(", ")} ${isSingle ? "is" : "are"} isolated from all other DMAs — ${isSingle ? "a fully virtual DMA" : "fully virtual DMAs"} with no connections to the rest of the network.`,
    narNoData: "No network data yet.",
  },
  he: {
    plural: (n, singular, plural) => (n !== 1 ? plural : singular),
    overviewTitle: "סקירת הרשת",
    overviewSummary: (dmas, links, meters) =>
      `${dmas} ${T.he.plural(dmas, "מתחם", "מתחמים")}, ${links} ${T.he.plural(links, "חיבור", "חיבורים")}, ${meters} ${T.he.plural(meters, "מונה", "מונים")} סה"כ.`,
    sourceEntry: "המים נכנסים למערכת בנקודת המקור.",
    noSource: "⚠ אין נקודת מקור — הוסף אחת כדי להגדיר את מקור המים.",
    orphanCount: (n) => `${n} ${T.he.plural(n, "מונה לא", "מונים לא")} משויכים (יתומים).`,
    flowTitle: "נתיבי זרימת המים",
    detailTitle: "פירוט מתחמים",
    detailLine: (name, subCount, mainPart, fedPart) =>
      `${name}: ${subCount} ${T.he.plural(subCount, "מונה משנה", "מוני משנה")}${mainPart}${fedPart}`,
    mainMeterLinked: (uid) => ` · מונה ראשי ${uid}`,
    noMainMeter: " · אין מונה ראשי מקושר",
    fedBy: (names) => ` · מוזן על ידי ${names.join(", ")}`,
    consumptionTitle: "חישוב צריכה",
    consumptionNoMain: (name) => `${name}: אין מונה ראשי — לא ניתן לחשב צריכה.`,
    consumptionNet: (name, uid, terms) => `${name} נטו = מונה ${uid} − (${terms.join(" + ")})`,
    consumptionNetNoDown: (name, uid) => `${name} נטו = מונה ${uid} (למתחמים במורד אין עדיין מונים ראשיים).`,
    consumptionSimple: (name, uid) => `צריכת ${name} = קריאת מונה ${uid}`,
    issuesTitle: "נושאים לבדיקה",
    meterOutside: (dmaName, uid) => `המונה הראשי של ${dmaName} (${uid}) נמצא מחוץ לגבול המתחם — הוא צריך להיות בתוך ${dmaName}.`,
    isolatedTitle: "מתחמים מבודדים / וירטואליים",
    isolatedDesc: (name) => `${name} מבודד מכל שאר המתחמים — זהו מתחם וירטואלי לחלוטין ללא חיבורים לרשת.`,
    narOpening: (meters, dmas, links) =>
      `רשת זו משרתת ${meters} ${T.he.plural(meters, "מונה", "מונים")} ב-${dmas} ${T.he.plural(dmas, "מתחם", "מתחמים")}, מחוברים ב-${links} ${T.he.plural(links, "קישור", "קישורים")}.`,
    narSource: " המים נכנסים למערכת בנקודת המקור, ומתחילים את מסעם ברשת ההפצה.",
    narNoSource: " עם זאת, לא הוגדרה נקודת מקור — בלעדיה, מקור המים נותר לא ידוע.",
    narOrphan: (n) => ` ${n} ${T.he.plural(n, "מונה נותר", "מונים נותרו")} לא משויכים, וממתינים לשיוך למתחם.`,
    narFlowSingle: (paths) => `מנקודת המקור, המים זורמים בנתיב אחד: ${paths.join("; ")}.`,
    narFlowMulti: (count, paths) => `מנקודת המקור, המים זורמים ב-${count} נתיבים: ${paths.join("; ")}.`,
    narDmaContains: (name, subCount) => `${name} מכיל ${subCount} ${T.he.plural(subCount, "מונה משנה", "מוני משנה")}`,
    narDmaMain: (uid) => ` ומנוטר על ידי מונה ראשי ${uid}`,
    narDmaNoMain: ` אך עדיין אין לו מונה ראשי מקושר`,
    narFedBy: (names) => `. הוא מקבל מים מ-${names.join(", ")}`,
    narFeedsInto: (names) => `, ומזרים אל ${names.join(", ")}`,
    narConsumptionCalc: (name, terms, uid) => `כדי למצוא את הצריכה העצמית של ${name}, יש להחסיר ${terms.join(" + ")} מקריאת מונה ${uid}.`,
    narMeterOutside: (dmaName, uid) => `המונה הראשי של ${dmaName} (${uid}) נמצא מחוץ לגבול שלו — יש להעבירו אל תוך ${dmaName}.`,
    narDisconnected: (names, isSingle) => `${names.join(", ")} ${isSingle ? "מבודד" : "מבודדים"} מכל שאר המתחמים — ${isSingle ? "מתחם וירטואלי לחלוטין" : "מתחמים וירטואליים לחלוטין"} ללא חיבורים לרשת.`,
    narNoData: "אין נתוני רשת עדיין.",
  },
};

function getT(lang) {
  return T[lang] || T.en;
}

// Build a structured narrative of the network design.
// Returns an array of { icon, title, lines[] } sections.
export function buildNetworkStory(nodes, links, dmas, meters, meterCounts, lang = "en") {
  if (!nodes || nodes.length === 0) return [];

  const L = getT(lang);
  const sourceNode = nodes.find((n) => n.node_type === "source");
  const orphansNode = nodes.find((n) => n.node_type === "orphans");
  const dmaNodes = nodes.filter((n) => n.node_type === "dma");

  // Adjacency lists
  const downstream = {};
  const upstream = {};
  nodes.forEach((n) => { downstream[n.id] = []; upstream[n.id] = []; });
  links.forEach((l) => {
    if (downstream[l.from_node_id]) downstream[l.from_node_id].push(l.to_node_id);
    if (upstream[l.to_node_id]) upstream[l.to_node_id].push(l.from_node_id);
  });

  const nodeName = (id) => nodes.find((n) => n.id === id)?.name || "—";
  const dmaOf = (nodeId) => {
    const node = nodes.find((n) => n.id === nodeId);
    return node?.dma_id ? dmas.find((d) => d.id === node.dma_id) : null;
  };

  const sections = [];

  // --- Overview ---
  const totalMeters = meters.length;
  const orphanCount = orphansNode ? meterCounts[orphansNode.id] || 0 : 0;
  const overviewLines = [L.overviewSummary(dmaNodes.length, links.length, totalMeters)];
  if (sourceNode) overviewLines.push(L.sourceEntry);
  else overviewLines.push(L.noSource);
  if (orphanCount > 0) overviewLines.push(L.orphanCount(orphanCount));
  sections.push({ icon: "overview", title: L.overviewTitle, lines: overviewLines });

  // --- Flow paths (BFS from source, excluding orphans branch) ---
  if (sourceNode) {
    const flowLines = [];
    const visited = new Set();
    const queue = [{ id: sourceNode.id, path: [sourceNode.name] }];
    while (queue.length > 0) {
      const { id, path } = queue.shift();
      if (visited.has(id)) continue;
      visited.add(id);
      const next = (downstream[id] || []).filter((nid) => {
        const n = nodes.find((nn) => nn.id === nid);
        return n && n.node_type !== "orphans";
      });
      if (next.length === 0) {
        if (path.length > 1) flowLines.push(path.join(" → "));
      } else {
        for (const nextId of next) {
          queue.push({ id: nextId, path: [...path, nodeName(nextId)] });
        }
      }
    }
    if (flowLines.length > 0)
      sections.push({ icon: "flow", title: L.flowTitle, lines: flowLines });
  }

  // --- Per-DMA details + consumption + warnings ---
  const detailLines = [];
  const consumptionLines = [];
  const warningLines = [];
  const disconnected = [];

  dmaNodes.forEach((node) => {
    const dma = dmaOf(node.id);
    if (!dma) return;

    const subCount = dma.meter_count || 0;
    const mainMeter = dma.main_meter_id ? meters.find((m) => m.id === dma.main_meter_id) : null;
    const upNames = upstream[node.id].map(nodeName);
    const downstreamDmaNodes = (downstream[node.id] || [])
      .map((id) => nodes.find((n) => n.id === id))
      .filter((n) => n && n.node_type === "dma");

    // Detail
    const mainPart = mainMeter ? L.mainMeterLinked(mainMeter.uid) : L.noMainMeter;
    const fedPart = upNames.length > 0 ? L.fedBy(upNames) : "";
    detailLines.push(L.detailLine(dma.name, subCount, mainPart, fedPart));

    // Main meter placement check
    if (mainMeter && mainMeter.latitude != null && mainMeter.longitude != null && dma.polygon) {
      try {
        const poly = typeof dma.polygon === "string" ? JSON.parse(dma.polygon) : dma.polygon;
        if (Array.isArray(poly) && poly.length >= 3 && !pointInPolygon(mainMeter.latitude, mainMeter.longitude, poly)) {
          warningLines.push(L.meterOutside(dma.name, mainMeter.uid));
        }
      } catch {}
    }

    // Consumption
    if (!mainMeter) {
      consumptionLines.push(L.consumptionNoMain(dma.name));
    } else if (downstreamDmaNodes.length > 0) {
      const terms = downstreamDmaNodes.map((n) => {
        const d = dmas.find((dd) => dd.id === n.dma_id);
        const m = d?.main_meter_id ? meters.find((mm) => mm.id === d.main_meter_id) : null;
        return m ? `${d.name} ${L.mainMeterLinked(m.uid).replace(" · ", "")}` : null;
      }).filter(Boolean);
      if (terms.length > 0) {
        consumptionLines.push(L.consumptionNet(dma.name, mainMeter.uid, terms));
      } else {
        consumptionLines.push(L.consumptionNetNoDown(dma.name, mainMeter.uid));
      }
    } else {
      consumptionLines.push(L.consumptionSimple(dma.name, mainMeter.uid));
    }

    // Disconnected
    if (upstream[node.id].length === 0 && downstreamDmaNodes.length === 0) {
      disconnected.push(dma.name);
    }
  });

  if (detailLines.length > 0)
    sections.push({ icon: "detail", title: L.detailTitle, lines: detailLines });
  if (consumptionLines.length > 0)
    sections.push({ icon: "calc", title: L.consumptionTitle, lines: consumptionLines });
  if (warningLines.length > 0)
    sections.push({ icon: "warning", title: L.issuesTitle, lines: warningLines });
  if (disconnected.length > 0)
    sections.push({ icon: "warning", title: L.isolatedTitle, lines: disconnected.map((n) => L.isolatedDesc(n)) });

  return sections;
}

// Build a flowing prose narrative of the network design.
// Returns an array of paragraph strings.
export function buildNetworkNarrative(nodes, links, dmas, meters, meterCounts, lang = "en") {
  if (!nodes || nodes.length === 0) return [];

  const L = getT(lang);
  const sourceNode = nodes.find((n) => n.node_type === "source");
  const orphansNode = nodes.find((n) => n.node_type === "orphans");
  const dmaNodes = nodes.filter((n) => n.node_type === "dma");

  const downstream = {};
  const upstream = {};
  nodes.forEach((n) => { downstream[n.id] = []; upstream[n.id] = []; });
  links.forEach((l) => {
    if (downstream[l.from_node_id]) downstream[l.from_node_id].push(l.to_node_id);
    if (upstream[l.to_node_id]) upstream[l.to_node_id].push(l.from_node_id);
  });

  const nodeName = (id) => nodes.find((n) => n.id === id)?.name || "—";
  const dmaOf = (nodeId) => {
    const node = nodes.find((n) => n.id === nodeId);
    return node?.dma_id ? dmas.find((d) => d.id === node.dma_id) : null;
  };

  const paragraphs = [];
  const totalMeters = meters.length;
  const orphanCount = orphansNode ? meterCounts[orphansNode.id] || 0 : 0;

  // Opening paragraph
  let opening = L.narOpening(totalMeters, dmaNodes.length, links.length);
  if (sourceNode) opening += L.narSource;
  else opening += L.narNoSource;
  if (orphanCount > 0) opening += L.narOrphan(orphanCount);
  paragraphs.push(opening);

  // Flow narrative
  if (sourceNode && dmaNodes.length > 0) {
    const visited = new Set();
    const queue = [{ id: sourceNode.id, path: [sourceNode.name] }];
    const flowPaths = [];
    while (queue.length > 0) {
      const { id, path } = queue.shift();
      if (visited.has(id)) continue;
      visited.add(id);
      const next = (downstream[id] || []).filter((nid) => {
        const n = nodes.find((nn) => nn.id === nid);
        return n && n.node_type !== "orphans";
      });
      if (next.length === 0) {
        if (path.length > 1) flowPaths.push(path.join(" → "));
      } else {
        for (const nextId of next) {
          queue.push({ id: nextId, path: [...path, nodeName(nextId)] });
        }
      }
    }
    if (flowPaths.length > 0) {
      if (flowPaths.length === 1) {
        paragraphs.push(L.narFlowSingle(flowPaths));
      } else {
        paragraphs.push(L.narFlowMulti(flowPaths.length, flowPaths));
      }
    }
  }

  // Per-DMA narrative
  const dmaNarratives = [];
  const warnings = [];
  const disconnected = [];

  dmaNodes.forEach((node) => {
    const dma = dmaOf(node.id);
    if (!dma) return;

    const subCount = dma.meter_count || 0;
    const mainMeter = dma.main_meter_id ? meters.find((m) => m.id === dma.main_meter_id) : null;
    const upNames = upstream[node.id].map(nodeName);
    const downstreamDmaNodes = (downstream[node.id] || [])
      .map((id) => nodes.find((n) => n.id === id))
      .filter((n) => n && n.node_type === "dma");

    let story = L.narDmaContains(dma.name, subCount);
    if (mainMeter) story += L.narDmaMain(mainMeter.uid);
    else story += L.narDmaNoMain;
    if (upNames.length > 0) story += L.narFedBy(upNames);
    if (downstreamDmaNodes.length > 0) {
      const downNames = downstreamDmaNodes.map((n) => n.name);
      story += L.narFeedsInto(downNames);
    }
    story += ".";
    dmaNarratives.push(story);

    // Consumption explanation
    if (mainMeter && downstreamDmaNodes.length > 0) {
      const terms = downstreamDmaNodes.map((n) => {
        const d = dmas.find((dd) => dd.id === n.dma_id);
        const m = d?.main_meter_id ? meters.find((mm) => mm.id === d.main_meter_id) : null;
        return m ? `${d.name} ${m.uid}` : null;
      }).filter(Boolean);
      if (terms.length > 0) {
        dmaNarratives.push(L.narConsumptionCalc(dma.name, terms, mainMeter.uid));
      }
    }

    // Main meter placement
    if (mainMeter && mainMeter.latitude != null && mainMeter.longitude != null && dma.polygon) {
      try {
        const poly = typeof dma.polygon === "string" ? JSON.parse(dma.polygon) : dma.polygon;
        if (Array.isArray(poly) && poly.length >= 3 && !pointInPolygon(mainMeter.latitude, mainMeter.longitude, poly)) {
          warnings.push(L.narMeterOutside(dma.name, mainMeter.uid));
        }
      } catch {}
    }

    // Disconnected
    if (upstream[node.id].length === 0 && downstreamDmaNodes.length === 0) {
      disconnected.push(dma.name);
    }
  });

  if (dmaNarratives.length > 0) paragraphs.push(dmaNarratives.join(" "));
  if (warnings.length > 0) paragraphs.push(warnings.join(" "));
  if (disconnected.length > 0) {
    paragraphs.push(L.narDisconnected(disconnected, disconnected.length === 1));
  }

  return paragraphs;
}

export function getNetworkStoryNoDataText(lang = "en") {
  return getT(lang).narNoData;
}