import React from "react";
import { APP_VERSION } from "@/lib/version";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";

/**
 * Shown when the running tab is behind the deployed version. Shared by the
 * project side-menu badge and the Version Updates refresh button so both offer
 * the same wording and the same choice.
 */
export default function UpdateAvailableDialog({ open, onOpenChange, latestVersion }) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>A newer version is available</AlertDialogTitle>
          <AlertDialogDescription>
            You're running version {APP_VERSION}; version {latestVersion} has been released.
            Refresh the page to load it. Anything you haven't saved will be lost.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Later</AlertDialogCancel>
          <AlertDialogAction onClick={() => window.location.reload()}>Refresh now</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
