"use client";

import { Loader2, Send, Sparkles } from "lucide-react";
import { useState } from "react";
import { post } from "@/lib/api";
import type { LegalAnswer } from "@/lib/types";
import { Citations } from "./citations";
import { Badge, Button, Input } from "./ui";

type Turn = { q: string; a?: LegalAnswer; error?: string };

/** Q&A grounded in the contract's clauses (when contractId is given) and approved policy documents. */
export function LegalChat({ contractId, suggestions = [] }: { contractId?: string; suggestions?: string[] }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  async function ask(question: string) {
    const text = question.trim();
    if (text.length < 3 || busy) return;
    setQ("");
    setBusy(true);
    setTurns((t) => [...t, { q: text }]);
    try {
      const a = await post<LegalAnswer>("/legal/ask", { question: text, contract_id: contractId ?? null });
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, a } : x)));
    } catch (e) {
      setTurns((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, error: e instanceof Error ? e.message : String(e) } : x)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {turns.length === 0 && suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {suggestions.slice(0, 4).map((s) => (
            <button key={s} onClick={() => ask(s)} className="rounded-full bg-slate-100 px-3 py-1 text-left text-xs text-slate-700 hover:bg-slate-200">{s}</button>
          ))}
        </div>
      )}
      {turns.map((t, i) => (
        <div key={i} className="space-y-2 text-sm">
          <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-green-800 px-3 py-2 text-white">{t.q}</div>
          <div className="max-w-[95%] rounded-2xl rounded-bl-sm bg-slate-50 px-3 py-2 ring-1 ring-inset ring-slate-200">
            {!t.a && !t.error && <span className="inline-flex items-center gap-2 text-slate-500"><Loader2 className="size-4 animate-spin" />กำลังค้นจากสัญญาและเอกสารที่อนุมัติ…</span>}
            {t.error && <span className="text-red-600">{t.error}</span>}
            {t.a && (
              <>
                {t.a.answer ? <p className="whitespace-pre-line text-slate-800">{t.a.answer}</p> : <p className="text-slate-500">{t.a.ai_error}</p>}
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                  {t.a.answer && <Badge tone="violet"><Sparkles className="size-3" />AI-generated</Badge>}
                  {t.a.answer && !t.a.found && <Badge tone="amber">ไม่พบในเอกสาร</Badge>}
                </div>
                <Citations items={t.a.citations} />
              </>
            )}
          </div>
        </div>
      ))}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
      >
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={contractId ? "ถามเกี่ยวกับสัญญานี้ เช่น ถ้าส่งของไม่ครบจะเป็นอย่างไร" : "ถามเกี่ยวกับกติกาแพลตฟอร์ม เช่น เปิดข้อพิพาทแล้วคะแนนลดไหม"} />
        <Button type="submit" loading={busy} disabled={q.trim().length < 3}><Send className="size-4" /></Button>
      </form>
    </div>
  );
}
