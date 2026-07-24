import React, { useState } from "react";
import { Pin, ArrowRight, Trash2, Crosshair, StickyNote, X, Eye, EyeOff, Pencil, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown } from "lucide-react";

export default function NotesList({ annotations, annotationMode, arrowStart, onAddNote, onAddArrow, onCancelMode, onHighlight, highlightedId, onDelete, onZoomTo, onEdit, annotationsHidden, onToggleAllAnnotations, hiddenAnnotationIds, onToggleAnnotationVisibility }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="mt-4 pt-4 border-t border-border">
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-xs font-semibold text-foreground flex items-center gap-1.5 hover:text-primary transition-colors"
        >
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          <StickyNote className="w-3.5 h-3.5" /> Notes & Arrows
        </button>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground">{annotations.length}</span>
          {annotations.length > 0 && (
            <button
              onClick={onToggleAllAnnotations}
              className="p-1 rounded hover:bg-muted text-muted-foreground"
              title={annotationsHidden ? "Show all" : "Hide all"}
            >
              {annotationsHidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            </button>
          )}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground font-medium transition-colors px-1.5 py-0.5 rounded hover:bg-muted"
            title={expanded ? "Collapse all" : "Expand all"}
          >
            {expanded ? <ChevronsDownUp className="w-3.5 h-3.5" /> : <ChevronsUpDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {expanded && annotationMode ? (
        <div className="mb-2 p-2 rounded-md bg-primary/10 border border-primary/30 flex items-center gap-2">
          <span className="text-xs text-primary flex-1">
            {annotationMode === "note"
              ? "Click on map to place note"
              : arrowStart
                ? "Click end point on map"
                : "Click start point on map"}
          </span>
          <button onClick={onCancelMode} className="p-1 rounded hover:bg-primary/20 text-primary" title="Cancel">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : expanded ? (
        <div className="flex gap-2 mb-2">
          <button
            onClick={onAddNote}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium border border-border bg-muted hover:bg-accent text-foreground transition-colors"
          >
            <Pin className="w-3 h-3" /> Note
          </button>
          <button
            onClick={onAddArrow}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium border border-border bg-muted hover:bg-accent text-foreground transition-colors"
          >
            <ArrowRight className="w-3 h-3" /> Arrow
          </button>
        </div>
      ) : null}

      {expanded && (
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {annotations.length === 0 ? (
          <p className="text-[11px] text-muted-foreground/60 text-center py-2">No annotations yet</p>
        ) : (
          annotations.map((ann) => (
            <div
              key={ann.id}
              className={`flex items-center gap-2 p-1.5 rounded-md text-xs transition-colors ${highlightedId === ann.id ? "bg-primary/15" : "hover:bg-muted"}`}
            >
              {ann.note_type === "arrow" ? (
                <ArrowRight className="w-3 h-3 shrink-0 text-blue-500" />
              ) : (
                <Pin className="w-3 h-3 shrink-0 text-primary" />
              )}
              <button onClick={() => onHighlight(ann.id)} className="flex-1 text-left truncate text-foreground">
                {ann.text || "Untitled"}
              </button>
              <button
                onClick={() => onToggleAnnotationVisibility(ann.id)}
                className="p-1 rounded hover:bg-muted text-muted-foreground shrink-0"
                title={hiddenAnnotationIds?.includes(ann.id) ? "Show on map" : "Hide on map"}
              >
                {hiddenAnnotationIds?.includes(ann.id) ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              </button>
              <button onClick={() => onZoomTo(ann)} className="p-1 rounded hover:bg-muted text-muted-foreground shrink-0" title="Zoom to">
                <Crosshair className="w-3 h-3" />
              </button>
              {onEdit && (
                <button
                  onClick={() => onEdit(ann)}
                  className="p-1 rounded hover:bg-muted text-muted-foreground shrink-0"
                  title="Edit"
                >
                  <Pencil className="w-3 h-3" />
                </button>
              )}
              <button
                onClick={() => onDelete(ann.id)}
                className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 text-red-500 shrink-0"
                title="Delete"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))
        )}
      </div>
      )}
    </div>
  );
}