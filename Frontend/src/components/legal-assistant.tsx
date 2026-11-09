"use client";

import { AlertTriangle, Scale, ShieldAlert, Sparkles } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { post } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import type { AiStatus, ContractDetail, LegalReview } from "@/lib/types";
import { Citations } from "./citations";
import { LegalChat } from "./legal-chat";
import { Badge, Button, Card } from "./ui";

const SEV = { high: ["สูง", "red"], medium: ["กลาง", "amber"], low: ["ต่ำ", "gray"] } as const;
const WHO = { FARMER: "เกษตรกร", BUYER: "ผู้ซื้อ", BOTH: "ทั้งสองฝ่าย" };
const DEFAULT_QUESTIONS = ["ถ้าผลผลิตไม่ครบตามสัญญาจะเป็นอย่างไร", "ผู้ซื้อปฏิเสธสินค้าได้ในกรณีไหนบ้าง", "ถ้าชำระเงินช้าต้องทำอย่างไร", "ลายเซ็นในระบบนี้มีผลทางกฎหมายไหม"];

/** Legal AI panel for one HarvestLock (Business & Legals/legal-ai.md). */
export function LegalAssistant({ c }: { c: ContractDetail }) {
  const { data: status } = useSWR<AiStatus>("/ai/status");
  const [review, setReview] = useState<LegalReview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(refresh = false) {
    setBusy(true);
    setError(null);
    try {
      setReview(await post<LegalReview>(`/legal/contracts/${c.id}/review${refresh ? "?refresh=true" : ""}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const ai = review?.ai;
  return (
    <Card
      className="mt-6"
      title={<span className="inline-flex items-center gap-2"><Scale className="size-4 text-green-800" />ผู้ช่วยอ่านสัญญา <Badge tone="violet"><Sparkles className="size-3" />AI</Badge></span>}
      action={
        <Button size="sm" variant={review ? "secondary" : "primary"} loading={busy} onClick={() => run(!!review)}>
          {review ? "วิเคราะห์ใหม่" : "วิเคราะห์สัญญานี้"}
        </Button>
      }
    >
      {!review && (
        <p className="text-sm text-slate-600">
          ตรวจข้อสัญญาที่จำเป็นด้วยกฎ แล้วให้ AI สรุปเป็นภาษาง่าย ชี้จุดเสี่ยง และตอบคำถาม โดยอ้างอิงเฉพาะข้อในสัญญานี้และเอกสารนโยบายที่อนุมัติ
          {status && !status.available && " · ตอนนี้ยังไม่ได้ตั้งค่า AI จึงใช้ได้เฉพาะการตรวจด้วยกฎ"}
        </p>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {review && (
        <div className="space-y-5 text-sm">
          {review.human_review_required && (
            <div className="flex gap-2 rounded-lg bg-red-50 p-3 text-red-800"><ShieldAlert className="mt-0.5 size-4 shrink-0" />มีประเด็นความเสี่ยงสูง ควรให้ผู้เชี่ยวชาญหรือผู้ดูแลแพลตฟอร์มตรวจทานก่อนดำเนินการต่อ</div>
          )}

          <section>
            <h3 className="mb-2 font-medium text-slate-900">ตรวจด้วยกฎ (ไม่ใช้ AI)</h3>
            {review.rule_findings.length ? (
              <ul className="space-y-1.5">
                {review.rule_findings.map((f) => (
                  <li key={f.code} className="flex items-start gap-2"><Badge tone={SEV[f.severity][1]}>{SEV[f.severity][0]}</Badge>{f.message}</li>
                ))}
              </ul>
            ) : (
              <p className="text-green-800">มีข้อสัญญาที่จำเป็นครบ</p>
            )}
          </section>

          {ai ? (
            <>
              <section>
                <h3 className="mb-1 font-medium text-slate-900">สรุป</h3>
                <p className="text-slate-800">{ai.summary}</p>
                <p className="mt-2 rounded-lg bg-green-50 p-3 text-slate-800">{ai.plain_language}</p>
              </section>
              {ai.key_terms.length > 0 && (
                <section>
                  <h3 className="mb-2 font-medium text-slate-900">เงื่อนไขสำคัญ</h3>
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {ai.key_terms.map((k) => (
                      <li key={k.label} className="rounded-lg border border-slate-200 p-3">
                        <div className="text-xs text-slate-500">{k.label}</div>
                        <div className="text-slate-900">{k.value}</div>
                        <Citations items={k.citations} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {ai.risks.length > 0 && (
                <section>
                  <h3 className="mb-2 font-medium text-slate-900">จุดที่ควรระวัง</h3>
                  <ul className="space-y-3">
                    {ai.risks.map((r, i) => (
                      <li key={i} className="rounded-lg border border-slate-200 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <AlertTriangle className="size-4 text-amber-600" />
                          <span className="font-medium text-slate-900">{r.issue}</span>
                          <Badge tone={SEV[r.severity][1]}>ความเสี่ยง{SEV[r.severity][0]}</Badge>
                          <Badge tone="gray">กระทบ{WHO[r.who_is_affected]}</Badge>
                        </div>
                        <p className="mt-1 text-slate-600">{r.suggestion}</p>
                        <Citations items={r.citations} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              <section>
                <h3 className="mb-2 font-medium text-slate-900">ถามผู้ช่วย</h3>
                <LegalChat contractId={c.id} suggestions={ai.questions_to_ask.length ? ai.questions_to_ask : DEFAULT_QUESTIONS} />
              </section>
              <p className="text-xs text-slate-500">
                {review.disclaimer} · {ai.model} · สัญญาฉบับที่ {review.version} · {ai.cached ? "ผลวิเคราะห์ที่บันทึกไว้ " : ""}{fmtDateTime(ai.generated_at)}
              </p>
            </>
          ) : (
            <>
              <p className="rounded-lg bg-slate-50 p-3 text-slate-600">{review.ai_error}</p>
              <section>
                <h3 className="mb-2 font-medium text-slate-900">ถามผู้ช่วย</h3>
                <LegalChat contractId={c.id} suggestions={DEFAULT_QUESTIONS} />
              </section>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
