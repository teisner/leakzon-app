import React from "react";
import { Check, Map as MapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/i18n";

export default function ZipImportStats({ stats, onClose, onViewMap }) {
  const { t } = useLanguage();
  if (!stats) return null;

  const categoryEntries = Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-5 py-2">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-emerald-500/15 flex items-center justify-center">
          <Check className="w-6 h-6 text-emerald-500" />
        </div>
        <div>
          <p className="text-lg font-bold text-foreground">{t('upload.importComplete')}</p>
          <p className="text-sm text-muted-foreground">{t('upload.layersImported', { count: stats.layersImported })}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-secondary rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-foreground tabular-nums">{stats.layersImported}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t('upload.layers')}</p>
        </div>
        <div className="bg-secondary rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-foreground tabular-nums">{stats.totalFeatures}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t('upload.features')}</p>
        </div>
      </div>

      {categoryEntries.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t('upload.byCategory')}</p>
          <div className="space-y-1.5">
            {categoryEntries.map(([cat, count]) => (
              <div key={cat} className="flex items-center justify-between text-sm bg-secondary rounded-md px-3 py-1.5">
                <span className="text-foreground">{cat}</span>
                <span className="font-bold text-muted-foreground tabular-nums">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t('upload.layerDetails')}</p>
        <div className="space-y-1.5 max-h-32 overflow-y-auto">
          {stats.layers.map((layer, i) => (
            <div key={i} className="flex items-center justify-between text-xs bg-secondary rounded-md px-3 py-1.5">
              <span className="text-foreground truncate">{layer.name}</span>
              <span className="text-muted-foreground shrink-0 ml-2">{layer.category} · {layer.features}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        {onViewMap && (
          <Button onClick={onViewMap} className="flex-1 gap-1.5">
            <MapIcon className="w-4 h-4" />
            {t('upload.goToMap')}
          </Button>
        )}
        <Button onClick={onClose} variant={onViewMap ? "outline" : "default"} className={onViewMap ? "flex-1" : "w-full"}>
          {onViewMap ? t('upload.importMore') : t('upload.close')}
        </Button>
      </div>
    </div>
  );
}