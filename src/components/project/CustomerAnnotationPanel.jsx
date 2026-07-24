import React from "react";
import { ArrowUpRight, Pencil, MessageSquare, Trash2, X, Eye, EyeOff } from "lucide-react";

export default function CustomerAnnotationPanel({ annotations, onDelete, onFocus, onClose, annotationsHidden, onToggleAll, hiddenIds, onToggleVisibility }) {
  const parseData = (a) => {
    try {
      return typeof a.data === "string" ? JSON.parse(a.data) : a.data || {};
    } catch {
      return {};
    }
  };

  const getIcon = (type) => {
    if (type === "comment") return MessageSquare;
    if (type === "arrow") return ArrowUpRight;
    return Pencil;
  };

  const getLabel = (a) => {
    const data = parseData(a);
    if (a.annotation_type === "comment") return data.text || "Untitled comment";
    if (a.annotation_type === "arrow") return data.title || "Arrow";
    return data.title || "Drawing";
  };

  return (
    <div className="absolute bottom-16 left-3 z-[1000]">
      <div className="bg-card/95 backdrop-blur rounded-xl shadow-lg border border-border p-3 w-[230px]">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-foreground/90">Customer Annotations ({annotations.length})</p>
          <div className="flex items-center gap-1">
            {annotations.length > 0 && (
              <button
                onClick={onToggleAll}
                className="p-1 rounded hover:bg-muted text-muted-foreground"
                title={annotationsHidden ? "Show all" : "Hide all"}
              >
                {annotationsHidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              </button>
            )}
            <button
              onClick={onClose}
              className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="space-y-1.5 max-h-[40vh] overflow-y-auto">
          {annotations.length === 0 && (
            <p className="text-xs text-muted-foreground/70 py-2">No customer annotations</p>
          )}
          {annotations.map((a) => {
            const data = parseData(a);
            const Icon = getIcon(a.annotation_type);
            return (
              <div key={a.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                <span
                  className="w-3 h-3 rounded-sm shrink-0"
                  style={{ backgroundColor: data.color || "#3b82f6" }}
                />
                <Icon className="w-3 h-3 shrink-0" />
                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => onFocus(a)}
                >
                  <p className="truncate font-medium text-foreground hover:text-primary transition-colors">
                    {getLabel(a)}
                  </p>
                </div>
                <button
                  onClick={() => onToggleVisibility(a.id)}
                  className="p-1 rounded hover:bg-muted text-muted-foreground shrink-0"
                  title={hiddenIds?.includes(a.id) ? "Show on map" : "Hide on map"}
                >
                  {hiddenIds?.includes(a.id) ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                </button>
                <button
                  onClick={() => onDelete(a.id)}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-red-500 transition-colors shrink-0"
                  title="Delete"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}