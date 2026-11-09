import { fmtKg } from "@/lib/format";
import type { Inventory } from "@/lib/types";
import { SegmentBar } from "./ui";

export function InventoryBar({ inv, showLegend = true }: { inv: Inventory; showLegend?: boolean }) {
  const segments = [
    { label: "ทำสัญญาแล้ว", value: inv.contracted_kg, className: "bg-green-800" },
    { label: "จองชั่วคราว", value: inv.reserved_kg, className: "bg-green-500" },
  ];
  return (
    <div>
      <SegmentBar segments={segments} total={inv.estimated_kg} />
      {showLegend && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
          <Legend className="bg-green-800" label="ทำสัญญา" value={inv.contracted_kg} />
          <Legend className="bg-green-500" label="จองชั่วคราว" value={inv.reserved_kg} />
          <Legend className="bg-slate-200" label="ยังไม่ผูกพัน" value={inv.available_kg} />
        </div>
      )}
    </div>
  );
}

function Legend({ className, label, value }: { className: string; label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-2 rounded-full ${className}`} />
      {label} <span className="tabular font-medium text-slate-800">{fmtKg(value)}</span>
    </span>
  );
}
