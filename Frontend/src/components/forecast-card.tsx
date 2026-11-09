"use client";

import { AlertTriangle, Info } from "lucide-react";
import useSWR from "swr";
import { fmtKg, fmtNum } from "@/lib/format";
import type { Forecast } from "@/lib/types";
import { Badge, Card } from "./ui";

/** Harvest forecast baseline vs the farmer's estimate (Technical/ai-forecasting.md). */
export function ForecastCard({ listingId }: { listingId: string }) {
  const { data: f } = useSWR<Forecast>(`/listings/${listingId}/forecast`);
  if (!f) return null;
  return (
    <Card title="ช่วงผลผลิตอ้างอิง" action={<Badge tone="gray">baseline · ไม่ใช่โมเดล AI ที่ฝึก</Badge>}>
      {f.insufficient_data ? (
        <p className="flex gap-2 text-sm text-slate-600"><Info className="mt-0.5 size-4 shrink-0" />ข้อมูลไม่เพียงพอ: {f.reason}</p>
      ) : (
        <div className="space-y-3 text-sm">
          <Range f={f} />
          <p className="text-slate-600">
            พื้นที่ {fmtNum(f.area_rai)} ไร่ × ผลผลิตอ้างอิง {fmtNum(f.yield_per_rai!.p10)}–{fmtNum(f.yield_per_rai!.p90)} กก./ไร่ ·
            แนะนำให้ผูกพันไม่เกิน <b className="tabular">{fmtKg(f.safe_to_commit_kg)}</b> จนกว่าจะเก็บเกี่ยวจริง
          </p>
          {f.warnings?.map((w) => <p key={w} className="flex gap-2 text-amber-800"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{w}</p>)}
          <p className="text-xs text-slate-500">{f.model_version} · ค่าอ้างอิงเบื้องต้น จะแทนด้วยโมเดลจากข้อมูลการเก็บเกี่ยวจริงเมื่อมีข้อมูลพอ</p>
        </div>
      )}
    </Card>
  );
}

function Range({ f }: { f: Forecast }) {
  const max = Math.max(f.p90_kg!, f.estimate_kg, f.contracted_kg) * 1.1;
  const pct = (v: number) => `${(v / max) * 100}%`;
  return (
    <div>
      <div className="relative h-3 rounded-full bg-slate-100">
        <div className="absolute inset-y-0 rounded-full bg-green-200" style={{ left: pct(f.p10_kg!), width: `calc(${pct(f.p90_kg!)} - ${pct(f.p10_kg!)})` }} />
        <div className="absolute inset-y-0 w-0.5 bg-green-800" style={{ left: pct(f.p50_kg!) }} title="ค่ากลาง" />
        <div className="absolute -inset-y-1 w-1 rounded bg-amber-500" style={{ left: pct(f.estimate_kg) }} title="ประมาณการของสวน" />
      </div>
      <div className="mt-1.5 flex flex-wrap justify-between gap-2 text-xs text-slate-600">
        <span>ช่วงอ้างอิง {fmtKg(f.p10_kg)} – {fmtKg(f.p90_kg)} (กลาง {fmtKg(f.p50_kg)})</span>
        <span className="text-amber-700">ประมาณการของสวน {fmtKg(f.estimate_kg)}</span>
      </div>
    </div>
  );
}
