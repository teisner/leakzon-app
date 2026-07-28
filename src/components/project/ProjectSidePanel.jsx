import React from "react";
import { Layers as LayersIcon, Hexagon, PanelLeftClose, Image as ImageIcon } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import LayersPanel from "./LayersPanel";
import DmaPanel from "./DmaPanel";
import ImageOverlayPanel from "./ImageOverlayPanel";
import NotesList from "./NotesList";
import { useLanguage } from "@/lib/i18n";

export default function ProjectSidePanel({ project, layers, meters, onToggleVisibility, onDeleteLayer, onZoomToLayer, onEditLayer, onUpdateLayer, onReorder, clipToBoundary, onClipToBoundaryChange, dmas, onDmaChanged, onStartDraw, onRedrawBoundary, onEditBoundary, onEditDma, onCreateManualLayer, onEditManualLayer, focusedDmaIds, onToggleFocusDma, locked, onClosePanel, highlightUnassigned, onToggleHighlightUnassigned, isolatedMode, onToggleIsolatedMode, highlightBorderValves, onToggleHighlightBorderValves, activeTab, onTabChange, imageOverlays, onOverlaysChanged, editingOverlayId, onToggleEdit, croppingOverlayId, onToggleCrop, mapRef, isolatedPoints, onDeleteIsolatedPoint, onZoomToIsolated, isolationViewMode, onToggleIsolationView, onZoomToInsertionMeter, annotations, annotationMode, arrowStart, onAddNote, onAddArrow, onCancelAnnotationMode, onHighlightAnnotation, onDeleteAnnotation, onEditAnnotation, onZoomToAnnotation, highlightedAnnotationId, annotationsHidden, onToggleAllAnnotations, hiddenAnnotationIds, onToggleAnnotationVisibility }) {
  const { t } = useLanguage();

  return (
    <div className="h-full flex flex-col bg-card border-l border-border">
      <Tabs value={activeTab || "layers"} onValueChange={onTabChange} className="flex flex-col h-full">
        <div className="flex items-center gap-2 m-3 mb-0">
          <TabsList className="grid grid-cols-3 flex-1">
            <TabsTrigger value="layers" className="text-xs gap-1">
              <LayersIcon className="w-3.5 h-3.5" /> {t('panel.layers')}
            </TabsTrigger>
            <TabsTrigger value="dmas" className="text-xs gap-1">
              <Hexagon className="w-3.5 h-3.5" /> {t('panel.dmas')}
            </TabsTrigger>
            <TabsTrigger value="images" className="text-xs gap-1">
              <ImageIcon className="w-3.5 h-3.5" /> Carbon Copy
            </TabsTrigger>
          </TabsList>
          {onClosePanel && (
            <button
              onClick={onClosePanel}
              className="p-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground/90 shrink-0"
              title={t('panel.hidePanel')}
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {/* Layers Tab */}
          <TabsContent value="layers" className="mt-0">
            <LayersPanel
              layers={layers}
              meters={meters}
              onToggleVisibility={onToggleVisibility}
              onDelete={onDeleteLayer}
              onZoomToLayer={onZoomToLayer}
              onEdit={onEditLayer}
              onUpdateLayer={onUpdateLayer}
              onReorder={onReorder}
              clipToBoundary={clipToBoundary}
              onClipToBoundaryChange={onClipToBoundaryChange}
              onCreateManualLayer={onCreateManualLayer}
              onEditManualLayer={onEditManualLayer}
              onRedrawBoundary={onRedrawBoundary}
              onEditBoundary={onEditBoundary}
              locked={locked}
              dmas={dmas}
              isolatedPoints={isolatedPoints}
              distanceUnit={project?.distance_unit}
            />
            <NotesList
              annotations={annotations || []}
              annotationMode={annotationMode}
              arrowStart={arrowStart}
              onAddNote={onAddNote}
              onAddArrow={onAddArrow}
              onCancelMode={onCancelAnnotationMode}
              onHighlight={onHighlightAnnotation}
              onDelete={onDeleteAnnotation}
              onEdit={onEditAnnotation}
              onZoomTo={onZoomToAnnotation}
              highlightedId={highlightedAnnotationId}
              annotationsHidden={annotationsHidden}
              onToggleAllAnnotations={onToggleAllAnnotations}
              hiddenAnnotationIds={hiddenAnnotationIds}
              onToggleAnnotationVisibility={onToggleAnnotationVisibility}
            />
          </TabsContent>

          {/* DMAs Tab */}
          <TabsContent value="dmas" className="mt-0">
            <DmaPanel dmas={dmas} meters={meters} layers={layers} onChanged={onDmaChanged} onStartDraw={onStartDraw} onEditDma={onEditDma} project={project} focusedDmaIds={focusedDmaIds} onToggleFocusDma={onToggleFocusDma} locked={locked} highlightUnassigned={highlightUnassigned} onToggleHighlightUnassigned={onToggleHighlightUnassigned} isolatedMode={isolatedMode} onToggleIsolatedMode={onToggleIsolatedMode} highlightBorderValves={highlightBorderValves} onToggleHighlightBorderValves={onToggleHighlightBorderValves} isolatedPoints={isolatedPoints} onDeleteIsolatedPoint={onDeleteIsolatedPoint} onZoomToIsolated={onZoomToIsolated} onZoomToInsertionMeter={onZoomToInsertionMeter} />
          </TabsContent>

          {/* Image Overlays Tab */}
          <TabsContent value="images" className="mt-0">
            <ImageOverlayPanel
              projectId={project.id}
              overlays={imageOverlays || []}
              onOverlaysChanged={onOverlaysChanged}
              editingOverlayId={editingOverlayId}
              onToggleEdit={onToggleEdit}
              croppingOverlayId={croppingOverlayId}
              onToggleCrop={onToggleCrop}
              mapRef={mapRef}
              locked={locked}
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}