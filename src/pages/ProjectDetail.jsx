import React, { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { uploadFile } from "@/api/storageClient";
import { supabase } from "@/api/supabaseClient";
import { invokeFunction } from "@/api/functionsClient";
import { resolveLayerTypeId } from "@/lib/layerType";
import { ensureMainMetersLayer } from "@/lib/mainMeterLayer";
import { PanelLeftClose, PanelLeftOpen, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import ProjectHeader from "@/components/project/ProjectHeader";
import { analyzeGeoJSON } from "@/lib/geoAnalysis";
import ProjectMap from "@/components/project/ProjectMap";
import ProjectSidePanel from "@/components/project/ProjectSidePanel";
import MeterDataView from "@/components/project/MeterDataView";
import ImportLogsView from "@/components/project/ImportLogsView";
import LayerEditDialog from "@/components/project/LayerEditDialog";
import ProjectNav from "@/components/project/ProjectNav";
import OnboardingWizard from "@/components/project/OnboardingWizard";
import NetworkDesign from "@/components/network/NetworkDesign";
import WetworkInventory from "@/components/wetwork/WetworkInventory";
import InteractiveEstimationPanel from "@/components/project/InteractiveEstimationPanel";
import AutoEstimationProgress from "@/components/project/AutoEstimationProgress";
import EstimationThresholdDialog from "@/components/project/EstimationThresholdDialog";
import ManualLayerDialog from "@/components/project/ManualLayerDialog";
import OnboardingCompleteBanner from "@/components/project/OnboardingCompleteBanner";
import IsolatedPointDialog from "@/components/project/IsolatedPointDialog";
import AnnotationDialog from "@/components/project/AnnotationDialog";
import { buildEstimationQueue, computeEstimationTarget } from "@/lib/estimationQueue";
import { pointInPolygon } from "@/lib/polygonUtils";
import { buildPipeConfig } from "@/lib/pipeStyling";
import { findNearestDmas, buildIsolatedLayerGeoJSON } from "@/lib/isolatedPoints";
import { recordProgress } from "@/lib/progressTracker";
import { reverseGeocode } from "@/lib/reverseGeocode";
import { findNearestPipeDiameter } from "@/lib/nearestPipe";
import { isMeterManualLayer, isInsertionManualLayer } from "@/lib/meterLayerDetection";
import { useLanguage } from "@/lib/i18n";
import ProjectSettingsPage from "@/components/project/ProjectSettingsPage";
import VersionUpdates from "@/components/project/VersionUpdates";
import CustomerAnnotationPanel from "@/components/project/CustomerAnnotationPanel";
import CustomerViewDialog from "@/components/project/CustomerViewDialog";

const BOUNDARY_COLOR = "#6b7280";

const ensureBoundaryLayer = async (project, existingLayers, onCreated) => {
  const hasBoundary = existingLayers.some((l) => /boundary/i.test(l.name));
  if (hasBoundary) return;

  try {
    const res = await invokeFunction("getCityBoundary", {
      city: project.city,
      state: project.state,
      country: project.country,
    });
    const geojson = res.data?.geojson;
    if (!geojson) return;

    const analysis = analyzeGeoJSON(geojson);
    const file = new File(
      [JSON.stringify(geojson)],
      `${project.city}_boundary.geojson`,
      { type: "application/json" }
    );
    const { file_url } = await uploadFile({ file });

    await supabase.from('project_layer').insert({
      project_id: project.id,
      name: `${project.city} Boundary`,
      layer_type: "shp",
      file_url,
      color: BOUNDARY_COLOR,
      visible: true,
      feature_count: analysis?.featureCount || 1,
      geometry_types: analysis?.geometryTypes || [],
      properties: analysis?.propertyNames || [],
      bounds: analysis?.bounds || null,
    });
    recordProgress(project.id, "boundary_set");
    onCreated?.();
  } catch {
    // Best-effort — don't block project view
  }
};

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [project, setProject] = useState(null);
  const [layers, setLayers] = useState([]);
  const [meters, setMeters] = useState([]);
  const [allProjects, setAllProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mapType, setMapType] = useState("terrain");
  const [mapSource, setMapSource] = useState("google");
  const [showImportLogs, setShowImportLogs] = useState(false);
  const [importLogCount, setImportLogCount] = useState(0);
  const [editLayer, setEditLayer] = useState(null);
  const [clipToBoundary, setClipToBoundary] = useState(false);
  const [dmas, setDmas] = useState([]);
  const [drawMode, setDrawMode] = useState(false);
  const [drawTarget, setDrawTarget] = useState("dma"); // "dma" | "boundary"
  const [editDma, setEditDma] = useState(null);
  const [editBoundary, setEditBoundary] = useState(null);
  const [viewMode, setViewMode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get('view');
    return ["gis", "data", "network", "inventory", "settings", "versionUpdates"].includes(v) ? v : "gis";
  }); // "gis" | "data"
  const [panelVisible, setPanelVisible] = useState(true);
  const [focusedDmaIds, setFocusedDmaIds] = useState([]);
  const [highlightUnassigned, setHighlightUnassigned] = useState(false);
  const [focusMeter, setFocusMeter] = useState(null);
  const [focusIsolatedPoint, setFocusIsolatedPoint] = useState(null);
  const mapRef = useRef(null);

  // Interactive estimation state
  const [estimationMode, setEstimationMode] = useState(false);
  const [estimationPhase, setEstimationPhase] = useState(null); // "auto" | "manual" | null
  const [estimationQueue, setEstimationQueue] = useState([]);
  const [autoQueue, setAutoQueue] = useState([]);
  const [autoIndex, setAutoIndex] = useState(0);
  const [manualQueue, setManualQueue] = useState([]);
  const [estimationIndex, setEstimationIndex] = useState(0);
  const [proposedOverride, setProposedOverride] = useState(null);
  const [showThresholdDialog, setShowThresholdDialog] = useState(false);
  const [showManualDialog, setShowManualDialog] = useState(false);
  const [manualEditLayer, setManualEditLayer] = useState(null);
  const [confidenceThreshold, setConfidenceThreshold] = useState(70);
  const autoProcessingRef = useRef(false);
  const [showOnboardingBanner, setShowOnboardingBanner] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [sidePanelTab, setSidePanelTab] = useState("layers");
  const [networkFilter, setNetworkFilter] = useState(null);
  const [imageOverlays, setImageOverlays] = useState([]);
  const [editingOverlayId, setEditingOverlayId] = useState(null);
  const [croppingOverlayId, setCroppingOverlayId] = useState(null);

  // Isolated points state
  const [isolatedMode, setIsolatedMode] = useState(false);
  const [isolatedPoints, setIsolatedPoints] = useState([]);
  const [isolatedDialogValve, setIsolatedDialogValve] = useState(null);
  const [isolationViewMode, setIsolationViewMode] = useState(false);

  // Map annotations state
  const [annotations, setAnnotations] = useState([]);
  const [annotationMode, setAnnotationMode] = useState(null);
  const [arrowStart, setArrowStart] = useState(null);
  const [highlightedAnnotationId, setHighlightedAnnotationId] = useState(null);
  const [annotationDialog, setAnnotationDialog] = useState(null);
  const [annotationsHidden, setAnnotationsHidden] = useState(true);
  const [hiddenAnnotationIds, setHiddenAnnotationIds] = useState([]);

  // Customer annotation state
  const [customerAnnotations, setCustomerAnnotations] = useState([]);
  const [showCustomerAnnotationPanel, setShowCustomerAnnotationPanel] = useState(false);
  const [customerAnnotationsHidden, setCustomerAnnotationsHidden] = useState(true);
  const [hiddenCustomerAnnotationIds, setHiddenCustomerAnnotationIds] = useState([]);
  const [showCustomerViewDialog, setShowCustomerViewDialog] = useState(false);
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem("loggedInUser");
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });

  // Fetch latest user_type from backend (ensures role-based features work even
  // for sessions created before user_type was stored in localStorage)
  useEffect(() => {
    if (!currentUser?.id) return;
    supabase
      .from('system_user')
      .select('*')
      .eq('id', currentUser.id)
      .single()
      .then(({ data: user }) => {
        if (user?.user_type && user.user_type !== currentUser.user_type) {
          const updated = { ...currentUser, user_type: user.user_type };
          setCurrentUser(updated);
          localStorage.setItem("loggedInUser", JSON.stringify(updated));
        }
      });
  }, [currentUser?.id]);

  // Pinpoint (manual map location) state
  const [pinpointMeter, setPinpointMeter] = useState(null);
  const [pinpointCoords, setPinpointCoords] = useState(null);
  const [pinpointAddress, setPinpointAddress] = useState(null);
  const [pinpointLoading, setPinpointLoading] = useState(false);
  const [pinpointDiameter, setPinpointDiameter] = useState(null);

  // Reset manual override when moving to the next meter
  useEffect(() => {
    setProposedOverride(null);
  }, [estimationIndex]);

  const estimationTarget = useMemo(() => {
    if (!estimationMode || estimationPhase !== "manual") return null;
    if (estimationIndex >= manualQueue.length) return null;
    const meterId = manualQueue[estimationIndex];
    const meter = meters.find((m) => m.id === meterId);
    if (!meter || meter.latitude != null) return null;
    const target = computeEstimationTarget(meter, meters);
    if (proposedOverride && target.proposed) {
      return { ...target, proposed: { ...target.proposed, ...proposedOverride } };
    }
    return target;
  }, [estimationMode, estimationPhase, estimationIndex, manualQueue, meters, proposedOverride]);

  // Skip already-located meters during manual phase
  useEffect(() => {
    if (!estimationMode || estimationPhase !== "manual") return;
    if (manualQueue.length === 0) return;
    if (estimationIndex >= manualQueue.length) {
      setEstimationMode(false);
      setEstimationPhase(null);
      return;
    }
    const meterId = manualQueue[estimationIndex];
    const meter = meters.find((m) => m.id === meterId);
    if (meter && meter.latitude != null) {
      setEstimationIndex((i) => i + 1);
    }
  }, [estimationMode, estimationPhase, estimationIndex, manualQueue, meters]);

  // Auto phase: apply pre-computed high-confidence locations sequentially
  useEffect(() => {
    if (!estimationMode || estimationPhase !== "auto") return;
    if (autoIndex >= autoQueue.length) {
      loadMeters();
      const timer = setTimeout(() => {
        if (manualQueue.length > 0) {
          setEstimationPhase("manual");
          setEstimationIndex(0);
        } else {
          setEstimationMode(false);
          setEstimationPhase(null);
        }
      }, 1200);
      return () => clearTimeout(timer);
    }
    if (autoProcessingRef.current) return;
    autoProcessingRef.current = true;

    const item = autoQueue[autoIndex];
    supabase
      .from('meter')
      .update({ latitude: item.lat, longitude: item.lng, location_source: "estimated" })
      .eq('id', item.meterId)
      .then(() => {
        loadMeters();
      })
      .finally(() => {
        autoProcessingRef.current = false;
        setAutoIndex((i) => i + 1);
      });
  }, [estimationMode, estimationPhase, autoIndex, autoQueue, manualQueue]);

  const handleStartInteractiveEstimation = () => {
    const queue = buildEstimationQueue(meters);
    setEstimationQueue(queue);
    setShowThresholdDialog(true);
  };

  const handleStartEstimationWithThreshold = (threshold) => {
    setConfidenceThreshold(threshold);
    // Pre-compute targets and split into auto (pass threshold) and manual (need review)
    const auto = [];
    const manual = [];
    estimationQueue.forEach((meterId) => {
      const meter = meters.find((m) => m.id === meterId);
      if (!meter) return;
      const target = computeEstimationTarget(meter, meters);
      if (target.proposed && target.confidence >= threshold) {
        auto.push({
          meterId,
          lat: target.proposed.latitude,
          lng: target.proposed.longitude,
          confidence: target.confidence,
        });
      } else {
        manual.push(meterId);
      }
    });
    if (auto.length === 0 && manual.length === 0) {
      setShowThresholdDialog(false);
      return;
    }
    autoProcessingRef.current = false;
    setAutoQueue(auto);
    setManualQueue(manual);
    setAutoIndex(0);
    setEstimationIndex(0);
    setEstimationPhase(auto.length > 0 ? "auto" : "manual");
    setEstimationMode(true);
    setViewMode("gis");
    setShowThresholdDialog(false);
  };

  const handleConfirmEstimation = async () => {
    if (!estimationTarget?.proposed) return;
    await supabase.from('meter').update({
      latitude: estimationTarget.proposed.latitude,
      longitude: estimationTarget.proposed.longitude,
      location_source: "estimated",
    }).eq('id', estimationTarget.meter.id);
    loadMeters();
    setEstimationIndex((i) => i + 1);
  };

  const handleSkipEstimation = () => {
    setEstimationIndex((i) => i + 1);
  };

  const handleCloseEstimation = () => {
    setEstimationMode(false);
    setEstimationPhase(null);
    setEstimationQueue([]);
    setAutoQueue([]);
    setManualQueue([]);
    setEstimationIndex(0);
    setAutoIndex(0);
  };

  // DMA meter counts are no longer a stored column — dma_enriched computes
  // them live from meter.dma_id (see migration 20260723100005). This just
  // refreshes local state after estimation runs; there's nothing to persist.
  // NOTE: unlike the original point-in-polygon calculation here, the new
  // view's count is FK-based (from import-time dma_name matches), so it can
  // drift from true geometric membership until DMA membership is upgraded to
  // a live PostGIS point-in-polygon query (tracked as a Phase 3 follow-up).
  const recalculateDmaMeterCounts = async () => {
    if (dmas.length === 0) return;
    loadDmas();
  };

  // When estimation mode turns off (process complete or closed), recalculate DMAs
  useEffect(() => {
    if (!estimationMode && (autoQueue.length > 0 || manualQueue.length > 0)) {
      recalculateDmaMeterCounts();
    }
  }, [estimationMode]);

  const handleZoomToLayer = (layer) => {
    if (!mapRef.current) return;

    if (layer.bounds) {
      const b = layer.bounds;
      mapRef.current.fitBounds(
        [[b.south, b.west], [b.north, b.east]],
        { padding: [50, 50] }
      );
      return;
    }

    // Data layers (meter data) — compute bounds from this layer's meter coordinates
    if (layer.layer_type === "data" && meters.length > 0) {
      const layerMeters = meters.filter((m) =>
        (m.source_file_url && m.source_file_url === layer.file_url) ||
        (m.layer_id && m.layer_id === layer.id)
      );
      const lats = layerMeters.map((m) => m.latitude).filter((v) => v != null);
      const lngs = layerMeters.map((m) => m.longitude).filter((v) => v != null);
      if (lats.length === 0 || lngs.length === 0) return;
      mapRef.current.fitBounds(
        [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]],
        { padding: [50, 50] }
      );
    }
  };

  const handleZoomToProject = () => {
    if (!mapRef.current || !project.latitude || !project.longitude) return;
    mapRef.current.setView([project.latitude, project.longitude], 15);
  };

  const handleToggleMeterMain = async (meterId, newIsMain) => {
    try {
      const updates = { is_main: newIsMain };

      if (newIsMain) {
        updates.layer_id = await ensureMainMetersLayer(id);
      } else {
        updates.layer_id = null;
      }

      await supabase.from('meter').update(updates).eq('id', meterId);
      loadMeters();
      loadLayers();
      loadDmas();
    } catch {}
  };

  // --- Annotation handlers ---
  const handleAddNote = () => { setViewMode("gis"); setAnnotationMode("note"); setArrowStart(null); };
  const handleAddArrow = () => { setViewMode("gis"); setAnnotationMode("arrow"); setArrowStart(null); };
  const handleCancelAnnotation = () => { setAnnotationMode(null); setArrowStart(null); setAnnotationDialog(null); };

  const handleAnnotationMapClick = (lat, lng) => {
    setAnnotationDialog({ type: "note", lat, lng });
    setAnnotationMode(null);
  };

  const handleArrowFirstClick = (lat, lng) => {
    setArrowStart([lat, lng]);
  };

  const handleArrowSecondClick = (lat, lng) => {
    if (!arrowStart) return;
    setAnnotationDialog({ type: "arrow", startLat: arrowStart[0], startLng: arrowStart[1], endLat: lat, endLng: lng });
    setAnnotationMode(null);
    setArrowStart(null);
  };

  const handleSaveAnnotation = async (text) => {
    if (!annotationDialog) return;
    const d = annotationDialog;
    const data = {
      project_id: id,
      note_type: d.type,
      text: text || "",
      start_lat: d.type === "note" ? d.lat : d.startLat,
      start_lng: d.type === "note" ? d.lng : d.startLng,
    };
    if (d.type === "arrow") {
      data.end_lat = d.endLat;
      data.end_lng = d.endLng;
    }
    if (d.editId) {
      await supabase.from('map_note').update({ text: text || "" }).eq('id', d.editId);
    } else {
      await supabase.from('map_note').insert(data);
    }
    setAnnotationDialog(null);
    loadAnnotations();
  };

  const handleDeleteAnnotation = async (annId) => {
    await supabase.from('map_note').delete().eq('id', annId);
    if (highlightedAnnotationId === annId) setHighlightedAnnotationId(null);
    loadAnnotations();
  };

  const handleEditAnnotation = (ann) => {
    setAnnotationDialog({ type: ann.note_type, editId: ann.id, initialText: ann.text || "" });
  };

  const handleHighlightAnnotation = (annId) => {
    setHighlightedAnnotationId((prev) => (prev === annId ? null : annId));
  };

  const handleZoomToAnnotation = (ann) => {
    if (!mapRef.current) return;
    const lat = ann.note_type === "arrow" && ann.end_lat != null ? (ann.start_lat + ann.end_lat) / 2 : ann.start_lat;
    const lng = ann.note_type === "arrow" && ann.end_lng != null ? (ann.start_lng + ann.end_lng) / 2 : ann.start_lng;
    mapRef.current.flyTo([lat, lng], 16, { duration: 0.8 });
    setHighlightedAnnotationId(ann.id);
  };

  const handleToggleAllAnnotations = () => setAnnotationsHidden((v) => !v);

  const handleToggleAnnotationVisibility = (annId) => {
    setHiddenAnnotationIds((prev) => prev.includes(annId) ? prev.filter((id) => id !== annId) : [...prev, annId]);
  };

  const handleToggleAllCustomerAnnotations = () => setCustomerAnnotationsHidden((v) => !v);

  const handleToggleCustomerAnnotationVisibility = (annId) => {
    setHiddenCustomerAnnotationIds((prev) => prev.includes(annId) ? prev.filter((id) => id !== annId) : [...prev, annId]);
  };

  // The embedded relation is aliased to `layer_type_ref` — project_layer
  // already has its own flat `layer_type` column (shp/data), so embedding
  // under the matching table name `layer_type` would silently overwrite it
  // in the response. layer_type_ref.name is flattened onto `category` so
  // every existing consumer that reads `layer.category` (ProjectMap,
  // MeterDataView, pinpoint insertion-meter detection, etc.) keeps working
  // unchanged — the category free-text column became a real layer_type_id
  // FK, fixed once here instead of at every call site.
  const loadLayers = () => {
    supabase
      .from('project_layer')
      .select('*, layer_type_ref:layer_type(name)')
      .eq('project_id', id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setLayers((data || []).map((l) => ({ ...l, category: l.layer_type_ref?.name || null }))));
  };

  const loadMeters = () => {
    invokeFunction("getProjectMeters", { project_id: id })
      .then((res) => setMeters(res.data?.meters || []))
      .catch(() => {});
  };

  // dma_enriched supplies meter_count (no longer a stored column — see
  // recalculateDmaMeterCounts); polygon_json is aliased back to `polygon` so
  // every existing dual-format polygon parser downstream keeps working.
  const loadDmas = () => {
    supabase
      .from('dma_enriched')
      .select('*')
      .eq('project_id', id)
      .order('sort_order')
      .then(({ data }) => setDmas((data || []).map((d) => ({ ...d, polygon: d.polygon_json }))));
  };

  const loadImageOverlays = () => {
    supabase
      .from('image_overlay')
      .select('*')
      .eq('project_id', id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setImageOverlays(data || []));
  };

  const loadIsolatedPoints = () => {
    supabase
      .from('isolated_point')
      .select('*')
      .eq('project_id', id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setIsolatedPoints(data || []));
  };

  const loadAnnotations = () => {
    supabase
      .from('map_note')
      .select('*')
      .eq('project_id', id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setAnnotations(data || []));
  };

  const loadCustomerAnnotations = () => {
    supabase
      .from('customer_annotation')
      .select('*')
      .eq('project_id', id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setCustomerAnnotations(data || []));
  };

  const handleDeleteCustomerAnnotation = async (annotationId) => {
    await supabase.from('customer_annotation').delete().eq('id', annotationId);
    loadCustomerAnnotations();
  };

  const handleFocusCustomerAnnotation = (annotation) => {
    if (!mapRef.current || !annotation?.data) return;
    let data;
    try { data = typeof annotation.data === "string" ? JSON.parse(annotation.data) : annotation.data; } catch { return; }
    if (annotation.annotation_type === "comment") {
      mapRef.current.flyTo([data.lat, data.lng], 17, { duration: 0.6 });
    } else if (annotation.annotation_type === "arrow") {
      mapRef.current.fitBounds(
        [[data.start_lat, data.start_lng], [data.end_lat, data.end_lng]],
        { padding: [80, 80] }
      );
    } else if (annotation.annotation_type === "drawing" && data.points?.length >= 2) {
      const lats = data.points.map(([lat]) => lat);
      const lngs = data.points.map(([, lng]) => lng);
      mapRef.current.fitBounds(
        [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]],
        { padding: [80, 80] }
      );
    }
  };

  const handleOpenCustomerAnnotationPanel = () => {
    setShowCustomerAnnotationPanel(true);
    supabase
      .from('customer_annotation')
      .update({ viewed: true })
      .eq('project_id', id)
      .eq('viewed', false)
      .then(() => {
        setCustomerAnnotations((prev) => prev.map((a) => ({ ...a, viewed: true })));
      });
  };

  // Create or update the "Isolated Valves" project layer so assigned
  // isolation valves appear in the layers panel and can be toggled/exported.
  const upsertIsolatedLayer = async () => {
    try {
      const [{ data: points }, { data: allLayers }] = await Promise.all([
        supabase.from('isolated_point').select('*').eq('project_id', id).order('created_at', { ascending: false }),
        supabase.from('project_layer').select('*').eq('project_id', id),
      ]);
      const existing = (allLayers || []).filter((l) => l.name === "Isolated Valves");

      if (!points || points.length === 0) {
        if (existing.length > 0) {
          await supabase.from('project_layer').delete().eq('id', existing[0].id);
          loadLayers();
        }
        return;
      }

      const geojson = buildIsolatedLayerGeoJSON(points);
      const blob = new Blob([JSON.stringify(geojson)], { type: "application/json" });
      const file = new File([blob], "isolated-valves.geojson", { type: "application/json" });
      const { file_url } = await uploadFile({ file });

      if (existing.length > 0) {
        await supabase.from('project_layer').update({
          file_url,
          feature_count: points.length,
        }).eq('id', existing[0].id);
      } else {
        await supabase.from('project_layer').insert({
          project_id: id,
          name: "Isolated Valves",
          layer_type_id: await resolveLayerTypeId("Valves"),
          layer_type: "shp",
          file_url,
          color: "#92c141",
          visible: true,
          feature_count: points.length,
          geometry_types: ["Point"],
          sort_order: 999,
        });
      }
      loadLayers();
    } catch (err) {
      console.error("Failed to update isolated layer:", err);
    }
  };

  const handleImageOverlayBoundsChange = async (overlay, newBounds) => {
    await supabase.from('image_overlay').update({ bounds: newBounds }).eq('id', overlay.id);
    loadImageOverlays();
  };

  const handleCropApplied = async (overlay, newFileUrl, newBounds) => {
    await supabase.from('image_overlay').update({ file_url: newFileUrl, bounds: newBounds }).eq('id', overlay.id);
    setCroppingOverlayId(null);
    loadImageOverlays();
  };

  const handleDmaCreated = () => {
    recordProgress(id, "dmas_created");
    loadDmas();
  };

  const handleValveClick = (valveInfo) => {
    const nearest = findNearestDmas(valveInfo.latitude, valveInfo.longitude, dmas, 2);
    setIsolatedDialogValve({ ...valveInfo, nearestDmas: nearest });
  };

  const handleAssignIsolatedPoint = async (data) => {
    await supabase.from('isolated_point').insert({ ...data, project_id: id });
    loadIsolatedPoints();
    upsertIsolatedLayer();
  };

  const handleDeleteIsolatedPoint = async (pointId) => {
    await supabase.from('isolated_point').delete().eq('id', pointId);
    loadIsolatedPoints();
    upsertIsolatedLayer();
  };

  const handleZoomToIsolated = (ip) => {
    if (!mapRef.current || !ip?.latitude || !ip?.longitude) return;
    mapRef.current.flyTo([ip.latitude, ip.longitude], 17, { duration: 0.8 });
    setFocusIsolatedPoint(ip);
  };

  const handleZoomToInsertionMeter = (meter) => {
    if (!mapRef.current || !meter?.latitude || !meter?.longitude) return;
    mapRef.current.flyTo([meter.latitude, meter.longitude], 17, { duration: 0.8 });
    setFocusMeter(meter);
  };

  const handleToggleIsolatedMode = () => {
    setIsolatedMode((v) => !v);
  };

  const handleToggleIsolationView = () => {
    setViewMode("gis");
    setIsolationViewMode((v) => !v);
  };

  const loadImportLogCount = () => {
    supabase
      .from('import_log')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', id)
      .then(({ count }) => setImportLogCount(count || 0));
  };

  useEffect(() => {
    Promise.all([
      supabase.from('project').select('*').eq('id', id).single(),
      supabase.from('project_layer').select('*, layer_type_ref:layer_type(name)').eq('project_id', id).order('created_at', { ascending: false }),
      invokeFunction("getProjectMeters", { project_id: id }).then((res) => res.data?.meters || []),
    ])
      .then(([{ data: p }, { data: rawLayers }, m]) => {
        const l = (rawLayers || []).map((layer) => ({ ...layer, category: layer.layer_type_ref?.name || null }));
        setProject(p);
        setLayers(l);
        setMeters(m);
        supabase.from('project').select('*').order('created_at', { ascending: false }).then(({ data }) => setAllProjects(data || []));
        ensureBoundaryLayer(p, l, loadLayers);
        loadImportLogCount();
        loadDmas();
        loadImageOverlays();
        loadIsolatedPoints();
        loadAnnotations();
        loadCustomerAnnotations();
      })
      .catch(() => setProject(null))
      .finally(() => setLoading(false));
  }, [id]);

  const handleLayerUploaded = async (layerType) => {
    loadLayers();
    loadMeters();
    if (layerType === "shp") recordProgress(id, "gis_layers_uploaded");
    if (layerType === "data") recordProgress(id, "meters_imported");
  };

  const handleToggleVisibility = async (layer) => {
    await supabase.from('project_layer').update({ visible: !layer.visible }).eq('id', layer.id);
    loadLayers();
  };

  const handleDeleteLayer = async (layer) => {
    await supabase.from('project_layer').delete().eq('id', layer.id);
    // For data layers, also delete all meters and consumption readings sourced from this layer's file
    if (layer.layer_type === "data" && layer.file_url) {
      await supabase.from('consumption_reading').delete().eq('project_id', id).eq('source_file_url', layer.file_url);
      await supabase.from('meter').delete().eq('project_id', id).eq('source_file_url', layer.file_url);
      loadMeters();
    }
    loadLayers();
  };

  const handleUpdateLayer = async (layer, data) => {
    await supabase.from('project_layer').update(data).eq('id', layer.id);
    loadLayers();
  };

  const handleCreateManualLayer = () => setShowManualDialog(true);

  const handleManualLayerCreated = (layer) => {
    setDrawMode(false);
    setEditDma(null);
    setViewMode("gis");
    setManualEditLayer(layer);
    loadLayers();
  };

  const handleEditManualLayer = (layer) => {
    setDrawMode(false);
    setEditDma(null);
    setViewMode("gis");
    setManualEditLayer(layer);
  };

  const handleSaveManualLayer = async (layer, points, lines) => {
    const isLineLayer = layer.geometry_types?.includes("LineString");

    if (isLineLayer) {
      const features = (lines || []).map((line) => ({
        type: "Feature",
        geometry: { type: "LineString", coordinates: line.points.map(([lat, lng]) => [lng, lat]) },
        properties: { diameter: line.diameter || "", location_source: "manual" },
      }));
      const lineGeojson = { type: "FeatureCollection", features };
      const file = new File([JSON.stringify(lineGeojson)], `${layer.name}_manual.geojson`, { type: "application/json" });
      const { file_url } = await uploadFile({ file });
      const allPoints = (lines || []).flatMap((l) => l.points);
      const bounds = allPoints.length > 0 ? {
        north: Math.max(...allPoints.map(([lat]) => lat)),
        south: Math.min(...allPoints.map(([lat]) => lat)),
        east: Math.max(...allPoints.map(([, lng]) => lng)),
        west: Math.min(...allPoints.map(([, lng]) => lng)),
      } : null;
      const pipeConfig = buildPipeConfig(lineGeojson, "diameter");
      await supabase.from('project_layer').update({
        file_url,
        feature_count: features.length,
        geometry_types: ["LineString"],
        properties: ["diameter"],
        bounds,
        pipe_config: pipeConfig,
      }).eq('id', layer.id);
      setManualEditLayer(null);
      loadLayers();
      return;
    }

    const geojson = {
      type: "FeatureCollection",
      features: points.map((p) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.lng, p.lat] },
        properties: { name: p.name || "Unnamed", id: p.id, location_source: "manual", endpoint_id: p.endpoint_id || "", account_name: p.account_name || "", address: p.address || "" },
      })),
    };
    const file = new File([JSON.stringify(geojson)], `${layer.name}_manual.geojson`, { type: "application/json" });
    const { file_url } = await uploadFile({ file });
    const bounds = points.length > 0 ? {
      north: Math.max(...points.map((p) => p.lat)),
      south: Math.min(...points.map((p) => p.lat)),
      east: Math.max(...points.map((p) => p.lng)),
      west: Math.min(...points.map((p) => p.lng)),
    } : null;
    await supabase.from('project_layer').update({
      file_url,
      feature_count: points.length,
      bounds,
    }).eq('id', layer.id);

    // Insertion Meters / Ultrasonic Meter layers: sync points as Main Meter
    // records. In production the earlier "delete by filter then insert"
    // approach was silently deleting ZERO rows on every save (a filtered
    // DELETE that returned no error but matched nothing), so each save piled
    // 2 more duplicate meters onto the map. To make this bulletproof:
    //   1. SELECT the layer's existing meter ids (both linkage styles —
    //      layer_id, or the layer's previous file_url for Base44-imported
    //      rows that predate the layer_id FK; `layer.file_url` is the old
    //      value since `layer` is the pre-edit object).
    //   2. DELETE them by primary key (the most reliable filter).
    //   3. VERIFY they're actually gone before inserting. If any remain,
    //      abort WITHOUT inserting — never duplicate silently.
    if (isMeterManualLayer(layer)) {
      // Collect existing meter ids for this layer via two simple equality
      // selects (by layer_id, and by the layer's previous file_url for any
      // legacy rows) — avoids a fragile `.or()` filter that embeds a full URL.
      const idSet = new Set();
      const { data: byLayer, error: selError } = await supabase
        .from('meter').select('id').eq('project_id', id).eq('layer_id', layer.id);
      if (selError) {
        alert(`Your points were saved but meter markers couldn't be refreshed (${selError.message}). Please reload and try again — nothing was duplicated.`);
        setManualEditLayer(null);
        loadLayers();
        return;
      }
      (byLayer || []).forEach((r) => idSet.add(r.id));
      if (layer.file_url) {
        const { data: byUrl } = await supabase
          .from('meter').select('id').eq('project_id', id).eq('source_file_url', layer.file_url);
        (byUrl || []).forEach((r) => idSet.add(r.id));
      }
      const existingIds = [...idSet];
      if (existingIds.length > 0) {
        await supabase.from('meter').delete().in('id', existingIds);
        // Verify the delete actually removed them — a no-op delete here is
        // exactly what caused runaway duplication.
        const { data: stillThere } = await supabase
          .from('meter')
          .select('id')
          .in('id', existingIds);
        if (stillThere && stillThere.length > 0) {
          alert(
            `Your points were saved, but the old meter markers could not be removed ` +
            `(you may not have permission, or your session expired). Nothing was ` +
            `duplicated. Please reload the page and try again.`
          );
          setManualEditLayer(null);
          loadLayers();
          return;
        }
      }
      if (points.length > 0) {
        const usedUids = new Set();
        const meterRecords = points.map((p, idx) => {
          let uid = p.name?.trim() || `INSERT-${idx + 1}`;
          while (usedUids.has(uid)) uid = `${uid}-${idx + 1}`;
          usedUids.add(uid);
          return {
            project_id: id,
            uid,
            is_main: true,
            endpoint_id: p.endpoint_id || "",
            payer_name: p.account_name || "",
            address: p.address || "",
            latitude: p.lat,
            longitude: p.lng,
            layer_id: layer.id,
            source_file_url: file_url,
          };
        });
        const { error: insError } = await supabase.from('meter').insert(meterRecords);
        if (insError) {
          alert(`Could not save meter markers: ${insError.message}. Please reload and try again.`);
        }
      }
      loadMeters();
    }

    setManualEditLayer(null);
    loadLayers();
  };

  const handleCancelManualLayer = () => setManualEditLayer(null);

  const saveBoundary = async (points) => {
    const ring = points.map(([lat, lng]) => [lng, lat]);
    ring.push(ring[0]); // close the polygon
    const geojson = {
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [ring] },
        properties: { name: "Boundary" },
      }],
    };
    const file = new File([JSON.stringify(geojson)], `${project.city}_boundary.geojson`, { type: "application/json" });
    const { file_url } = await uploadFile({ file });
    const bounds = {
      north: Math.max(...points.map(([lat]) => lat)),
      south: Math.min(...points.map(([lat]) => lat)),
      east: Math.max(...points.map(([, lng]) => lng)),
      west: Math.min(...points.map(([, lng]) => lng)),
    };
    const existing = layers.find((l) => /boundary/i.test(l.name));
    if (existing) {
      await supabase.from('project_layer').update({
        file_url, bounds, feature_count: 1, geometry_types: ["Polygon"],
      }).eq('id', existing.id);
    } else {
      await supabase.from('project_layer').insert({
        project_id: id,
        name: `${project.city} Boundary`,
        layer_type: "shp",
        file_url,
        color: BOUNDARY_COLOR,
        visible: true,
        feature_count: 1,
        geometry_types: ["Polygon"],
        properties: [],
        bounds,
      });
    }
    loadLayers();
  };

  const handleStartRedrawBoundary = () => {
    setViewMode("gis");
    setEditDma(null);
    setEditBoundary(null);
    setDrawTarget("boundary");
    setDrawMode(true);
  };

  const handleBoundaryDrawn = async (points) => {
    await saveBoundary(points);
    recordProgress(id, "boundary_set");
    setDrawTarget("dma");
  };

  const handleStartEditBoundary = (layer) => {
    setViewMode("gis");
    setDrawMode(false);
    setEditDma(null);
    setEditBoundary(layer);
  };

  const [refetchingBoundary, setRefetchingBoundary] = useState(false);

  const handleRefetchBoundary = async () => {
    setRefetchingBoundary(true);
    try {
      const res = await invokeFunction("getCityBoundary", {
        city: project.city,
        state: project.state,
        country: project.country,
      });
      const geojson = res.data?.geojson;
      if (!geojson) return;

      const analysis = analyzeGeoJSON(geojson);
      const file = new File(
        [JSON.stringify(geojson)],
        `${project.city}_boundary.geojson`,
        { type: "application/json" }
      );
      const { file_url } = await uploadFile({ file });

      const existing = layers.find((l) => /boundary/i.test(l.name));
      if (existing) {
        await supabase.from('project_layer').update({
          file_url,
          bounds: analysis?.bounds || null,
          feature_count: analysis?.featureCount || 1,
          geometry_types: analysis?.geometryTypes || [],
          properties: analysis?.propertyNames || [],
        }).eq('id', existing.id);
      } else {
        await supabase.from('project_layer').insert({
          project_id: id,
          name: `${project.city} Boundary`,
          layer_type: "shp",
          file_url,
          color: BOUNDARY_COLOR,
          visible: true,
          feature_count: analysis?.featureCount || 1,
          geometry_types: analysis?.geometryTypes || [],
          properties: analysis?.propertyNames || [],
          bounds: analysis?.bounds || null,
        });
      }
      recordProgress(id, "boundary_set");
      setEditBoundary(null);
      loadLayers();
    } catch {
    } finally {
      setRefetchingBoundary(false);
    }
  };

  const handleBoundaryEditSave = async (points) => {
    await saveBoundary(points);
    recordProgress(id, "boundary_set");
    setEditBoundary(null);
  };

  const handleBoundaryEditCancel = () => setEditBoundary(null);

  const handleCompleteOnboarding = async () => {
    const { error } = await supabase.from('project').update({ onboarding_complete: true }).eq('id', id);
    if (error) return;
    recordProgress(id, "onboarding_completed");
    setProject((p) => ({ ...p, onboarding_complete: true }));
    setShowOnboardingBanner(true);
  };

  const handleNetworkNodeClick = (node) => {
    if (node.node_type === "source") {
      setNetworkFilter({ type: "all" });
    } else if (node.node_type === "orphans") {
      setNetworkFilter({ type: "orphans" });
    } else if (node.dma_id) {
      setNetworkFilter({ type: "dma", dmaId: node.dma_id });
    }
    setViewMode("data");
  };

  const handleViewModeChange = (mode, panelTab) => {
    if (mode !== "data") setNetworkFilter(null);
    setViewMode(mode);
    if (panelTab) setSidePanelTab(panelTab);
  };

  const handleUpdateProjectSettings = async (data) => {
    const { error } = await supabase.from('project').update(data).eq('id', id);
    if (!error) setProject((p) => ({ ...p, ...data }));
  };

  const handleAnomalyExported = async () => {
    if (project?.anomaly_reports_exported) return;
    const { error } = await supabase.from('project').update({ anomaly_reports_exported: true }).eq('id', id);
    if (!error) setProject((p) => ({ ...p, anomaly_reports_exported: true }));
  };

  // Compute unassigned sub-meter IDs (not inside any DMA polygon) for map highlighting
  const unassignedMeterIds = useMemo(() => {
    if (!highlightUnassigned) return null;
    const parsePoly = (dma) => {
      try {
        const poly = typeof dma.polygon === "string" ? JSON.parse(dma.polygon) : dma.polygon;
        return Array.isArray(poly) && poly.length >= 3 ? poly : null;
      } catch { return null; }
    };
    const dmaPolys = (dmas || []).map(parsePoly).filter(Boolean);
    if (dmaPolys.length === 0) return null;
    const ids = new Set();
    for (const m of (meters || [])) {
      if (m.is_main) continue;
      if (m.latitude == null || m.longitude == null) continue;
      const assigned = dmaPolys.some((poly) => pointInPolygon(m.latitude, m.longitude, poly));
      if (!assigned) ids.add(m.id);
    }
    return ids;
  }, [highlightUnassigned, dmas, meters]);

  const handleViewMeterOnMap = (meter) => {
    setFocusMeter(meter);
    setViewMode("gis");
  };

  const handleStartPinpoint = (meter) => {
    setPinpointMeter(meter);
    setPinpointCoords(null);
    setPinpointAddress(null);
    setPinpointDiameter(null);
    setViewMode("gis");
  };

  const handlePinpointPlaced = async (lat, lng) => {
    setPinpointCoords([lat, lng]);
    setPinpointLoading(true);
    setPinpointAddress(null);
    setPinpointDiameter(null);

    // Check if this is an insertion meter — only fetch pipe diameter for those
    const insertionLayerIds = new Set(
      layers.filter(isInsertionManualLayer).map((l) => l.id)
    );
    const isInsertionMeter =
      pinpointMeter?.is_main &&
      pinpointMeter?.layer_id &&
      insertionLayerIds.has(pinpointMeter.layer_id);

    try {
      const tasks = [reverseGeocode(lat, lng).catch(() => null)];
      if (isInsertionMeter) {
        tasks.push(findNearestPipeDiameter(lat, lng, layers));
      }
      const [address, pipeResult] = await Promise.all(tasks);
      setPinpointAddress(address);
      if (pipeResult?.diameter) {
        setPinpointDiameter(pipeResult.diameter);
      }
    } catch {
      setPinpointAddress(null);
    } finally {
      setPinpointLoading(false);
    }
  };

  const handlePinpointConfirm = async () => {
    if (!pinpointMeter || !pinpointCoords) return;
    const [lat, lng] = pinpointCoords;
    try {
      const updateData = {
        latitude: lat,
        longitude: lng,
        address: pinpointAddress || pinpointMeter.address || null,
        location_source: "geocoded",
      };
      if (pinpointDiameter !== null) {
        const parsed = parseFloat(pinpointDiameter);
        updateData.diameter = !isNaN(parsed) ? parsed : null;
      }
      await supabase.from('meter').update(updateData).eq('id', pinpointMeter.id);
      loadMeters();
      setPinpointMeter(null);
      setPinpointCoords(null);
      setPinpointAddress(null);
      setPinpointDiameter(null);
      setViewMode("data");
    } catch {}
  };

  const handlePinpointCancel = () => {
    setPinpointMeter(null);
    setPinpointCoords(null);
    setPinpointAddress(null);
    setPinpointDiameter(null);
    setViewMode("data");
  };

  const handleToggleFocusDma = (dmaId, clearAll) => {
    if (clearAll || dmaId === null) {
      setFocusedDmaIds([]);
      return;
    }
    setFocusedDmaIds((prev) =>
      prev.includes(dmaId)
        ? prev.filter((id) => id !== dmaId)
        : [...prev, dmaId]
    );
  };

  const handleReorderLayers = async (reorderedLayers) => {
    // Boundary layers stay locked at top (sort_order 0), non-boundary layers follow
    const boundaryLayers = layers.filter((l) => /boundary/i.test(l.name));
    const allReordered = [...boundaryLayers, ...reorderedLayers];
    setLayers(allReordered.map((l, i) => ({ ...l, sort_order: i })));
    try {
      // Each layer gets a different sort_order, so this can't be a single
      // bulk update — one call per row.
      await Promise.all(
        allReordered.map((l, i) => supabase.from('project_layer').update({ sort_order: i }).eq('id', l.id))
      );
    } catch (err) {
      console.error("Failed to persist layer order:", err);
      loadLayers();
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-background">
        <p className="text-slate-600 mb-4">{t('project.notFound')}</p>
        <Button onClick={() => navigate("/")}>{t('project.backToDashboard')}</Button>
      </div>
    );
  }

  const isLocked = !!project.locked || !!project.onboarding_complete;

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Header — project detail + actions */}
      <ProjectHeader
        project={project}
        locked={!!project.locked}
        onZoomToProject={handleZoomToProject}
        onLogoClick={() => handleViewModeChange("gis")}
        currentUser={currentUser}
        siblingProjects={
          project.parent_project_name
            ? allProjects.filter(
                (p) => p.parent_project_name === project.parent_project_name && p.id !== project.id && !p.archived
              )
            : []
        }
      />

      {/* Main — nav sidebar + side panel + content area */}
      <div className="flex-1 flex overflow-hidden">
        <ProjectNav viewMode={viewMode} onChange={handleViewModeChange} onImportData={() => navigate(`/project/${id}/upload`)} locked={isLocked} onOpenWizard={() => setShowWizard(true)} onOpenCustomerView={() => setShowCustomerViewDialog(true)} customerAnnotationCount={customerAnnotations.filter(a => !a.viewed).length} currentUser={currentUser} />

        <div className="flex-1 relative">
          {viewMode === "gis" ? (
            <>
              {/* Floating button to reopen side panel when hidden */}
              {!panelVisible && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setPanelVisible(true)}
                  className="absolute top-3 right-3 z-[1001] bg-card/95 backdrop-blur shadow-lg"
                  title="Show side panel"
                >
                  <PanelLeftOpen className="w-4 h-4" />
                </Button>
              )}
              <ProjectMap
                project={project}
                layers={layers}
                meters={meters}
                mapType={mapType}
                setMapType={setMapType}
                mapSource={mapSource}
                setMapSource={setMapSource}
                onToggleVisibility={handleToggleVisibility}
                mapRef={mapRef}
                onLayerUpdated={loadLayers}
                clipToBoundary={clipToBoundary}
                dmas={estimationMode ? [] : dmas}
                onDmaCreated={handleDmaCreated}
                drawMode={drawMode}
                  setDrawMode={setDrawMode}
                  drawTarget={drawTarget}
                  onBoundaryDrawn={handleBoundaryDrawn}
                  editDma={editDma}
                setEditDma={setEditDma}
                estimationTarget={estimationTarget}
                onDragProposed={(lat, lng) => setProposedOverride({ latitude: lat, longitude: lng })}
                manualEditLayer={manualEditLayer}
                onSaveManualLayer={handleSaveManualLayer}
                onCancelManualLayer={handleCancelManualLayer}
                focusedDmaIds={focusedDmaIds}
                onToggleFocusDma={handleToggleFocusDma}
                highlightedMeterIds={unassignedMeterIds}
                focusMeter={focusMeter}
                focusIsolatedPoint={focusIsolatedPoint}
                editBoundary={editBoundary}
                onBoundaryEditSave={handleBoundaryEditSave}
                onBoundaryEditCancel={handleBoundaryEditCancel}
                onRedrawBoundary={handleStartRedrawBoundary}
                onRefetchBoundary={handleRefetchBoundary}
                refetchingBoundary={refetchingBoundary}
                pinpointMeter={pinpointMeter}
                pinpointCoords={pinpointCoords}
                onPinpointPlaced={handlePinpointPlaced}
                pinpointAddress={pinpointAddress}
                pinpointLoading={pinpointLoading}
                pinpointDiameter={pinpointDiameter}
                onPinpointDiameterChange={setPinpointDiameter}
                onPinpointConfirm={handlePinpointConfirm}
                onPinpointCancel={handlePinpointCancel}
                imageOverlays={imageOverlays}
                editingOverlayId={editingOverlayId}
                onImageOverlayBoundsChange={handleImageOverlayBoundsChange}
                croppingOverlayId={croppingOverlayId}
                onCropApplied={handleCropApplied}
                onCropCancel={() => setCroppingOverlayId(null)}
                isolatedMode={isolatedMode}
                isolatedPoints={isolatedPoints}
                onValveClick={handleValveClick}
                onDeleteIsolatedPoint={handleDeleteIsolatedPoint}
                onExitIsolatedMode={handleToggleIsolatedMode}
                isolationViewMode={isolationViewMode}
                onToggleMeterMain={handleToggleMeterMain}
                annotations={annotations}
                annotationMode={annotationMode}
                onAnnotationClick={handleAnnotationMapClick}
                onArrowFirstClick={handleArrowFirstClick}
                onArrowSecondClick={handleArrowSecondClick}
                arrowStart={arrowStart}
                highlightedAnnotationId={highlightedAnnotationId}
                onCancelAnnotation={handleCancelAnnotation}
                customerAnnotations={customerAnnotations}
                annotationsHidden={annotationsHidden}
                hiddenAnnotationIds={hiddenAnnotationIds}
                customerAnnotationsHidden={customerAnnotationsHidden}
                hiddenCustomerAnnotationIds={hiddenCustomerAnnotationIds}
              />
              {/* Customer annotation viewer — bottom left */}
              <button
                onClick={handleOpenCustomerAnnotationPanel}
                className="absolute bottom-3 left-3 z-[1000] flex items-center justify-center w-11 h-11 bg-card/95 backdrop-blur rounded-lg shadow-lg border border-border text-muted-foreground hover:bg-muted transition-colors"
                title="Customer annotations"
              >
                <MessageSquare className="w-5 h-5" />
                {customerAnnotations.filter(a => !a.viewed).length > 0 && (
                  <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full ring-2 ring-card">
                    {customerAnnotations.filter(a => !a.viewed).length > 99 ? "99+" : customerAnnotations.filter(a => !a.viewed).length}
                  </span>
                )}
              </button>
              {showCustomerAnnotationPanel && (
                <CustomerAnnotationPanel
                  annotations={customerAnnotations}
                  onDelete={handleDeleteCustomerAnnotation}
                  onFocus={handleFocusCustomerAnnotation}
                  onClose={() => setShowCustomerAnnotationPanel(false)}
                  annotationsHidden={customerAnnotationsHidden}
                  onToggleAll={handleToggleAllCustomerAnnotations}
                  hiddenIds={hiddenCustomerAnnotationIds}
                  onToggleVisibility={handleToggleCustomerAnnotationVisibility}
                />
              )}

              {estimationMode && estimationPhase === "auto" && (
                <AutoEstimationProgress
                  current={autoIndex}
                  total={autoQueue.length}
                  manualCount={manualQueue.length}
                  threshold={confidenceThreshold}
                />
              )}
              {estimationMode && estimationPhase === "manual" && (
                <InteractiveEstimationPanel
                  target={estimationTarget}
                  index={estimationIndex}
                  total={manualQueue.length}
                  onConfirm={handleConfirmEstimation}
                  onSkip={handleSkipEstimation}
                  onClose={handleCloseEstimation}
                />
              )}
            </>
          ) : viewMode === "settings" ? (
            <ProjectSettingsPage project={project} onUpdate={handleUpdateProjectSettings} locked={!!project.locked} currentUser={currentUser} />
          ) : viewMode === "versionUpdates" ? (
            <VersionUpdates project={project} currentUser={currentUser} projects={allProjects} />
          ) : viewMode === "network" ? (
            <NetworkDesign project={project} dmas={dmas} layers={layers} meters={meters} onNodeClick={handleNetworkNodeClick} locked={isLocked} />
          ) : viewMode === "inventory" ? (
            <WetworkInventory project={project} layers={layers} dmas={dmas} meters={meters} isolatedPoints={isolatedPoints} />
          ) : (
            <MeterDataView projectId={id} project={project} dmas={dmas} layers={layers} onMetersUpdated={() => { loadMeters(); loadDmas(); loadLayers(); }} onStartInteractiveEstimation={handleStartInteractiveEstimation} locked={isLocked} onAnomalyExported={handleAnomalyExported} onViewOnMap={handleViewMeterOnMap} onPinpoint={handleStartPinpoint} networkFilter={networkFilter} onClearNetworkFilter={() => setNetworkFilter(null)} />
          )}
        </div>

        {viewMode === "gis" && panelVisible && (
          <aside className="w-[340px] shrink-0 hidden md:block">
            <ProjectSidePanel
              project={project}
              layers={layers}
              meters={meters}
              onToggleVisibility={handleToggleVisibility}
              onDeleteLayer={handleDeleteLayer}
              onZoomToLayer={handleZoomToLayer}
              onEditLayer={setEditLayer}
              onUpdateLayer={handleUpdateLayer}
              onReorder={handleReorderLayers}
              clipToBoundary={clipToBoundary}
              onClipToBoundaryChange={setClipToBoundary}
              dmas={dmas}
              onDmaChanged={loadDmas}
              onStartDraw={() => { setDrawTarget("dma"); setEditDma(null); setDrawMode(true); }}
              onRedrawBoundary={handleStartRedrawBoundary}
              onEditBoundary={handleStartEditBoundary}
              onEditDma={(dma) => { setDrawMode(false); setEditDma(dma); }}
              onCreateManualLayer={handleCreateManualLayer}
              onEditManualLayer={handleEditManualLayer}
              focusedDmaIds={focusedDmaIds}
              onToggleFocusDma={handleToggleFocusDma}
              locked={isLocked}
              onClosePanel={() => setPanelVisible(false)}
              highlightUnassigned={highlightUnassigned}
              onToggleHighlightUnassigned={() => setHighlightUnassigned((v) => !v)}
              isolatedMode={isolatedMode}
              onToggleIsolatedMode={handleToggleIsolatedMode}
              isolationViewMode={isolationViewMode}
              onToggleIsolationView={handleToggleIsolationView}
              isolatedPoints={isolatedPoints}
              onDeleteIsolatedPoint={handleDeleteIsolatedPoint}
              onZoomToIsolated={handleZoomToIsolated}
              onZoomToInsertionMeter={handleZoomToInsertionMeter}
              activeTab={sidePanelTab}
              onTabChange={setSidePanelTab}
              imageOverlays={imageOverlays}
              onOverlaysChanged={loadImageOverlays}
              editingOverlayId={editingOverlayId}
              onToggleEdit={(id) => { setEditingOverlayId(id); if (id) setCroppingOverlayId(null); }}
              croppingOverlayId={croppingOverlayId}
              onToggleCrop={(id) => { setCroppingOverlayId(id); if (id) setEditingOverlayId(null); }}
              mapRef={mapRef}
              annotations={annotations}
              annotationMode={annotationMode}
              arrowStart={arrowStart}
              onAddNote={handleAddNote}
              onAddArrow={handleAddArrow}
              onCancelAnnotationMode={handleCancelAnnotation}
              onHighlightAnnotation={handleHighlightAnnotation}
              onDeleteAnnotation={handleDeleteAnnotation}
              onEditAnnotation={handleEditAnnotation}
              onZoomToAnnotation={handleZoomToAnnotation}
              highlightedAnnotationId={highlightedAnnotationId}
              annotationsHidden={annotationsHidden}
              onToggleAllAnnotations={handleToggleAllAnnotations}
              hiddenAnnotationIds={hiddenAnnotationIds}
              onToggleAnnotationVisibility={handleToggleAnnotationVisibility}
              />
          </aside>
        )}
      </div>

      <ImportLogsView
        open={showImportLogs}
        onOpenChange={setShowImportLogs}
        projectId={id}
        onCleared={() => setImportLogCount(0)}
      />
      <LayerEditDialog
        open={!!editLayer}
        onOpenChange={(open) => !open && setEditLayer(null)}
        layer={editLayer}
        onSaved={loadLayers}
      />
      <EstimationThresholdDialog
        open={showThresholdDialog}
        onOpenChange={setShowThresholdDialog}
        onStart={handleStartEstimationWithThreshold}
        queueLength={estimationQueue.length}
      />
      <ManualLayerDialog
        open={showManualDialog}
        onOpenChange={setShowManualDialog}
        projectId={id}
        onCreated={handleManualLayerCreated}
        nextSortOrder={layers.length}
      />
      <OnboardingCompleteBanner
        show={showOnboardingBanner}
        onClose={() => setShowOnboardingBanner(false)}
      />
      <OnboardingWizard
        open={showWizard}
        onOpenChange={setShowWizard}
        projectId={id}
        onChange={handleViewModeChange}
        onImportData={() => navigate(`/project/${id}/upload`)}
      />
      <IsolatedPointDialog
        open={!!isolatedDialogValve}
        onOpenChange={(v) => { if (!v) setIsolatedDialogValve(null); }}
        valveInfo={isolatedDialogValve}
        dmas={dmas}
        nearestDmas={isolatedDialogValve?.nearestDmas}
        onAssigned={handleAssignIsolatedPoint}
      />
      <AnnotationDialog
        open={!!annotationDialog}
        type={annotationDialog?.type}
        onClose={handleCancelAnnotation}
        onSave={handleSaveAnnotation}
        initialText={annotationDialog?.initialText}
        isEdit={!!annotationDialog?.editId}
      />
      <CustomerViewDialog
        open={showCustomerViewDialog}
        onOpenChange={setShowCustomerViewDialog}
        projectId={id}
        projectName={project?.name}
      />
    </div>
  );
}