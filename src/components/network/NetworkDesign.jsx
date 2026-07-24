import React, { useState, useEffect, useRef, useMemo } from "react";
import { ArrowLeftRight, Droplets, MapPin, Lock } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import FlowChartCanvas from "./FlowChartCanvas";
import { pointInPolygon } from "@/lib/polygonUtils";
import { isInsertionManualLayer } from "@/lib/meterLayerDetection";
import NetworkMapPanel from "./NetworkMapPanel";
import NetworkStory from "./NetworkStory";

export default function NetworkDesign({ project, dmas, layers, meters, onNodeClick, locked }) {
  const [nodes, setNodes] = useState([]);
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [swapped, setSwapped] = useState(false);
  const [splitPct, setSplitPct] = useState(55);
  const [storySplitPct, setStorySplitPct] = useState(60);
  const sourceInitRef = useRef(false);
  const [showSimulation, setShowSimulation] = useState(false);
  const [isolatedPoints, setIsolatedPoints] = useState([]);
  const [optimizedPorts, setOptimizedPorts] = useState({});

  const loadDesign = async () => {
    try {
      const [{ data: nodeList }, { data: linkList }] = await Promise.all([
        supabase.from('network_node').select('*').eq('project_id', project.id),
        supabase.from('network_link').select('*').eq('project_id', project.id),
      ]);
      const orphanIds = new Set((nodeList || []).filter((n) => n.node_type === "orphans").map((n) => n.id));
      let currentNodes = (nodeList || []).filter((n) => n.node_type !== "orphans");
      let currentLinks = (linkList || []).filter((l) => !orphanIds.has(l.from_node_id) && !orphanIds.has(l.to_node_id));

      // Auto-create Source node if missing
      if (!currentNodes.some((n) => n.node_type === "source") && !sourceInitRef.current) {
        sourceInitRef.current = true;
        const { data: source } = await supabase
          .from('network_node')
          .insert({
            project_id: project.id,
            node_type: "source",
            name: "Source",
            pos_x: 80,
            pos_y: 200,
          })
          .select()
          .single();
        currentNodes = [...currentNodes, source];
      }

      setNodes(currentNodes);
      setLinks(currentLinks);

      // Restore persisted port optimizations (port_config is jsonb — already an object)
      const parsed = {};
      for (const link of currentLinks) {
        if (link.port_config) parsed[link.id] = link.port_config;
      }
      setOptimizedPorts(parsed);
      } catch (err) {
      console.error("Failed to load network design:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    sourceInitRef.current = false;
    loadDesign();
    supabase
      .from('isolated_point')
      .select('*')
      .eq('project_id', project.id)
      .then(({ data }) => setIsolatedPoints(data || []));
  }, [project.id]);

  const handleAddNode = async (type, dma, x, y) => {
    const maxX = Math.max(0, ...nodes.map((n) => n.pos_x));
    const { data: node } = await supabase
      .from('network_node')
      .insert({
        project_id: project.id,
        node_type: type,
        dma_id: dma?.id || null,
        name: type === "source" ? "Source" : dma.name,
        pos_x: x ?? maxX + 260,
        pos_y: y ?? 150 + Math.random() * 120,
      })
      .select()
      .single();
    setNodes((prev) => [...prev, node]);
  };

  const handleNodeDragEnd = async (nodeId, x, y) => {
    setNodes((prev) => prev.map((n) => (n.id === nodeId ? { ...n, pos_x: x, pos_y: y } : n)));
    await supabase.from('network_node').update({ pos_x: x, pos_y: y }).eq('id', nodeId);
  };

  const handleDeleteNode = async (nodeId) => {
    const connected = links.filter((l) => l.from_node_id === nodeId || l.to_node_id === nodeId);
    if (connected.length > 0) {
      await supabase.from('network_link').delete().in('id', connected.map((l) => l.id));
    }
    await supabase.from('network_node').delete().eq('id', nodeId);
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setLinks((prev) => prev.filter((l) => l.from_node_id !== nodeId && l.to_node_id !== nodeId));
  };

  const handleAddLink = async (fromId, toId) => {
    const exists = links.some((l) => l.from_node_id === fromId && l.to_node_id === toId);
    if (exists) return;
    const { data: link } = await supabase
      .from('network_link')
      .insert({ project_id: project.id, from_node_id: fromId, to_node_id: toId })
      .select()
      .single();
    setLinks((prev) => [...prev, link]);
  };

  const handleDeleteLink = async (linkId) => {
    await supabase.from('network_link').delete().eq('id', linkId);
    setLinks((prev) => prev.filter((l) => l.id !== linkId));
  };

  // --- Resize handle ---
  const handleResizeStart = (e) => {
    e.preventDefault();
    const container = e.currentTarget.parentElement;
    const rect = container.getBoundingClientRect();
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const handleMove = (ev) => {
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setSplitPct(Math.min(85, Math.max(15, pct)));
    };
    const handleUp = () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
  };

  // --- Horizontal resize handle (flow chart vs story) ---
  const handleStoryResizeStart = (e) => {
    e.preventDefault();
    const container = e.currentTarget.parentElement;
    const rect = container.getBoundingClientRect();
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    const handleMove = (ev) => {
      const pct = ((ev.clientY - rect.top) / rect.height) * 100;
      setStorySplitPct(Math.min(90, Math.max(10, pct)));
    };
    const handleUp = () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
  };

  const meterCounts = useMemo(() => {
    const counts = {};
    nodes.forEach((node) => {
      if (node.node_type === "source") counts[node.id] = meters.length;
      else if (node.dma_id) {
        const dma = dmas.find((d) => d.id === node.dma_id);
        counts[node.id] = dma?.meter_count || 0;
      }
    });
    return counts;
  }, [nodes, meters, dmas]);

  const simulationData = useMemo(() => {
    if (!showSimulation) return null;
    const result = {};
    for (const node of nodes) {
      if (node.node_type !== "dma" || !node.dma_id) continue;
      const dma = dmas.find((d) => d.id === node.dma_id);
      if (!dma) continue;
      let poly;
      try { poly = typeof dma.polygon === "string" ? JSON.parse(dma.polygon) : dma.polygon; } catch { continue; }
      if (!Array.isArray(poly) || poly.length < 3) continue;
      const lats = poly.map(([lat]) => lat);
      const lngs = poly.map(([, lng]) => lng);
      const minLat = Math.min(...lats), maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
      const latRange = maxLat - minLat || 1;
      const lngRange = maxLng - minLng || 1;
      const items = [];
      for (const m of meters) {
        if (m.latitude == null || m.longitude == null) continue;
        if (m.latitude < minLat || m.latitude > maxLat || m.longitude < minLng || m.longitude > maxLng) continue;
        if (!pointInPolygon(m.latitude, m.longitude, poly)) continue;
        const layer = layers.find((l) => l.id === m.layer_id);
        if (m.is_main) {
          items.push({ type: "main", relX: (m.longitude - minLng) / lngRange, relY: 1 - (m.latitude - minLat) / latRange });
        } else if (isInsertionManualLayer(layer)) {
          items.push({ type: "insertion", relX: (m.longitude - minLng) / lngRange, relY: 1 - (m.latitude - minLat) / latRange });
        }
      }
      for (const ip of isolatedPoints) {
        if (ip.dma1_id === node.dma_id || ip.dma2_id === node.dma_id) {
          items.push({
            type: "valve",
            relX: Math.max(0.03, Math.min(0.97, (ip.longitude - minLng) / lngRange)),
            relY: Math.max(0.03, Math.min(0.97, 1 - (ip.latitude - minLat) / latRange)),
          });
        }
      }
      result[node.id] = items;
    }
    return result;
  }, [showSimulation, nodes, dmas, meters, layers, isolatedPoints]);

  const handleOptimize = async (ports) => {
    setOptimizedPorts(ports);
    setLinks((prev) => prev.map((l) => ({
      ...l,
      port_config: ports[l.id] || null,
    })));
    try {
      await Promise.all(
        Object.entries(ports).map(([linkId, p]) =>
          supabase.from('network_link').update({ port_config: p }).eq('id', linkId)
        )
      );
    } catch (err) {
      console.error("Failed to persist optimization:", err);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        Loading network design…
      </div>
    );
  }

  const flowChart = (
    <FlowChartCanvas
      nodes={nodes}
      links={links}
      dmas={dmas}
      meterCounts={meterCounts}
      simulationData={simulationData}
      optimizedPorts={optimizedPorts}
      onOptimize={handleOptimize}
      onAddNode={handleAddNode}
      onNodeDragEnd={handleNodeDragEnd}
      onDeleteNode={handleDeleteNode}
      onAddLink={handleAddLink}
      onDeleteLink={handleDeleteLink}
      onNodeClick={onNodeClick}
      locked={locked}
    />
  );

  const mapPanel = <NetworkMapPanel project={project} dmas={dmas} layers={layers} />;

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <Droplets className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Network Design</span>
          <span className="text-xs text-muted-foreground">
            {nodes.filter((n) => n.node_type === "dma").length} blocks · {links.length} connections
          </span>
          {locked && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 text-xs font-semibold">
              <Lock className="w-3 h-3" /> Read-only
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSimulation((s) => !s)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
              showSimulation
                ? "bg-primary/15 text-primary hover:bg-primary/20"
                : "bg-muted hover:bg-accent text-muted-foreground hover:text-foreground"
            }`}
            title="Simulate meter & valve locations on DMA blocks"
          >
            <MapPin className="w-3.5 h-3.5" /> Simulate
          </button>
          <button
            onClick={() => setSwapped((s) => !s)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-muted hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="Swap panels"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" /> Swap
          </button>
        </div>
      </div>

      {/* Split panels */}
      <div className="flex-1 flex flex-row overflow-hidden">
        <div
          className={`overflow-hidden flex flex-col ${swapped ? "order-3" : "order-1"}`}
          style={{ width: `${swapped ? 100 - splitPct : splitPct}%` }}
        >
          <div style={{ height: `${storySplitPct}%`, minHeight: 0 }} className="overflow-hidden">
            {flowChart}
          </div>
          <div
            onMouseDown={handleStoryResizeStart}
            className="h-1.5 bg-border hover:bg-primary/50 cursor-row-resize shrink-0 transition-colors z-10"
          />
          <div style={{ height: `${100 - storySplitPct}%`, minHeight: 0 }} className="overflow-hidden">
            <NetworkStory nodes={nodes} links={links} dmas={dmas} meters={meters} meterCounts={meterCounts} />
          </div>
        </div>
        <div
          onMouseDown={handleResizeStart}
          className="order-2 w-1.5 bg-border hover:bg-primary/50 cursor-col-resize shrink-0 transition-colors z-10"
        />
        <div
          className={`overflow-hidden ${swapped ? "order-1" : "order-3"}`}
          style={{ width: `${swapped ? splitPct : 100 - splitPct}%` }}
        >
          {mapPanel}
        </div>
      </div>
    </div>
  );
}