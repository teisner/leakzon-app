import React, { useState } from "react";
import { Eye, EyeOff, Trash2, FileText, Map as MapIcon, ZoomIn, Lock, Pencil, ChevronDown, ChevronRight, GripVertical, ShieldCheck, MapPin, Plus, Layers as LayersIcon, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { isPointEditableLayer } from "@/lib/editablePoints";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import LayerShapeIcon from "./LayerShapeIcon";
import { panelSort } from "@/lib/layerSort";
import { useLanguage } from "@/lib/i18n";

const isBoundary = (layer) => /boundary/i.test(layer.name);

export default function LayersPanel({ layers, meters, onToggleVisibility, onDelete, onZoomToLayer, onEdit, onUpdateLayer, onReorder, clipToBoundary, onClipToBoundaryChange, onCreateManualLayer, onEditManualLayer, onRedrawBoundary, onEditBoundary, locked }) {
  const { t } = useLanguage();
  const [expandedPipes, setExpandedPipes] = useState({});
  const [layersExpanded, setLayersExpanded] = useState(true);
  const hasBoundary = layers.some(isBoundary);

  const pipeLayers = layers.filter((l) => l.pipe_config);
  const allPipesExpanded = pipeLayers.length > 0 && pipeLayers.every((l) => expandedPipes[l.id]);
  const allExpanded = layersExpanded && allPipesExpanded;
  const toggleAll = () => {
    const val = !allExpanded;
    setLayersExpanded(val);
    const newPipes = {};
    pipeLayers.forEach((l) => { newPipes[l.id] = val; });
    setExpandedPipes(newPipes);
  };

  if (layers.length === 0) {
    return (
      <div className="space-y-3">
        <Button onClick={onCreateManualLayer} variant="outline" size="sm" className="w-full gap-1.5" disabled={locked}>
          <Plus className="w-3.5 h-3.5" /> {t('layers.createManual')}
        </Button>
        <div className="text-center py-8 text-sm text-muted-foreground/70">
          {t('layers.empty')}
        </div>
      </div>
    );
  }

  const sorted = [...layers].sort(panelSort);
  const boundaryLayers = sorted.filter(isBoundary);
  const otherLayers = sorted.filter((l) => !isBoundary(l));

  const toggleExpand = (id) => setExpandedPipes((p) => ({ ...p, [id]: !p[id] }));

  const handleToggleDiameter = (layer, idx) => {
    if (locked) return;
    const config = layer.pipe_config;
    if (!config) return;
    const diameters = config.diameters.map((d, i) =>
      i === idx ? { ...d, visible: !d.visible } : d
    );
    onUpdateLayer?.(layer, { pipe_config: { ...config, diameters } });
  };

  const handleDragEnd = (result) => {
    if (locked) return;
    if (!result.destination || result.destination.index === result.source.index) return;
    const reordered = [...otherLayers];
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    onReorder?.(reordered);
  };

  const renderLayerRow = (layer, index, provided, snapshot) => {
    const boundary = isBoundary(layer);
    const pipe = layer.pipe_config;
    const expanded = expandedPipes[layer.id];

    return (
      <div
        ref={provided?.innerRef}
        {...(provided?.draggableProps || {})}
        className={`rounded-xl transition-shadow ${snapshot?.isDragging ? "shadow-lg ring-2 ring-blue-300" : ""} ${boundary ? "" : "bg-muted hover:bg-muted/70"}`}
      >
        <div className="flex items-center gap-2 p-3">
          {/* Drag handle — only for non-boundary */}
          {!boundary && provided && (
            <span
              {...(provided.dragHandleProps || {})}
              className={`shrink-0 ${locked
                ? "cursor-not-allowed text-muted-foreground/25"
                : "cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground"}`}
              title={locked ? "Project locked — layer order can't be changed" : "Drag to reorder"}
            >
              <GripVertical className="w-4 h-4" />
            </span>
          )}
          {boundary && <span className="shrink-0 w-4" />}

          {/* Indicator */}
          {boundary ? (
            <span className="w-4 h-0 border-t-2 border-dashed shrink-0" style={{ borderColor: "#dc2626" }} />
          ) : pipe ? (
            <div className="flex items-center gap-1 shrink-0">
              <svg width="20" height="6" viewBox="0 0 20 6" style={{ filter: "drop-shadow(0 1px 1px rgba(0,0,0,0.15))" }}>
                <line x1="1" y1="3" x2="19" y2="3" stroke={pipe.diameters[0]?.color || layer.color || "#3388ff"} strokeWidth={Math.min(pipe.diameters[0]?.weight || 3, 5)} strokeLinecap="round" />
              </svg>
              <button onClick={() => toggleExpand(layer.id)} className="p-0.5 hover:bg-slate-200 rounded">
                {expanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
              </button>
            </div>
          ) : layer.icon_url ? (
            <img src={layer.icon_url} className="w-5 h-5 object-contain shrink-0" alt="" />
          ) : (
            <LayerShapeIcon layer={layer} size={16} />
          )}

          {/* Name + badges */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate flex items-center gap-1.5">
              {layer.name}
              {boundary && <Lock className="w-3 h-3 text-muted-foreground/70 shrink-0" />}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              {boundary ? (
                <Badge variant="secondary" className="text-[10px] gap-1 bg-slate-200 text-muted-foreground">
                  {t('layers.basicLayer')}
                </Badge>
                ) : pipe ? (
                <Badge variant="outline" className="text-[10px] gap-1">
                  <MapIcon className="w-2.5 h-2.5" /> {t('layers.pipes', { count: pipe.diameters.length })}
                </Badge>
                ) : layer.is_manual ? (
                <Badge variant="outline" className="text-[10px] gap-1 bg-blue-50 text-blue-600">
                  <MapPin className="w-2.5 h-2.5" /> {t('layers.manual')}
                </Badge>
                ) : (
                <Badge variant="outline" className="text-[10px] gap-1">
                  {layer.layer_type === "shp" ? <MapIcon className="w-2.5 h-2.5" /> : <FileText className="w-2.5 h-2.5" />}
                  {layer.layer_type === "shp" ? t('layers.shapefile') : t('layers.data')}
                </Badge>
              )}
              {layer.feature_count > 0 && (() => {
                let displayCount = null;
                if (layer.layer_type === "data" && meters) {
                  const layerMeters = meters.filter((m) =>
                    (m.source_file_url && m.source_file_url === layer.file_url) ||
                    (m.layer_id && m.layer_id === layer.id)
                  );
                  displayCount = layerMeters.filter((m) => m.latitude != null && m.longitude != null).length;
                }
                return (
                  <span className="text-xs text-muted-foreground/70">
                    {t('layers.features', { count: layer.feature_count })}
                    {displayCount !== null && displayCount < layer.feature_count && (
                      <span className="text-emerald-600"> · {t('layers.showing', { count: displayCount })}</span>
                    )}
                  </span>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Actions — new line below */}
        <div className="flex items-center gap-1 px-3 pb-3">
          {layer.visible && (layer.bounds || layer.layer_type === "data") && (
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => onZoomToLayer?.(layer)} title={t('layers.zoomToLayer')}>
              <ZoomIn className="w-3.5 h-3.5" />
            </Button>
          )}
          {isPointEditableLayer(layer) && (
            <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-600" onClick={() => onEditManualLayer?.(layer)} title={t('layers.editPoints')} disabled={locked}>
              <MapPin className="w-3.5 h-3.5" />
            </Button>
          )}
          {boundary && (
            <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-600" onClick={() => onEditBoundary?.(layer)} title={t('layers.editBoundary')} disabled={locked}>
              <Pencil className="w-3.5 h-3.5" />
            </Button>
          )}
          {!boundary && (
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => onEdit?.(layer)} title={t('layers.editLayer')} disabled={locked}>
              <Pencil className="w-3.5 h-3.5" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7 ml-auto text-muted-foreground" onClick={() => onToggleVisibility(layer)} title={layer.visible ? t('layers.hideLayer') : t('layers.showLayer')}>
            {layer.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-muted-foreground/70" />}
          </Button>
          {!boundary && (
            <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => onDelete(layer)} title={t('layers.deleteLayer')} disabled={locked}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>

        {/* Pipe diameter sub-list */}
        {pipe && expanded && (
          <div className="ml-6 mb-2 space-y-0.5 border-l-2 border-border pl-3">
            <div className="flex items-center justify-between py-1">
              <span className="text-[11px] font-medium text-muted-foreground">{t('layers.uniformColor')}</span>
              <Switch
                checked={!!pipe.uniform}
                onCheckedChange={(checked) => {
                  if (locked) return;
                  onUpdateLayer?.(layer, { pipe_config: { ...pipe, uniform: checked } });
                }}
              />
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-[11px] font-medium text-muted-foreground">{t('layers.showDiameterLabels')}</span>
              <Switch
                checked={!!pipe.show_diameter_labels}
                onCheckedChange={(checked) => {
                  if (locked) return;
                  onUpdateLayer?.(layer, { pipe_config: { ...pipe, show_diameter_labels: checked } });
                }}
              />
            </div>
            {!pipe.uniform && pipe.diameters.map((d, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs py-1">
                <span className="w-8 h-0 border-t-2 shrink-0" style={{ borderColor: d.color, borderTopWidth: Math.min(d.weight, 4) }} />
                <span className="flex-1 text-muted-foreground">{d.label}</span>
                {d.count !== undefined && (
                  <span className="text-[10px] text-muted-foreground/70">{d.count}</span>
                )}
                <button
                  onClick={() => handleToggleDiameter(layer, idx)}
                  className="p-1 rounded hover:bg-muted text-muted-foreground"
                  title={d.visible ? t('layers.hideDiameter') : t('layers.showDiameter')}
                >
                  {d.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-muted-foreground/70" />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <Button onClick={onCreateManualLayer} variant="outline" size="sm" className="w-full gap-1.5" disabled={locked}>
        <Plus className="w-3.5 h-3.5" /> {t('layers.createManual')}
      </Button>
      {!hasBoundary && (
        <Button onClick={onRedrawBoundary} variant="outline" size="sm" className="w-full gap-1.5 border-red-200 text-red-600 hover:bg-red-50" disabled={locked}>
          <ShieldCheck className="w-3.5 h-3.5" /> {t('layers.drawBoundary')}
        </Button>
      )}
      {hasBoundary && (
        <div className="flex items-center justify-between bg-primary/10 border border-primary/20 rounded-lg p-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground">{t('layers.clipToBoundary')}</p>
              <p className="text-[10px] text-muted-foreground">{t('layers.clipDesc')}</p>
            </div>
          </div>
          <Switch checked={clipToBoundary} onCheckedChange={onClipToBoundaryChange} />
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          onClick={() => setLayersExpanded((v) => !v)}
          className="flex items-center gap-2 text-left group"
        >
          {layersExpanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
          )}
          <LayersIcon className="w-4 h-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">Layers</p>
          <span className="text-xs text-muted-foreground">({layers.length})</span>
        </button>
        <button
          onClick={toggleAll}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground font-medium transition-colors px-1.5 py-0.5 rounded hover:bg-muted"
          title={allExpanded ? "Collapse all" : "Expand all"}
        >
          {allExpanded ? <ChevronsDownUp className="w-3.5 h-3.5" /> : <ChevronsUpDown className="w-3.5 h-3.5" />}
          {allExpanded ? "Collapse all" : "Expand all"}
        </button>
      </div>

      {layersExpanded && (
        <>
          {/* Boundary layers — locked at top, not draggable */}
          {boundaryLayers.map((layer) => (
            <div key={layer.id}>{renderLayerRow(layer, 0, null, null)}</div>
          ))}

          {otherLayers.length > 0 && (
            <DragDropContext onDragEnd={handleDragEnd}>
              <Droppable droppableId="layers">
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                    {otherLayers.map((layer, index) => (
                      <Draggable key={layer.id} draggableId={layer.id} index={index} isDragDisabled={locked}>
                        {(prov, snapshot) => renderLayerRow(layer, index, prov, snapshot)}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          )}
        </>
      )}

    </div>
  );
}