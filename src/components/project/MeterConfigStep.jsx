import React, { useState } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { MapPin, KeyRound, Check, Info, AlertCircle } from "lucide-react";

const FIELD_LABELS = {
  uid: "Index UID (Number/ID)",
  endpoint_id: "Endpoint ID",
  payer_name: "Payer / Account Name",
  address: "Address",
  city: "City",
  state: "State",
  country: "Country",
  provider: "Provider",
  communication_type: "Communication Type",
  is_active: "Active / Not Active",
  coordinates: "Coordinates (combined Lat,Long)",
  latitude: "Latitude (separate column)",
  longitude: "Longitude (separate column)",
  altitude: "Altitude / Elevation",
  diameter: "Diameter",
  dma_name: "DMA / Zone Name"
};

export default function MeterConfigStep({ analysis, mappings, setMappings, isMain, setIsMain, extraIdColumns, setExtraIdColumns, splitMode, mainColumn }) {
  const { columns, preview, rowCount, idColumns } = analysis;
  const [showAllIds, setShowAllIds] = useState(false);

  const handleChange = (field, value) => {
    setMappings((prev) => {
      const next = { ...prev, [field]: value };
      // Enforce mutual exclusivity: coordinates (combined) vs separate latitude/longitude
      if (field === "coordinates" && value) {
        next.latitude = "";
        next.longitude = "";
      } else if ((field === "latitude" || field === "longitude") && value) {
        next.coordinates = "";
      }
      return next;
    });
  };

  const MAX_INDEXES = 3;

  const toggleIdColumn = (col) => {
    setExtraIdColumns?.((prev) => {
      const current = prev || [];
      if (current.includes(col)) {
        const next = current.filter((c) => c !== col);
        // If we removed the current UID, auto-assign to the first remaining
        if (mappings?.uid === col) {
          handleChange("uid", next[0] || "");
        }
        return next;
      }
      // Enforce max 3 selections
      if (current.length >= MAX_INDEXES) return current;
      const next = [...current, col];
      // If no UID set yet, auto-assign this column
      if (!mappings?.uid) {
        handleChange("uid", col);
      }
      return next;
    });
  };

  const selectedIds = extraIdColumns || [];

  return (
    <div className="space-y-2.5">
      {/* Is Main toggle / split info */}
      {splitMode ? (
        <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-lg p-2.5">
          <Info className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700">
            Meters will be automatically split into <strong>Main</strong> and <strong>Sub</strong> layers based on the "{mainColumn}" column.
          </p>
        </div>
      ) : (
        <div className="flex items-center justify-between bg-slate-50 rounded-lg p-2.5">
          <div>
            <p className="text-sm font-medium text-slate-900">Main Meter?</p>
            <p className="text-xs text-slate-500">Indicate whether these are main meters or sub-meters</p>
          </div>
          <Switch checked={isMain} onCheckedChange={setIsMain} />
        </div>
      )}

      {/* ID Columns section */}
      {idColumns && idColumns.length > 0 && (
        <div className="space-y-1.5 border border-slate-200 rounded-lg p-2.5 bg-slate-50/50">
          <div className="flex items-center gap-1.5">
            <KeyRound className="w-3.5 h-3.5 text-slate-500" />
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Index Columns</p>
            <span className="text-[10px] text-slate-400 ml-auto">{selectedIds.length}/{MAX_INDEXES} selected</span>
          </div>
          <p className="text-xs text-slate-400">Select up to {MAX_INDEXES} index columns, then choose one as the primary UID.</p>

          {/* Index checkboxes with UID radio */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-slate-400 font-medium">Check to import · Select UID</p>
              {idColumns.length > 6 && (
                <button onClick={() => setShowAllIds(!showAllIds)} className="text-[10px] text-blue-600 hover:underline">
                  {showAllIds ? "Show less" : `Show all (${idColumns.length})`}
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-1">
              {(showAllIds ? idColumns : idColumns.slice(0, 6)).map((col) => {
                const isChecked = selectedIds.includes(col);
                const isUid = mappings?.uid === col;
                const disabled = !isChecked && selectedIds.length >= MAX_INDEXES;
                return (
                  <div
                    key={col}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors ${isUid ? "bg-blue-50 ring-1 ring-blue-200" : isChecked ? "bg-slate-50" : "hover:bg-slate-100"} ${disabled ? "opacity-40" : ""}`}
                  >
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={() => toggleIdColumn(col)}
                      disabled={disabled}
                    />
                    <span className="text-xs text-slate-700 flex-1 truncate">{col}</span>
                    {isChecked && (
                      <label className="flex items-center gap-1 cursor-pointer shrink-0">
                        <input
                          type="radio"
                          name="uid-select"
                          checked={isUid}
                          onChange={() => handleChange("uid", col)}
                          className="w-3 h-3 accent-blue-600"
                        />
                        <span className="text-[10px] text-blue-600 font-medium">UID</span>
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
            {selectedIds.length === 0 && (
              <p className="text-[10px] text-amber-600 flex items-center gap-1 pt-0.5">
                <AlertCircle className="w-3 h-3" /> Select at least one index column and set a UID.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Field mappings (excluding uid since it's in the ID section) */}
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Field Mapping</p>
        <p className="text-xs text-slate-400">Match your file columns to the meter database fields</p>
        {Object.entries(FIELD_LABELS)
          .filter(([field]) => field !== "uid")
          .map(([field, label]) => (
          <div key={field} className="flex items-center gap-2">
            <Label className="text-xs text-slate-600 w-44 shrink-0">{label}</Label>
            <select
              value={mappings?.[field] || ""}
              onChange={(e) => handleChange(field, e.target.value)}
              className="flex-1 h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">— None —</option>
              {columns.map((col) => (
                <option key={col} value={col}>{col}</option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {/* Coordinates note */}
      {mappings?.coordinates ? (
        <div className="flex items-start gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg p-2.5">
          <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>The selected coordinates field will be automatically split into separate Latitude and Longitude values in the database.</span>
        </div>
      ) : mappings?.latitude && mappings?.longitude ? (
        <div className="flex items-start gap-2 text-xs text-green-700 bg-green-50 border border-green-100 rounded-lg p-2.5">
          <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>Latitude and Longitude will be imported directly from their separate columns.</span>
        </div>
      ) : null}

      {/* Preview table — transposed (columns as rows) */}
      {preview && preview.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Preview ({rowCount} rows)
          </p>
          <div className="overflow-x-auto border border-border rounded-lg max-h-60">
            <table className="w-full text-xs">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap border-b border-border">
                    Column
                  </th>
                  {preview.slice(0, 3).map((_, i) => (
                    <th key={i} className="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap border-b border-border">
                      Row {i + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {selectedIds.map((col) => (
                  <tr key={col} className="border-t border-border">
                    <td className="px-2 py-1.5 font-medium text-foreground whitespace-nowrap max-w-[160px] truncate">
                      {col}
                    </td>
                    {preview.slice(0, 3).map((row, i) => (
                      <td key={i} className="px-2 py-1.5 text-muted-foreground max-w-[120px] truncate">
                        {row[col] || "—"}
                      </td>
                    ))}
                  </tr>
                ))}
                {Object.entries(FIELD_LABELS)
                  .filter(([field]) => field !== "uid")
                  .filter(([field]) => !selectedIds.includes(mappings?.[field]))
                  .map(([field]) => (
                    <tr key={field} className="border-t border-border">
                      <td className="px-2 py-1.5 font-medium text-foreground whitespace-nowrap max-w-[160px] truncate">
                        {FIELD_LABELS[field].split(" (")[0]}
                      </td>
                      {preview.slice(0, 3).map((row, i) => (
                        <td key={i} className="px-2 py-1.5 text-muted-foreground max-w-[120px] truncate">
                          {mappings?.[field] ? row[mappings[field]] || "—" : "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}