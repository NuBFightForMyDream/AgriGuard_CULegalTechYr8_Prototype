"use client";

import { BadgeCheck, Check, Circle, MapPin } from "lucide-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { Logo } from "@/components/shell";
import { Badge, Card, ErrorState, Skeleton } from "@/components/ui";
import { fmtDate, fmtDateTime, fmtKg } from "@/lib/format";
import { productName } from "@/lib/labels";

type Trace = {
  lot_code: string;
  product_type: string;
  variety: string | null;
  farm_name: string;
  farm_province: string;
  farm_verified: boolean;
  harvest_date: string;
  net_kg: number;
  destination_province: string;
  status: string;
  steps: { label: string; at: string | null }[];
  grades: { grade: string; quantity_kg: number }[];
  rejected_kg: number | null;
};

/** Public page behind a lot's QR code. Shows origin and journey only: no personal data, buyer identity or prices. */
export default function TracePage() {
  const { token } = useParams<{ token: string }>();
  const { data: t, error } = useSWR<Trace>(`/trace/${token}`);
  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <Logo />
      <h1 className="mt-6 text-xl font-semibold">ตรวจสอบย้อนกลับผลผลิต</h1>
      <p className="text-sm text-slate-500">ข้อมูลจากระบบ AgriGuard ณ เวลาที่เปิดหน้านี้</p>
      <div className="mt-6">
        {error ? (
          <ErrorState error={error} />
        ) : !t ? (
          <Skeleton className="h-64" />
        ) : (
          <Card>
            <div className="text-xs text-slate-500">ล็อต</div>
            <div className="font-mono text-lg font-semibold">{t.lot_code}</div>
            <div className="mt-1 text-lg">{productName(t.product_type, t.variety)} · {fmtKg(t.net_kg)}</div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <MapPin className="size-4 text-slate-400" />
              {t.farm_name} · {t.farm_province}
              {t.farm_verified && <Badge tone="green"><BadgeCheck className="size-3" />ยืนยันสวนแล้ว</Badge>}
            </div>
            <div className="mt-1 text-sm text-slate-600">เก็บเกี่ยว {fmtDate(t.harvest_date)} · ปลายทาง {t.destination_province}</div>
            <ol className="mt-5 space-y-3">
              {t.steps.map((s) => (
                <li key={s.label} className="flex items-start gap-3 text-sm">
                  {s.at ? <Check className="mt-0.5 size-4 text-green-700" /> : <Circle className="mt-0.5 size-4 text-slate-300" />}
                  <div>
                    <div className={s.at ? "text-slate-900" : "text-slate-400"}>{s.label}</div>
                    {s.at && <div className="text-xs text-slate-500">{fmtDateTime(s.at)}</div>}
                  </div>
                </li>
              ))}
            </ol>
            {t.grades.length > 0 && (
              <div className="mt-5 border-t border-slate-100 pt-3 text-sm">
                <div className="mb-1 text-xs text-slate-500">ผลตรวจคุณภาพ (GradeProof)</div>
                {t.grades.filter((g) => Number(g.quantity_kg) > 0).map((g) => `เกรด ${g.grade} ${fmtKg(g.quantity_kg)}`).join(" · ")}
                {t.rejected_kg ? ` · คัดออก ${fmtKg(t.rejected_kg)}` : ""}
              </div>
            )}
          </Card>
        )}
      </div>
      <p className="mt-4 text-xs text-slate-400">หน้านี้ไม่แสดงข้อมูลส่วนบุคคล ผู้ซื้อ หรือราคา</p>
    </div>
  );
}
