import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, MapPin, Crosshair, Trash2 } from "lucide-react";
import { reverseGeocode } from "@/lib/reverseGeocode";

export default function ManualMeterDialog({ point, onSave, onCancel, onDelete }) {
  const [uid, setUid] = useState(point?.name || "");
  const [endpointId, setEndpointId] = useState(point?.endpoint_id || "");
  const [accountName, setAccountName] = useState(point?.account_name || "");
  const [address, setAddress] = useState(point?.address || "");
  const [addressLoading, setAddressLoading] = useState(false);

  const fetchAddress = async (lat, lng) => {
    setAddressLoading(true);
    try {
      const result = await reverseGeocode(lat, lng);
      if (result) setAddress(result);
    } finally {
      setAddressLoading(false);
    }
  };

  useEffect(() => {
    if (!address && point?.lat && point?.lng) {
      fetchAddress(point.lat, point.lng);
    }
  }, [point]);

  const handleSave = () => {
    onSave({
      name: uid,
      endpoint_id: endpointId,
      account_name: accountName,
      address,
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="w-4 h-4" /> Main Meter Details
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Meter ID *</Label>
            <Input value={uid} onChange={(e) => setUid(e.target.value)} placeholder="Meter identifier" className="mt-1.5" autoFocus />
          </div>
          <div>
            <Label>Endpoint ID</Label>
            <Input value={endpointId} onChange={(e) => setEndpointId(e.target.value)} placeholder="Device endpoint identifier" className="mt-1.5" />
          </div>
          <div>
            <Label>Account Name</Label>
            <Input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="Account holder name" className="mt-1.5" />
          </div>
          <div>
            <Label>Address</Label>
            <div className="flex gap-1.5 mt-1.5">
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Service address" className="flex-1" />
              <Button
                variant="outline"
                size="icon"
                onClick={() => fetchAddress(point.lat, point.lng)}
                disabled={addressLoading}
                title="Auto-detect from map location"
                className="shrink-0"
              >
                {addressLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Crosshair className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </div>
          <div className="text-xs text-muted-foreground font-mono">
            {point?.lat?.toFixed(5)}, {point?.lng?.toFixed(5)}
          </div>
        </div>
        <DialogFooter>
          {onDelete && (
            <Button variant="destructive" onClick={() => onDelete(point)} className="gap-1.5 mr-auto">
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </Button>
          )}
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={handleSave} disabled={!uid.trim()} className="gap-1.5">
            Save Meter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}