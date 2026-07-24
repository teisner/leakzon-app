import React from "react";
import { motion } from "framer-motion";
import { Map as MapIcon, Database } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

export default function ViewToggle({ viewMode, onChange }) {
  const { t } = useLanguage();
  const options = [
    { key: "gis", label: t('view.gisMap'), Icon: MapIcon },
    { key: "data", label: t('view.meterData'), Icon: Database },
  ];

  return (
    <div className="inline-flex rounded-lg border-2 border-border bg-card p-1 shrink-0 relative">
      {options.map(({ key, label, Icon }) => {
        const active = viewMode === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`relative flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold transition-colors duration-200 z-10 ${
              active ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {active && (
              <motion.div
                layoutId="viewTogglePill"
                className="absolute inset-0 rounded-md bg-primary shadow-sm"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            )}
            <Icon className="w-4 h-4 relative" />
            <span className="relative">{label}</span>
          </button>
        );
      })}
    </div>
  );
}