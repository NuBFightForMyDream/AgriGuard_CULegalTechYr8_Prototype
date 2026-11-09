"use client";

import { Camera, Sparkles } from "lucide-react";
import { useState } from "react";
import { post } from "@/lib/api";
import { fmtKg } from "@/lib/format";
import { REJECTION } from "@/lib/labels";
import type { PhotoSuggestion } from "@/lib/types";
import { Badge, Button } from "./ui";

const CONF = { high: ["สูง", "green"], medium: ["กลาง", "amber"], low: ["ต่ำ", "red"] } as const;
const QUALITY = { good: "ภาพชัด", fair: "ภาพพอใช้", poor: "ภาพไม่ชัด" };

/** Suggest grades from lot photos. The inspector applies, edits and submits; the suggestion never decides. */
export function AiPhotoAssist({ lotId, photos, onApply }: { lotId: string; photos: number; onApply: (s: PhotoSuggestion) => void }) {
  const [s, setS] = useState<PhotoSuggestion | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setS(await post<PhotoSuggestion>(`/lots/${lotId}/ai-grade`));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-2 font-medium text-violet-900"><Sparkles className="size-4" />AI ช่วยดูภาพล็อต</span>
        <Button type="button" size="sm" variant="secondary" loading={busy} disabled={!photos} onClick={run}>
          <Camera className="size-4" />{s ? "ประเมินใหม่" : photos ? `ประเมินจากภาพ ${photos} ภาพ` : "ยังไม่มีภาพในล็อต"}
        </Button>
      </div>
      {!s && !error && <p className="mt-1 text-xs text-slate-600">แนบภาพที่การ์ดล็อตด้านล่างก่อน AI จะประเมินสัดส่วนเกรดคร่าว ๆ ผู้ตรวจต้องตรวจจริงและเป็นผู้ตัดสิน</p>}
      {error && <p className="mt-2 text-red-600">{error}</p>}
      {s && (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge tone="violet">AI-suggested</Badge>
            <Badge tone={CONF[s.confidence][1]}>ความมั่นใจ{CONF[s.confidence][0]}</Badge>
            <Badge tone="gray">{QUALITY[s.image_quality]}</Badge>
          </div>
          {s.can_assess ? (
            <>
              <p>
                {s.grade_shares.map((g) => `เกรด ${g.grade} ~${g.percent.toFixed(0)}%`).join(" · ")} · คัดออก ~{s.reject_percent.toFixed(0)}%
                {s.suggested_kg.grades && <span className="text-slate-500"> ({Object.entries(s.suggested_kg.grades).map(([g, kg]) => `${g} ${fmtKg(kg)}`).join(", ")}, ออก {fmtKg(s.suggested_kg.rejected_kg)})</span>}
              </p>
              {s.defects.length > 0 && (
                <ul className="list-disc pl-5 text-slate-700">
                  {s.defects.map((d, i) => <li key={i}>{REJECTION[d.type] ?? d.type}: {d.description} ({d.severity})</li>)}
                </ul>
              )}
              <Button type="button" size="sm" onClick={() => onApply(s)}>ใช้ค่าแนะนำในแบบฟอร์ม (แก้ไขได้)</Button>
            </>
          ) : (
            <p className="text-amber-800">AI ประเมินจากภาพไม่ได้: {s.notes}</p>
          )}
          {s.can_assess && s.notes && <p className="text-xs text-slate-600">{s.notes}</p>}
          <p className="text-xs text-slate-500">{s.disclaimer} · {s.model}</p>
        </div>
      )}
    </div>
  );
}
