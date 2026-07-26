import React from "react";
import { IS_PREVIEW } from "@/lib/deployEnv";

// Small red "PREVIEW" marker under the logo, so a preview deployment is never
// mistaken for production. Renders nothing on the production domain.
export default function PreviewBadge({ className = "" }) {
  if (!IS_PREVIEW) return null;
  return (
    <span
      className={`text-[10px] font-bold tracking-[0.15em] text-red-600 dark:text-red-500 leading-none ${className}`}
    >
      PREVIEW
    </span>
  );
}
