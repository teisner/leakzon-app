import React from "react";
import { Sparkles, Search, Smartphone, Move, CircleDot } from "lucide-react";
import { useLanguage } from "@/lib/i18n";
import { locationSourceInfo, locationSourceLabelKey, LOCATION_SOURCE_CLASSES } from "@/lib/locationSource";

const ICONS = { sparkles: Sparkles, search: Search, smartphone: Smartphone, move: Move, circle: CircleDot };

// The marker beside a meter's coordinates when they did not come from the
// import: calculated, geocoded, located in the field, or moved by hand.
// Renders nothing for an imported location, which is the normal case.
export default function LocationSourceBadge({ meter, className = "" }) {
  const { t } = useLanguage();
  const info = locationSourceInfo(meter);
  if (!info) return null;
  const Icon = ICONS[info.icon] || Sparkles;
  return (
    <span
      title={t(locationSourceLabelKey(info))}
      aria-label={t(locationSourceLabelKey(info))}
      className={`inline-flex items-center justify-center w-4 h-4 rounded-full shrink-0 ${LOCATION_SOURCE_CLASSES[info.tone]} ${className}`}
    >
      <Icon className="w-2.5 h-2.5" />
    </span>
  );
}
