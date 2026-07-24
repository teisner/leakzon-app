import React from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Layers, Check, AlertCircle } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

export default function ZipLayerReview({ zipLayers, setZipLayers, layerTypes }) {
  const { t } = useLanguage();

  const updateLayer = (index, field, value) => {
    setZipLayers((prev) => prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
  };

  const toggleSelected = (index) => {
    setZipLayers((prev) => prev.map((l, i) => (i === index ? { ...l, selected: !l.selected } : l)));
  };

  const toggleAll = () => {
    const allSelected = zipLayers.every((l) => l.selected);
    setZipLayers((prev) => prev.map((l) => ({ ...l, selected: !allSelected })));
  };

  const selectedCount = zipLayers.filter((l) => l.selected).length;
  const selectedFeatures = zipLayers.filter((l) => l.selected).reduce((sum, l) => sum + (l.analysis?.featureCount || 0), 0);
  const totalFeatures = zipLayers.reduce((sum, l) => sum + (l.analysis?.featureCount || 0), 0);
  const categorized = zipLayers.filter((l) => l.category).length;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 bg-primary/10 border border-primary/20 rounded-lg p-3">
        <Layers className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-foreground">
            {t('upload.zipLayersFound', { count: zipLayers.length })}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t('upload.totalFeatures', { count: totalFeatures })} · {categorized}/{zipLayers.length} {t('upload.categorized')}
          </p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{t('upload.zipReviewHint')}</p>

      <div className="flex items-center gap-2">
        <Checkbox
          checked={selectedCount === zipLayers.length}
          onCheckedChange={toggleAll}
          id="select-all"
        />
        <label htmlFor="select-all" className="text-sm font-medium text-foreground cursor-pointer">
          {t('upload.selectAll')} ({selectedCount}/{zipLayers.length})
        </label>
        {selectedCount > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">
            {t('upload.totalFeatures', { count: selectedFeatures })}
          </span>
        )}
      </div>

      <div className="space-y-2.5 max-h-[45vh] overflow-y-auto pr-1">
        {zipLayers.map((layer, i) => (
          <div key={i} className={`border rounded-lg p-3 space-y-2 bg-card transition-opacity ${layer.selected ? "border-border opacity-100" : "border-border opacity-50"}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Checkbox
                  checked={layer.selected}
                  onCheckedChange={() => toggleSelected(i)}
                />
                <Input
                  value={layer.name}
                  onChange={(e) => updateLayer(i, "name", e.target.value)}
                  disabled={!layer.selected}
                  className="flex-1 h-8 text-sm font-medium"
                />
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {layer.analysis?.geometryTypes?.map((gt) => (
                  <Badge key={gt} variant="outline" className="text-[10px]">{gt}</Badge>
                ))}
                <span className="text-xs font-bold text-muted-foreground tabular-nums">
                  {layer.analysis?.featureCount || 0}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={layer.category}
                onChange={(e) => updateLayer(i, "category", e.target.value)}
                disabled={!layer.selected}
                className="flex-1 h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
              >
                <option value="">{t('upload.selectCategory')}</option>
                {layerTypes.map((lt) => (
                  <option key={lt.id} value={lt.name}>{lt.name}</option>
                ))}
              </select>
              {layer.category ? (
                <Badge variant="secondary" className="text-[10px] gap-1 shrink-0">
                  <Check className="w-2.5 h-2.5" /> {t('upload.autoDetected')}
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/30 shrink-0">
                  <AlertCircle className="w-2.5 h-2.5 mr-0.5" /> {t('upload.reviewNeeded')}
                </Badge>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}