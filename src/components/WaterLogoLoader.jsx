import React from "react";

/**
 * Loading indicator: the LeakZon wordmark slowly filling with water.
 *
 * The logo PNG (transparent background, opaque lettering) is used as a CSS
 * mask, so the "water" is just a rising gradient clipped to the letter shapes —
 * no SVG copy of the wordmark to keep in sync, and it works on light and dark
 * backgrounds because the mask only uses the image's alpha channel.
 */
export default function WaterLogoLoader({ label = "Loading…", width = 260 }) {
  return (
    <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
      <div className="water-logo" style={{ width, height: width * (385 / 1024) }}>
        <span className="water-logo-fill" />
      </div>
      {label && <p className="text-xs text-muted-foreground">{label}</p>}
      <span className="sr-only">{label}</span>
    </div>
  );
}
