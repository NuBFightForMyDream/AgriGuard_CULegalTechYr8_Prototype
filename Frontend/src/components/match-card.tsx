import { CalendarRange, MapPin } from "lucide-react";
import { fmtKg, fmtRange } from "@/lib/format";
import { productName } from "@/lib/labels";
import type { Match } from "@/lib/types";
import { Badge, Button, Meter } from "./ui";

const FACTOR: Record<string, string> = {
  timing: "ช่วงเวลา (30%)",
  quantity: "ปริมาณ (25%)",
  quality: "คุณภาพ (20%)",
  logistics: "ระยะทาง (15%)",
  reliability: "ความน่าเชื่อถือ (10%)",
};

export function MatchCard({ m, onOffer }: { m: Match; onOffer?: () => void }) {
  const l = m.listing;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-slate-900">{l.farm.name}</div>
          <div className="text-sm text-slate-500">{productName(l.product_type, l.variety)} · {l.code}</div>
        </div>
        <div className="text-right">
          <div className="tabular text-2xl font-semibold text-green-800">{m.score.toFixed(0)}</div>
          <div className="text-xs text-slate-500">คะแนนจับคู่</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
        <span>คงเหลือ <b className="tabular text-slate-900">{fmtKg(l.inventory.available_kg)}</b></span>
        <span className="inline-flex items-center gap-1"><CalendarRange className="size-4 text-slate-400" />{fmtRange(l.harvest_start, l.harvest_end)}</span>
        <span className="inline-flex items-center gap-1"><MapPin className="size-4 text-slate-400" />{l.farm.province}{m.distance_km !== null && ` · ~${m.distance_km} กม.`}</span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {Object.entries(m.factors).map(([k, v]) => (
          <div key={k} className="text-xs">
            <div className="mb-1 flex justify-between text-slate-500"><span>{FACTOR[k]}</span><span className="tabular">{v.toFixed(0)}</span></div>
            <Meter value={v} />
          </div>
        ))}
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-slate-600">ทำไมจึงแนะนำ</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600">{m.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
      </details>
      <div className="mt-4 flex items-center justify-between gap-2">
        {m.already_offered ? <Badge tone="green">ส่งข้อเสนอแล้ว</Badge> : <span />}
        {onOffer ? <Button size="sm" onClick={onOffer} disabled={l.inventory.available_kg <= 0}>ส่งข้อเสนอ</Button> : <span className="text-xs text-slate-500">ปิดรับข้อเสนอแล้ว</span>}
      </div>
    </div>
  );
}
