import React, { useState, useMemo } from "react";
import { Plus, Minus, Check, X, ChevronDown } from "lucide-react";

const SPECIAL_COMPONENTS = [
  { key: "dma_polygons", label: "DMA Polygons" },
  { key: "dma_names", label: "DMA Names" },
  { key: "isolated_points", label: "Isolated Points" },
  { key: "notes", label: "Notes" },
  { key: "arrows", label: "Arrows" },
];

export default function ViewSelector({ projectId, layers, onApplyView }) {
  const [views, setViews] = useState(() => {
    try {
      const saved = localStorage.getItem(`map_views_${projectId}`);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [selectedViewId, setSelectedViewId] = useState("");
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [selectedComponents, setSelectedComponents] = useState(new Set());

  const saveViews = (newViews) => {
    setViews(newViews);
    localStorage.setItem(`map_views_${projectId}`, JSON.stringify(newViews));
  };

  const allComponents = useMemo(() => {
    const layerComps = (layers || []).map((l) => ({ key: `layer:${l.id}`, label: l.name }));
    return [...layerComps, ...SPECIAL_COMPONENTS];
  }, [layers]);

  const handleSelect = (viewId) => {
    setSelectedViewId(viewId);
    if (!viewId) {
      onApplyView?.(null);
      return;
    }
    const view = views.find((v) => v.id === viewId);
    if (view) onApplyView?.(view);
  };

  const handleAdd = () => {
    setShowAddPanel(true);
    setSelectedComponents(new Set());
  };

  const handleSave = () => {
    const selected = [...selectedComponents];
    if (selected.length === 0) return;
    const labels = selected.map((key) => {
      const comp = allComponents.find((c) => c.key === key);
      return comp?.label || key;
    });
    const name = labels.length > 3
      ? `${labels.slice(0, 3).join(" + ")} +${labels.length - 3}`
      : labels.join(" + ");
    const newView = { id: `view_${Date.now()}`, name, components: selected };
    saveViews([...views, newView]);
    setShowAddPanel(false);
    setSelectedViewId(newView.id);
    onApplyView?.(newView);
  };

  const handleRemove = () => {
    if (!selectedViewId) return;
    saveViews(views.filter((v) => v.id !== selectedViewId));
    setSelectedViewId("");
    onApplyView?.(null);
  };

  const toggleComponent = (key) => {
    setSelectedComponents((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div>
      <p className="text-xs font-semibold text-foreground/90 mb-1.5">View</p>
      <div className="flex items-center gap-1">
        <div className="relative flex-1">
          <select
            value={selectedViewId}
            onChange={(e) => handleSelect(e.target.value)}
            className="w-full appearance-none bg-muted text-foreground text-xs rounded-md border border-border px-2 py-1.5 pr-6 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
          >
            <option value="">Default</option>
            {views.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
          <ChevronDown className="w-3 h-3 text-muted-foreground absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
        <button
          onClick={handleAdd}
          className="flex items-center justify-center w-6 h-6 rounded-md border border-border bg-muted hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          title="Add view"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleRemove}
          disabled={!selectedViewId}
          className="flex items-center justify-center w-6 h-6 rounded-md border border-border bg-muted hover:bg-accent text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="Remove view"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
      </div>

      {showAddPanel && (
        <div className="mt-2 bg-muted/50 rounded-md border border-border p-2 space-y-0.5 max-h-[200px] overflow-y-auto">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1">Components</p>
          {allComponents.map((comp) => (
            <label key={comp.key} className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-accent/50 cursor-pointer text-xs">
              <input
                type="checkbox"
                checked={selectedComponents.has(comp.key)}
                onChange={() => toggleComponent(comp.key)}
                className="w-3 h-3 accent-primary"
              />
              <span className="text-foreground/90 truncate">{comp.label}</span>
            </label>
          ))}
          <div className="flex items-center gap-1.5 pt-1.5 border-t border-border mt-1">
            <button
              onClick={handleSave}
              disabled={selectedComponents.size === 0}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-white bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Check className="w-3 h-3" /> Save
            </button>
            <button
              onClick={() => setShowAddPanel(false)}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-muted-foreground hover:bg-accent"
            >
              <X className="w-3 h-3" /> Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}