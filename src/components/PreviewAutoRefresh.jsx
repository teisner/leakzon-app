import { useVersionCheck } from "@/hooks/useVersionCheck";

// Mounted app-wide on preview only. useVersionCheck already reloads the tab
// itself when a newer build is out (see hardReload there); this exists so that
// happens on every screen, not just the two that show the version badge.
export default function PreviewAutoRefresh() {
  useVersionCheck();
  return null;
}
