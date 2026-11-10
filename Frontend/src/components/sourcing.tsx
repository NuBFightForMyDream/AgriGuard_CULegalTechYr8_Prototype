import { Users, User } from "lucide-react";
import { fmtKg } from "@/lib/format";
import { SOURCING } from "@/lib/labels";
import type { PurchaseRequest } from "@/lib/types";
import { Badge, SegmentBar } from "./ui";

export function SourcingBadge({ r }: { r: Pick<PurchaseRequest, "sourcing_mode" | "max_suppliers"> }) {
  const s = SOURCING[r.sourcing_mode];
  return (
    <Badge tone={s.tone}>
      {r.sourcing_mode === "SINGLE" ? <User className="size-3" /> : <Users className="size-3" />}
      {s.label}
      {r.sourcing_mode === "MULTI" && r.max_suppliers ? ` · สูงสุด ${r.max_suppliers} ราย` : ""}
    </Badge>
  );
}

/** How much of the request is already covered by signed and reserved HarvestLocks. */
export function FillProgress({ r }: { r: PurchaseRequest }) {
  if (!r.fill) return null;
  const f = r.fill;
  return (
    <div className="text-sm">
      <SegmentBar
        total={r.quantity_kg}
        segments={[
          { label: "ลงนามแล้ว", value: f.confirmed_kg, className: "bg-green-800" },
          { label: "จองรอลงนาม", value: f.reserved_kg, className: "bg-green-400" },
        ]}
      />
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        <span>ลงนามแล้ว <b className="tabular text-slate-900">{fmtKg(f.confirmed_kg)}</b> จาก {fmtKg(r.quantity_kg)}</span>
        {f.reserved_kg > 0 && <span>จองรอคุณลงนาม {fmtKg(f.reserved_kg)}</span>}
        <span>ยังขาด {fmtKg(f.remaining_kg)}</span>
        <span>ผู้ขาย {f.suppliers}{r.sourcing_mode === "MULTI" && r.max_suppliers ? `/${r.max_suppliers}` : r.sourcing_mode === "SINGLE" ? "/1" : ""} ราย{f.supplier_names.length ? `: ${f.supplier_names.join(", ")}` : ""}</span>
      </div>
    </div>
  );
}
