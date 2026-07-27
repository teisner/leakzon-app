import React, { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Hexagon, MapPin, AlertTriangle, Check } from "lucide-react";
import { invokeFunction } from "@/api/functionsClient";
import { supabase } from "@/api/supabaseClient";
import { convexHull, expandHull } from "@/lib/convexHull";

// Breathing room around an auto-drawn DMA, in metres.
const DMA_MARGIN_METERS = 25;
import { recordProgress } from "@/lib/progressTracker";

const DMA_COLORS = ["#3b82f6", "#16a34a", "#dc2626", "#9333ea", "#ea580c", "#0891b2", "#db2777", "#65a30d", "#facc15"];

export default function AutoCreateDmasDialog({ open, onOpenChange, projectId, onCreated }) {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState([]);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [createdCount, setCreatedCount] = useState(0);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setCreatedCount(0);
    try {
      const [metersRes, { data: existingDmas }] = await Promise.all([
        invokeFunction("getProjectMeters", { project_id: projectId }),
        supabase.from('dma').select('*').eq('project_id', projectId),
      ]);
      const allMeters = metersRes.data?.meters || [];
      const existingNames = new Set((existingDmas || []).map((d) => d.name));
      // getProjectMeters' dma_name is derived from an existing DMA, so on a
      // first import — the very case this dialog exists for — it is always
      // empty. The name the file supplied lives on import_dma_name.
      const { data: importedNames } = await supabase
        .from('meter')
        .select('id, import_dma_name')
        .eq('project_id', projectId)
        .not('import_dma_name', 'is', null);
      const importedById = new Map((importedNames || []).map((r) => [r.id, r.import_dma_name]));

      const groupMap = {};
      for (const m of allMeters) {
        // Prefer the name from the import file; fall back to a resolved DMA.
        m.dma_name = importedById.get(m.id) || m.dma_name;
        if (!m.dma_name) continue;
        if (!groupMap[m.dma_name]) {
          groupMap[m.dma_name] = { name: m.dma_name, meters: [], coords: [], mainMeters: [], subMeters: [] };
        }
        groupMap[m.dma_name].meters.push(m);
        if (m.latitude != null && m.longitude != null) {
          groupMap[m.dma_name].coords.push([m.latitude, m.longitude]);
        }
        if (m.is_main) groupMap[m.dma_name].mainMeters.push(m);
        else groupMap[m.dma_name].subMeters.push(m);
      }

      const groupList = Object.values(groupMap)
        .map((g, i) => {
          // Expanded so meters that define the boundary fall inside it rather
          // than exactly on it, where they read as unassigned.
          const hull = g.coords.length >= 3 ? expandHull(convexHull(g.coords), DMA_MARGIN_METERS) : null;
          return {
            name: g.name,
            meterCount: g.meters.length,
            subMeterCount: g.subMeters.length,
            mainMeterId: g.mainMeters[0]?.id || null,
            coordsCount: g.coords.length,
            canDrawPolygon: hull !== null && hull.length >= 3,
            polygon: hull && hull.length >= 3 ? hull : null,
            color: DMA_COLORS[i % DMA_COLORS.length],
            exists: existingNames.has(g.name),
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));

      setGroups(groupList);
      setSelected(new Set(groupList.filter((g) => g.canDrawPolygon && !g.exists).map((g) => g.name)));
    } catch {
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const toggleSelect = (name) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const toCreate = groups.filter((g) => selected.has(g.name));
      let count = 0;
      const records = toCreate.map((g, i) => ({
        project_id: projectId,
        name: g.name,
        color: g.color,
        transparency: 0.3,
        polygon_json: g.polygon,
        main_meter_id: g.mainMeterId,
        visible: true,
        sort_order: i,
      }));
      if (records.length > 0) {
        const { data: created, error } = await supabase.from('dma').insert(records).select('id, name');
        if (!error) {
          count = records.length;
          // Point each meter at the DMA its file named, so the assignment is
          // real rather than only implied by the polygon.
          for (const d of created || []) {
            const { error: linkError } = await supabase
              .from('meter')
              .update({ dma_id: d.id })
              .eq('project_id', projectId)
              .eq('import_dma_name', d.name)
              .is('dma_id', null);
            if (linkError) console.error("Failed to link meters to DMA", d.name, linkError);
          }
        }
      }
      setCreatedCount(count);
      if (count > 0) {
        await recordProgress(projectId, "dmas_created");
      }
      onCreated?.();
    } finally {
      setCreating(false);
    }
  };

  const noCoordsCount = groups.filter((g) => !g.canDrawPolygon && !g.exists).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Hexagon className="w-5 h-5 text-primary" />
            Auto-Create DMAs from Meter Data
          </DialogTitle>
          <DialogDescription>
            DMA names were detected in the imported meter data. Polygons are auto-drawn from meter coordinates using a convex hull algorithm.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
        ) : createdCount > 0 ? (
          <div className="py-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center mx-auto">
              <Check className="w-6 h-6 text-emerald-600" />
            </div>
            <p className="text-sm font-medium text-foreground">{createdCount} DMA{createdCount !== 1 ? "s" : ""} created successfully.</p>
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          </div>
        ) : groups.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm text-muted-foreground">No DMA names found in the imported meter data.</p>
          </div>
        ) : (
          <>
            {noCoordsCount > 0 && (
              <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-500">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{noCoordsCount} DMA{noCoordsCount !== 1 ? "s" : ""} don't have enough meters with coordinates to draw polygons and will be skipped.</span>
              </div>
            )}
            <div className="max-h-80 overflow-y-auto space-y-1.5">
              {groups.map((g) => (
                <div
                  key={g.name}
                  className={`flex items-center gap-3 p-2.5 rounded-lg border transition-colors ${
                    g.exists ? "border-border bg-muted/50 opacity-60" : g.canDrawPolygon ? "border-primary/30 bg-primary/5" : "border-border"
                  }`}
                >
                  <Checkbox
                    checked={selected.has(g.name)}
                    onCheckedChange={() => toggleSelect(g.name)}
                    disabled={g.exists || !g.canDrawPolygon}
                  />
                  <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{g.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {g.meterCount} meter{g.meterCount !== 1 ? "s" : ""}
                      {g.canDrawPolygon ? ` · ${g.coordsCount} with coordinates` : " · no coordinates"}
                    </p>
                  </div>
                  {g.exists ? (
                    <span className="text-[10px] text-muted-foreground shrink-0">Already exists</span>
                  ) : g.canDrawPolygon ? (
                    <MapPin className="w-4 h-4 text-primary shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  )}
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={creating || selected.size === 0} className="gap-1.5">
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Hexagon className="w-4 h-4" />}
                Create {selected.size} DMA{selected.size !== 1 ? "s" : ""}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}