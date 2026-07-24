import React, { useState, useEffect, useRef, useMemo } from "react";
import { Droplets, Plus, Minus, Maximize2, X, Sparkles } from "lucide-react";
import { calculatePolygonAreaSqm } from "@/lib/polygonUtils";

const SOURCE_W = 200;
const SOURCE_H = 70;
const NODE_MIN_W = 130;
const NODE_MIN_H = 55;
const NODE_MAX_W = 300;
const NODE_MAX_H = 120;

const DIRS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

function parsePolygon(dma) {
  try {
    const poly = typeof dma.polygon === "string" ? JSON.parse(dma.polygon) : dma.polygon;
    return Array.isArray(poly) && poly.length >= 3 ? poly : null;
  } catch { return null; }
}

function getNodeSize(node, sizeMap) {
  if (node.node_type === "source" || node.node_type === "orphans") {
    return { w: SOURCE_W, h: SOURCE_H };
  }
  return sizeMap[node.dma_id] || { w: NODE_MIN_W, h: NODE_MIN_H };
}

function getConnectionPoints(from, to, sizeMap) {
  const fs = getNodeSize(from, sizeMap);
  const ts = getNodeSize(to, sizeMap);
  const fromCx = from.pos_x + fs.w / 2;
  const fromCy = from.pos_y + fs.h / 2;
  const toCx = to.pos_x + ts.w / 2;
  const toCy = to.pos_y + ts.h / 2;
  const dx = toCx - fromCx;
  const dy = toCy - fromCy;
  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx > 0) return { x1: from.pos_x + fs.w, y1: fromCy, d1: { x: 1, y: 0 }, x2: to.pos_x, y2: toCy, d2: { x: -1, y: 0 } };
    return { x1: from.pos_x, y1: fromCy, d1: { x: -1, y: 0 }, x2: to.pos_x + ts.w, y2: toCy, d2: { x: 1, y: 0 } };
  }
  if (dy > 0) return { x1: fromCx, y1: from.pos_y + fs.h, d1: { x: 0, y: 1 }, x2: toCx, y2: to.pos_y, d2: { x: 0, y: -1 } };
  return { x1: fromCx, y1: from.pos_y, d1: { x: 0, y: -1 }, x2: toCx, y2: to.pos_y + ts.h, d2: { x: 0, y: 1 } };
}

function getNearestPort(node, mx, my, sizeMap) {
  const s = getNodeSize(node, sizeMap);
  const cx = node.pos_x + s.w / 2;
  const cy = node.pos_y + s.h / 2;
  const ports = [
    { x: node.pos_x + s.w, y: cy, d: { x: 1, y: 0 } },
    { x: node.pos_x, y: cy, d: { x: -1, y: 0 } },
    { x: cx, y: node.pos_y, d: { x: 0, y: -1 } },
    { x: cx, y: node.pos_y + s.h, d: { x: 0, y: 1 } },
  ];
  return ports.reduce((best, p) => {
    const dist = (p.x - mx) ** 2 + (p.y - my) ** 2;
    return dist < best.dist ? { ...p, dist } : best;
  }, { ...ports[0], dist: Infinity });
}

function getPortPoint(node, dir, sizeMap) {
  const s = getNodeSize(node, sizeMap);
  if (dir.x === 1) return { x: node.pos_x + s.w, y: node.pos_y + s.h / 2 };
  if (dir.x === -1) return { x: node.pos_x, y: node.pos_y + s.h / 2 };
  if (dir.y === -1) return { x: node.pos_x + s.w / 2, y: node.pos_y };
  return { x: node.pos_x + s.w / 2, y: node.pos_y + s.h };
}

// Compute orthogonal waypoints, then iteratively repair any obstacle crossings
function getWaypoints(x1, y1, x2, y2, d1, d2, obstacles = []) {
  const extend = 24;
  const p1x = x1 + d1.x * extend;
  const p1y = y1 + d1.y * extend;
  const p2x = x2 + d2.x * extend;
  const p2y = y2 + d2.y * extend;
  const pts = [{ x: x1, y: y1 }, { x: p1x, y: p1y }];
  if (d1.x !== 0 && d2.x !== 0) {
    const midX = (p1x + p2x) / 2;
    pts.push({ x: midX, y: p1y }, { x: midX, y: p2y }, { x: p2x, y: p2y });
  } else if (d1.y !== 0 && d2.y !== 0) {
    const midY = (p1y + p2y) / 2;
    pts.push({ x: p1x, y: midY }, { x: p2x, y: midY }, { x: p2x, y: p2y });
  } else if (d1.x !== 0) {
    pts.push({ x: p2x, y: p1y }, { x: p2x, y: p2y });
  } else {
    pts.push({ x: p1x, y: p2y }, { x: p2x, y: p2y });
  }
  pts.push({ x: x2, y: y2 });
  return repairCrossings(pts, obstacles, 12);
}

function pathLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return len;
}

// Find the first obstacle that a segment crosses
function findCrossingObstacle(x1, y1, x2, y2, obstacles, pad) {
  for (const obs of obstacles) {
    if (segmentCrossesObstacle(x1, y1, x2, y2, [obs], pad)) return obs;
  }
  return null;
}

// Create detour waypoints to route around an obstacle
function createDetour(p1, p2, obs, pad) {
  const leftX = obs.x - pad;
  const rightX = obs.x + obs.w + pad;
  const topY = obs.y - pad;
  const bottomY = obs.y + obs.h + pad;
  const isHorizontal = p1.y === p2.y;
  if (isHorizontal) {
    const goAbove = Math.abs(topY - p1.y) <= Math.abs(bottomY - p1.y);
    const detourY = goAbove ? topY : bottomY;
    const p1Left = p1.x <= p2.x;
    const entryX = p1Left ? leftX : rightX;
    const exitX = p1Left ? rightX : leftX;
    return [
      { x: entryX, y: p1.y },
      { x: entryX, y: detourY },
      { x: exitX, y: detourY },
      { x: exitX, y: p2.y },
    ];
  }
  const goLeft = Math.abs(leftX - p1.x) <= Math.abs(rightX - p1.x);
  const detourX = goLeft ? leftX : rightX;
  const p1Above = p1.y <= p2.y;
  const entryY = p1Above ? topY : bottomY;
  const exitY = p1Above ? bottomY : topY;
  return [
    { x: p1.x, y: entryY },
    { x: detourX, y: entryY },
    { x: detourX, y: exitY },
    { x: p2.x, y: exitY },
  ];
}

// Iteratively check all segments and insert detours around any obstacles crossed
function repairCrossings(pts, obstacles, pad, maxIter = 8) {
  let waypoints = [...pts];
  for (let iter = 0; iter < maxIter; iter++) {
    let repaired = false;
    for (let i = 0; i < waypoints.length - 1; i++) {
      const p1 = waypoints[i];
      const p2 = waypoints[i + 1];
      if (p1.x === p2.x && p1.y === p2.y) continue;
      const obs = findCrossingObstacle(p1.x, p1.y, p2.x, p2.y, obstacles, pad);
      if (obs) {
        const detour = createDetour(p1, p2, obs, pad);
        waypoints = [...waypoints.slice(0, i + 1), ...detour, ...waypoints.slice(i + 1)];
        repaired = true;
        break;
      }
    }
    if (!repaired) break;
  }
  return mergeCollinear(waypoints);
}

// Remove duplicate and collinear waypoints for clean rendering
function mergeCollinear(pts) {
  if (pts.length <= 2) return pts;
  const deduped = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const prev = deduped[deduped.length - 1];
    if (pts[i].x !== prev.x || pts[i].y !== prev.y) deduped.push(pts[i]);
  }
  if (deduped.length <= 2) return deduped;
  const result = [deduped[0]];
  for (let i = 1; i < deduped.length - 1; i++) {
    const prev = result[result.length - 1];
    const curr = deduped[i];
    const next = deduped[i + 1];
    const isHoriz = prev.y === curr.y && curr.y === next.y;
    const isVert = prev.x === curr.x && curr.x === next.x;
    if (!isHoriz && !isVert) result.push(curr);
  }
  result.push(deduped[deduped.length - 1]);
  return result;
}

// Check if a horizontal or vertical segment crosses an obstacle bounding box
function segmentCrossesObstacle(x1, y1, x2, y2, obstacles, pad) {
  return obstacles.some(obs => {
    if (x1 === x2) {
      const minY = Math.min(y1, y2);
      const maxY = Math.max(y1, y2);
      return x1 > obs.x - pad && x1 < obs.x + obs.w + pad && maxY > obs.y - pad && minY < obs.y + obs.h + pad;
    }
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    return y1 > obs.y - pad && y1 < obs.y + obs.h + pad && maxX > obs.x - pad && minX < obs.x + obs.w + pad;
  });
}

// Find an X position for a vertical segment that avoids obstacles
function findClearX(baseX, y1, y2, obstacles, pad) {
  if (!segmentCrossesObstacle(baseX, y1, baseX, y2, obstacles, pad)) return baseX;
  const candidates = [];
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  for (const obs of obstacles) {
    if (maxY > obs.y - pad && minY < obs.y + obs.h + pad) {
      candidates.push(obs.x - pad);
      candidates.push(obs.x + obs.w + pad);
    }
  }
  let best = baseX;
  let bestDist = Infinity;
  for (const c of candidates) {
    if (!segmentCrossesObstacle(c, y1, c, y2, obstacles, pad)) {
      const dist = Math.abs(c - baseX);
      if (dist < bestDist) { best = c; bestDist = dist; }
    }
  }
  return best;
}

// Find a Y position for a horizontal segment that avoids obstacles
function findClearY(baseY, x1, x2, obstacles, pad) {
  if (!segmentCrossesObstacle(x1, baseY, x2, baseY, obstacles, pad)) return baseY;
  const candidates = [];
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  for (const obs of obstacles) {
    if (maxX > obs.x - pad && minX < obs.x + obs.w + pad) {
      candidates.push(obs.y - pad);
      candidates.push(obs.y + obs.h + pad);
    }
  }
  let best = baseY;
  let bestDist = Infinity;
  for (const c of candidates) {
    if (!segmentCrossesObstacle(x1, c, x2, c, obstacles, pad)) {
      const dist = Math.abs(c - baseY);
      if (dist < bestDist) { best = c; bestDist = dist; }
    }
  }
  return best;
}

// Orthogonal (manhattan) path with rounded corners.
// Straight segments + quadratic Bézier curves at each 90° turn.
// Routes around obstacle node bounding boxes when possible.
function getOrthogonalPath(x1, y1, x2, y2, d1, d2, obstacles = []) {
  const r = 12; // corner radius
  const pts = getWaypoints(x1, y1, x2, y2, d1, d2, obstacles);

  if (pts.length <= 2) {
    return `M ${pts[0].x} ${pts[0].y} L ${pts[1].x} ${pts[1].y}`;
  }

  // Convert polyline to path with rounded corners
  let path = `M ${pts[0].x} ${pts[0].y}`;

  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const next = pts[i + 1];

    const vx1 = prev.x - curr.x;
    const vy1 = prev.y - curr.y;
    const len1 = Math.hypot(vx1, vy1);
    const vx2 = next.x - curr.x;
    const vy2 = next.y - curr.y;
    const len2 = Math.hypot(vx2, vy2);

    if (len1 === 0 || len2 === 0) {
      path += ` L ${curr.x} ${curr.y}`;
      continue;
    }

    const radius = Math.min(r, len1 / 2, len2 / 2);
    const bx = curr.x + (vx1 / len1) * radius;
    const by = curr.y + (vy1 / len1) * radius;
    const ax = curr.x + (vx2 / len2) * radius;
    const ay = curr.y + (vy2 / len2) * radius;

    path += ` L ${bx} ${by}`;
    path += ` Q ${curr.x} ${curr.y} ${ax} ${ay}`;
  }

  const last = pts[pts.length - 1];
  path += ` L ${last.x} ${last.y}`;
  return path;
}

export default function FlowChartCanvas({ nodes, links, dmas, meterCounts, simulationData, optimizedPorts, onOptimize, onAddNode, onNodeDragEnd, onDeleteNode, onAddLink, onDeleteLink, onNodeClick, locked }) {
  const canvasRef = useRef(null);
  const dragDataRef = useRef(null);
  const dragPosRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragPos, setDragPos] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const connectRef = useRef(null);
  const [connectMouse, setConnectMouse] = useState(null);
  const [selected, setSelected] = useState(null);
  const [scale, setScale] = useState(1);
  const scaleRef = useRef(1);
  const [dragOver, setDragOver] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const panDataRef = useRef(null);

  useEffect(() => { scaleRef.current = scale; }, [scale]);

  const toContentCoords = (clientX, clientY) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = (clientX - rect.left + canvasRef.current.scrollLeft) / scaleRef.current;
    const y = (clientY - rect.top + canvasRef.current.scrollTop) / scaleRef.current;
    return { x, y };
  };

  const displayNodes = nodes.map((n) => {
    if (dragDataRef.current?.id === n.id && dragPos) {
      return { ...n, pos_x: dragPos.x, pos_y: dragPos.y };
    }
    return n;
  });

  const fitToView = () => {
    if (nodes.length === 0 || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const padding = 80;
    const minX = Math.min(...nodes.map((n) => n.pos_x));
    const minY = Math.min(...nodes.map((n) => n.pos_y));
    const maxX = Math.max(...nodes.map((n) => n.pos_x + nodeSize(n).w));
    const maxY = Math.max(...nodes.map((n) => n.pos_y + nodeSize(n).h));
    const bboxW = maxX - minX;
    const bboxH = maxY - minY;
    if (bboxW === 0 || bboxH === 0) { setScale(1); return; }
    const sx = (rect.width - padding * 2) / bboxW;
    const sy = (rect.height - padding * 2) / bboxH;
    const newScale = Math.max(0.2, Math.min(sx, sy, 2));
    setScale(newScale);
    const scrollX = minX * newScale - (rect.width - bboxW * newScale) / 2;
    const scrollY = minY * newScale - (rect.height - bboxH * newScale) / 2;
    requestAnimationFrame(() => {
      if (canvasRef.current) {
        canvasRef.current.scrollLeft = Math.max(0, scrollX);
        canvasRef.current.scrollTop = Math.max(0, scrollY);
      }
    });
  };

  useEffect(() => {
    if (nodes.length > 0) {
      const timer = setTimeout(() => fitToView(), 100);
      return () => clearTimeout(timer);
    }
  }, [nodes.length]);

  // --- Node dragging (with click detection) ---
  const handleNodeMouseDown = (e, node) => {
    if (e.target.dataset.port) return;
    e.preventDefault();
    e.stopPropagation();
    const { x, y } = toContentCoords(e.clientX, e.clientY);
    dragDataRef.current = { id: node.id, offsetX: x - node.pos_x, offsetY: y - node.pos_y, startX: node.pos_x, startY: node.pos_y, moved: false };
    dragPosRef.current = { x: node.pos_x, y: node.pos_y };
    setDragPos({ x: node.pos_x, y: node.pos_y });
    setIsDragging(true);
    setSelected({ type: "node", id: node.id });
  };

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e) => {
      if (!canvasRef.current) return;
      if (locked) return;
      const { x, y } = toContentCoords(e.clientX, e.clientY);
      const drag = dragDataRef.current;
      if (!drag) return;
      const pos = { x: Math.max(0, x - drag.offsetX), y: Math.max(0, y - drag.offsetY) };
      if (!drag.moved && (Math.abs(pos.x - drag.startX) > 3 || Math.abs(pos.y - drag.startY) > 3)) {
        drag.moved = true;
      }
      dragPosRef.current = pos;
      setDragPos(pos);
    };
    const handleMouseUp = () => {
      const drag = dragDataRef.current;
      const pos = dragPosRef.current;
      if (drag && pos) {
        if (!drag.moved) {
          const node = nodes.find((n) => n.id === drag.id);
          if (node) onNodeClick?.(node);
        } else {
          onNodeDragEnd(drag.id, pos.x, pos.y);
        }
      }
      dragDataRef.current = null;
      dragPosRef.current = null;
      setIsDragging(false);
      setDragPos(null);
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, onNodeDragEnd, onNodeClick, nodes, locked]);

  // --- Connection drawing ---
  const handlePortMouseDown = (e, nodeId) => {
    if (locked) return;
    e.preventDefault();
    e.stopPropagation();
    connectRef.current = { fromId: nodeId };
    const { x, y } = toContentCoords(e.clientX, e.clientY);
    setConnectMouse({ x, y });
    setIsConnecting(true);
  };

  useEffect(() => {
    if (!isConnecting) return;
    const handleMouseMove = (e) => {
      if (!canvasRef.current) return;
      const { x, y } = toContentCoords(e.clientX, e.clientY);
      setConnectMouse({ x, y });
    };
    const handleMouseUp = (e) => {
      const conn = connectRef.current;
      if (conn) {
        const targetEl = document.elementFromPoint(e.clientX, e.clientY);
        const nodeEl = targetEl?.closest("[data-node-id]");
        if (nodeEl) {
          const targetId = nodeEl.getAttribute("data-node-id");
          if (targetId !== conn.fromId) onAddLink(conn.fromId, targetId);
        }
      }
      connectRef.current = null;
      setIsConnecting(false);
      setConnectMouse(null);
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isConnecting, onAddLink]);

  // --- Canvas panning (drag empty space to scroll) ---
  useEffect(() => {
    if (!isPanning) return;
    const handleMouseMove = (e) => {
      if (!canvasRef.current || !panDataRef.current) return;
      const dx = e.clientX - panDataRef.current.startX;
      const dy = e.clientY - panDataRef.current.startY;
      canvasRef.current.scrollLeft = panDataRef.current.scrollLeft - dx;
      canvasRef.current.scrollTop = panDataRef.current.scrollTop - dy;
    };
    const handleMouseUp = () => {
      panDataRef.current = null;
      setIsPanning(false);
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isPanning]);

  const handleCanvasMouseDown = (e) => {
    setSelected(null);
    if (e.target.dataset.port || e.target.closest("[data-node-id]")) return;
    if (!canvasRef.current) return;
    panDataRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: canvasRef.current.scrollLeft,
      scrollTop: canvasRef.current.scrollTop,
    };
    setIsPanning(true);
  };

  // --- Keyboard: delete / escape ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "Escape") { setSelected(null); return; }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (!selected || locked) return;
        if (selected.type === "link") { onDeleteLink(selected.id); setSelected(null); }
        else if (selected.type === "node") {
          const node = nodes.find((n) => n.id === selected.id);
          if (node?.node_type === "source") return;
          onDeleteNode(selected.id); setSelected(null);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selected, nodes, onDeleteNode, onDeleteLink, locked]);

  const availableDmas = dmas.filter((d) => !nodes.some((n) => n.dma_id === d.id));

  // Compute node sizes proportional to real DMA area
  const sizeMap = useMemo(() => {
    const areas = {};
    const values = [];
    for (const dma of dmas || []) {
      const poly = parsePolygon(dma);
      const area = poly ? calculatePolygonAreaSqm(poly) : 0;
      areas[dma.id] = area;
      if (area > 0) values.push(area);
    }
    const minA = values.length > 0 ? Math.min(...values) : 0;
    const maxA = values.length > 0 ? Math.max(...values) : 0;
    const map = {};
    for (const dma of dmas || []) {
      const area = areas[dma.id];
      if (area <= 0 || maxA === 0) {
        map[dma.id] = { w: NODE_MIN_W, h: NODE_MIN_H };
      } else {
        // Normalize sqrt(area) between 0..1 and scale to min..max
        const ratio = (Math.sqrt(area) - Math.sqrt(minA)) / (Math.sqrt(maxA) - Math.sqrt(minA) || 1);
        const w = Math.round(NODE_MIN_W + ratio * (NODE_MAX_W - NODE_MIN_W));
        const h = Math.round(NODE_MIN_H + ratio * (NODE_MAX_H - NODE_MIN_H));
        map[dma.id] = { w, h };
      }
    }
    return map;
  }, [dmas]);

  const nodeSize = (node) => getNodeSize(node, sizeMap);

  const contentW = Math.max(1000, ...nodes.map((n) => n.pos_x + nodeSize(n).w + 100));
  const contentH = Math.max(600, ...nodes.map((n) => n.pos_y + nodeSize(n).h + 100));

  // Optimize: find the best port combination for each link to produce the shortest,
  // cleanest water line paths. Links sharing a source use the same exit port so
  // their initial segments overlay into a clean trunk.
  const handleOptimizePaths = () => {
    const optimized = {};
    const computeObstacles = (excludeIds) =>
      displayNodes
        .filter((n) => !excludeIds.includes(n.id))
        .map((n) => { const s = getNodeSize(n, sizeMap); return { x: n.pos_x, y: n.pos_y, w: s.w, h: s.h }; });

    const findBestD2 = (from, to, d1, obstacles) => {
      let best = null, bestScore = Infinity;
      for (const d2 of DIRS) {
        if (d1.x === d2.x && d1.y === d2.y) continue;
        const p1 = getPortPoint(from, d1, sizeMap);
        const p2 = getPortPoint(to, d2, sizeMap);
        if (p1.x === p2.x && p1.y === p2.y) continue;
        const pts = getWaypoints(p1.x, p1.y, p2.x, p2.y, d1, d2, obstacles);
        const len = pathLength(pts);
        if (len < bestScore) { bestScore = len; best = { d1, d2 }; }
      }
      return best;
    };

    // Group links by source so shared exit ports create overlapping trunks
    const linksBySource = {};
    for (const link of links) {
      const key = link.from_node_id;
      if (!linksBySource[key]) linksBySource[key] = [];
      linksBySource[key].push(link);
    }

    for (const [, groupLinks] of Object.entries(linksBySource)) {
      const from = displayNodes.find((n) => n.id === groupLinks[0].from_node_id);
      if (!from) continue;

      if (groupLinks.length === 1) {
        const to = displayNodes.find((n) => n.id === groupLinks[0].to_node_id);
        if (!to) continue;
        const obstacles = computeObstacles([from.id, to.id]);
        let best = null, bestScore = Infinity;
        for (const d1 of DIRS) {
          for (const d2 of DIRS) {
            if (d1.x === d2.x && d1.y === d2.y) continue;
            const p1 = getPortPoint(from, d1, sizeMap);
            const p2 = getPortPoint(to, d2, sizeMap);
            if (p1.x === p2.x && p1.y === p2.y) continue;
            const pts = getWaypoints(p1.x, p1.y, p2.x, p2.y, d1, d2, obstacles);
            const len = pathLength(pts);
            if (len < bestScore) { bestScore = len; best = { d1, d2 }; }
          }
        }
        if (best) optimized[groupLinks[0].id] = best;
        continue;
      }

      // Multiple links from same source — find the shared d1 that minimizes total path length
      let bestD1 = null, bestTotal = Infinity;
      for (const d1 of DIRS) {
        let total = 0;
        for (const link of groupLinks) {
          const to = displayNodes.find((n) => n.id === link.to_node_id);
          if (!to) { total = Infinity; break; }
          const obstacles = computeObstacles([from.id, to.id]);
          const result = findBestD2(from, to, d1, obstacles);
          total += result ? pathLength(getWaypoints(
            getPortPoint(from, d1, sizeMap).x, getPortPoint(from, d1, sizeMap).y,
            getPortPoint(to, result.d2, sizeMap).x, getPortPoint(to, result.d2, sizeMap).y,
            d1, result.d2, obstacles
          )) : Infinity;
        }
        if (total < bestTotal) { bestTotal = total; bestD1 = d1; }
      }

      if (bestD1) {
        for (const link of groupLinks) {
          const to = displayNodes.find((n) => n.id === link.to_node_id);
          if (!to) continue;
          const obstacles = computeObstacles([from.id, to.id]);
          const best = findBestD2(from, to, bestD1, obstacles);
          if (best) optimized[link.id] = best;
        }
      }
    }

    onOptimize(optimized);
  };

  return (
    <div className="flex h-full">
      {/* Palette */}
      <div className="w-48 shrink-0 border-r border-border bg-card p-3 overflow-y-auto flex flex-col">
        <p className="text-xs font-semibold text-muted-foreground mb-2">Available DMAs</p>
        <div className="space-y-1.5 flex-1">
          {availableDmas.length === 0 ? (
            <p className="text-xs text-muted-foreground/50 italic">All DMAs placed</p>
          ) : (
            availableDmas.map((dma) => (
              <div
                key={dma.id}
                draggable={!locked}
                onDragStart={locked ? undefined : (e) => {
                  e.dataTransfer.setData("application/json", JSON.stringify({ type: "dma", id: dma.id }));
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onClick={locked ? undefined : () => onAddNode("dma", dma)}
                className={`w-full flex items-center gap-2 p-2 rounded-md border border-border bg-background transition-colors text-xs text-left ${locked ? "opacity-40 cursor-not-allowed" : "hover:border-primary hover:bg-primary/5 cursor-grab active:cursor-grabbing"}`}
              >
                <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: dma.color || "#3b82f6" }} />
                <span className="truncate flex-1">{dma.name}</span>
                <Plus className="w-3 h-3 shrink-0 text-muted-foreground" />
              </div>
            ))
          )}
        </div>
        <div className="pt-2 mt-2 border-t border-border text-[10px] text-muted-foreground/60 space-y-0.5">
          <p>Drag to canvas or click +</p>
          <p>Drag from <span className="text-primary">●</span> to connect</p>
          <p>Click node → meter data</p>
          <p>Click link → ✕ to disconnect</p>
          <p>Drag empty space to pan</p>
          <p>✨ Optimize water lines</p>
        </div>
        {simulationData && (
          <div className="pt-2 mt-2 border-t border-border space-y-1">
            <p className="text-[10px] font-semibold text-muted-foreground/70">Simulation</p>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-blue-500" /> Mains
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-green-500" /> Insertion
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-amber-500" /> Valves
            </div>
          </div>
        )}
      </div>

      {/* Canvas wrapper */}
      <div className="relative flex-1 overflow-hidden bg-background" style={{ backgroundImage: "radial-gradient(circle, hsl(var(--muted-foreground) / 0.12) 1px, transparent 1px)", backgroundSize: "20px 20px" }}>
        {/* Scrollable canvas */}
        <div
          ref={canvasRef}
          className={`absolute inset-0 overflow-auto ${isPanning ? "cursor-grabbing" : "cursor-grab"}`}
          onMouseDown={handleCanvasMouseDown}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (locked) return;
            try {
              const data = JSON.parse(e.dataTransfer.getData("application/json"));
              if (data.type === "dma") {
                const dma = dmas.find((d) => d.id === data.id);
                if (dma) {
                  const { x, y } = toContentCoords(e.clientX, e.clientY);
                  onAddNode("dma", dma, x, y);
                }
              }
            } catch {}
          }}
        >
          <div style={{ width: contentW * scale, height: contentH * scale, position: "relative" }}>
            <div style={{ width: contentW, height: contentH, transform: `scale(${scale})`, transformOrigin: "top left", position: "absolute", top: 0, left: 0 }}>
              {/* SVG connections — pipes with animated water flow */}
              <svg className="absolute top-0 left-0 pointer-events-none" width={contentW} height={contentH} style={{ overflow: "visible" }}>
                {links.map((link) => {
                  const from = displayNodes.find((n) => n.id === link.from_node_id);
                  const to = displayNodes.find((n) => n.id === link.to_node_id);
                  if (!from || !to) return null;
                  const isSelected = selected?.type === "link" && selected.id === link.id;
                  const opt = optimizedPorts[link.id];
                  const pts = opt
                    ? (() => {
                        const p1 = getPortPoint(from, opt.d1, sizeMap);
                        const p2 = getPortPoint(to, opt.d2, sizeMap);
                        return { x1: p1.x, y1: p1.y, d1: opt.d1, x2: p2.x, y2: p2.y, d2: opt.d2 };
                      })()
                    : getConnectionPoints(from, to, sizeMap);
                  const obstacles = displayNodes
                    .filter((n) => n.id !== from.id && n.id !== to.id)
                    .map((n) => { const s = getNodeSize(n, sizeMap); return { x: n.pos_x, y: n.pos_y, w: s.w, h: s.h }; });
                  const d = getOrthogonalPath(pts.x1, pts.y1, pts.x2, pts.y2, pts.d1, pts.d2, obstacles);
                  return (
                    <g key={link.id}>
                      <path
                        d={d}
                        stroke={isSelected ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"}
                        strokeWidth={isSelected ? 10 : 8}
                        fill="none"
                        strokeLinecap="round"
                        style={{ pointerEvents: "stroke", cursor: "pointer" }}
                        onClick={(e) => { e.stopPropagation(); setSelected({ type: "link", id: link.id }); }}
                      />
                      <path
                        d={d}
                        stroke="#1e40af"
                        strokeWidth={isSelected ? 5 : 4}
                        fill="none"
                        strokeLinecap="round"
                        strokeDasharray="8,4"
                        className="water-flow-line"
                        opacity={0.9}
                        style={{ pointerEvents: "none" }}
                      />
                      <path
                        d={d}
                        stroke="#ffffff"
                        strokeWidth={isSelected ? 2 : 1.5}
                        fill="none"
                        strokeLinecap="round"
                        strokeDasharray="4,8"
                        strokeDashoffset="2"
                        className="water-flow-line"
                        opacity={0.85}
                        style={{ pointerEvents: "none" }}
                      />
                      {isSelected && !locked && (() => {
                        const mx = (pts.x1 + pts.x2) / 2;
                        const my = (pts.y1 + pts.y2) / 2;
                        return (
                          <g style={{ pointerEvents: "all", cursor: "pointer" }} onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onDeleteLink(link.id); setSelected(null); }}>
                            <title>Disconnect</title>
                            <circle cx={mx} cy={my} r="11" fill="hsl(var(--destructive))" stroke="hsl(var(--background))" strokeWidth="2" />
                            <path d={`M ${mx - 4} ${my - 4} L ${mx + 4} ${my + 4} M ${mx + 4} ${my - 4} L ${mx - 4} ${my + 4}`} stroke="hsl(var(--destructive-foreground))" strokeWidth="2" strokeLinecap="round" />
                          </g>
                        );
                      })()}
                    </g>
                  );
                })}
                {isConnecting && connectMouse && displayNodes.find((n) => n.id === connectRef.current?.fromId) && (() => {
                  const from = displayNodes.find((n) => n.id === connectRef.current.fromId);
                  const port = getNearestPort(from, connectMouse.x, connectMouse.y, sizeMap);
                  const previewObstacles = displayNodes
                    .filter((n) => n.id !== from.id)
                    .map((n) => { const s = getNodeSize(n, sizeMap); return { x: n.pos_x, y: n.pos_y, w: s.w, h: s.h }; });
                  return (
                    <>
                      <path
                        d={getOrthogonalPath(port.x, port.y, connectMouse.x, connectMouse.y, port.d, { x: 0, y: 0 }, previewObstacles)}
                        stroke="#1e40af"
                        strokeWidth={4}
                        strokeDasharray="6,4"
                        fill="none"
                        opacity={0.7}
                        style={{ pointerEvents: "none" }}
                      />
                      <path
                        d={getOrthogonalPath(port.x, port.y, connectMouse.x, connectMouse.y, port.d, { x: 0, y: 0 }, previewObstacles)}
                        stroke="#ffffff"
                        strokeWidth={1.5}
                        strokeDasharray="3,7"
                        fill="none"
                        opacity={0.7}
                        style={{ pointerEvents: "none" }}
                      />
                    </>
                  );
                })()}
              </svg>

              {/* Nodes */}
              {displayNodes.map((node) => {
                const isSelected = selected?.type === "node" && selected.id === node.id;
                const isSource = node.node_type === "source";
                const isDma = !isSource;
                const dma = node.dma_id ? dmas.find((d) => d.id === node.dma_id) : null;
                const count = meterCounts?.[node.id] ?? 0;
                const ns = nodeSize(node);
                const simItems = simulationData?.[node.id];
                return (
                  <div
                    key={node.id}
                    data-node-id={node.id}
                    onMouseDown={(e) => handleNodeMouseDown(e, node)}
                    className={`absolute select-none cursor-move shadow-lg transition-shadow ${
                      isSelected ? "shadow-primary/20 z-10" : ""
                    } ${isSource ? "rounded-full border-2 border-black bg-slate-200 dark:bg-slate-600" : "rounded-lg border-2"}`}
                    style={{
                      left: node.pos_x,
                      top: node.pos_y,
                      width: ns.w,
                      height: ns.h,
                      ...(isDma ? {
                        backgroundColor: (dma?.color || "#3b82f6") + "18",
                        borderColor: dma?.color || "#3b82f6",
                      } : {}),
                    }}
                  >
                    {isDma && simItems?.length > 0 && (
                      <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-lg">
                        {simItems.map((item, idx) => (
                          <div
                            key={idx}
                            className="absolute w-2 h-2 rounded-full ring-1 ring-black/30"
                            style={{
                              left: `${item.relX * 100}%`,
                              top: `${item.relY * 100}%`,
                              transform: "translate(-50%, -50%)",
                              backgroundColor: item.type === "main" ? "#3b82f6" : item.type === "insertion" ? "#22c55e" : "#f59e0b",
                            }}
                          />
                        ))}
                      </div>
                    )}
                    <div className="relative z-10 flex items-center gap-2 p-2.5 h-full">
                      {isSource ? (
                        <div className="w-8 h-8 rounded-lg bg-slate-300 dark:bg-slate-500 flex items-center justify-center shrink-0">
                          <Droplets className="w-4 h-4 text-slate-700 dark:text-slate-100" />
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border" style={{ borderColor: dma?.color || "#3b82f6", backgroundColor: (dma?.color || "#3b82f6") + "20" }}>
                          <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: dma?.color || "#3b82f6" }} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className={`${isDma ? "text-sm font-bold" : "text-xs font-semibold"} truncate text-foreground`}>{node.name}</p>
                        <p className="text-[10px] text-muted-foreground">{count} meters</p>
                      </div>
                    </div>
                    {isDma && !locked && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onDeleteNode(node.id); }}
                        onMouseDown={(e) => e.stopPropagation()}
                        className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-md hover:scale-110 transition-transform z-30"
                        title="Remove from canvas"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                    {/* Ports on all 4 sides */}
                    <div data-port="output" onMouseDown={(e) => handlePortMouseDown(e, node.id)} className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-3.5 h-3.5 rounded-full bg-primary border-2 border-background hover:scale-125 transition-transform cursor-crosshair z-20" title="Drag to connect" />
                    <div data-port="output" onMouseDown={(e) => handlePortMouseDown(e, node.id)} className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-primary border-2 border-background hover:scale-125 transition-transform cursor-crosshair z-20" title="Drag to connect" />
                    <div data-port="output" onMouseDown={(e) => handlePortMouseDown(e, node.id)} className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-primary border-2 border-background hover:scale-125 transition-transform cursor-crosshair z-20" title="Drag to connect" />
                    <div data-port="output" onMouseDown={(e) => handlePortMouseDown(e, node.id)} className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-3.5 h-3.5 rounded-full bg-primary border-2 border-background hover:scale-125 transition-transform cursor-crosshair z-20" title="Drag to connect" />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Drop zone hint */}
        {dragOver && (
          <div className="absolute inset-0 pointer-events-none border-2 border-dashed border-primary/40 rounded-lg bg-primary/5" />
        )}

        {/* Zoom controls */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex flex-row bg-card/95 backdrop-blur rounded-lg shadow-lg border border-border overflow-hidden">
          <button onClick={() => setScale((s) => Math.max(0.2, s - 0.1))} className="flex items-center justify-center w-9 h-9 text-muted-foreground hover:bg-muted border-r border-border" title="Zoom out">
            <Minus className="w-4 h-4" />
          </button>
          <span className="flex items-center px-3 text-xs font-medium text-muted-foreground border-r border-border min-w-[50px] justify-center">
            {Math.round(scale * 100)}%
          </span>
          <button onClick={() => setScale((s) => Math.min(3, s + 0.1))} className="flex items-center justify-center w-9 h-9 text-muted-foreground hover:bg-muted border-r border-border" title="Zoom in">
            <Plus className="w-4 h-4" />
          </button>
          <button onClick={fitToView} className="flex items-center justify-center w-9 h-9 text-muted-foreground hover:bg-muted border-r border-border" title="Fit to view">
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleOptimizePaths}
            disabled={locked}
            className={`flex items-center justify-center w-9 h-9 transition-colors ${locked ? "opacity-40 cursor-not-allowed text-muted-foreground" : "text-muted-foreground hover:bg-primary/10 hover:text-primary"}`}
            title="Optimize water line paths"
          >
            <Sparkles className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}