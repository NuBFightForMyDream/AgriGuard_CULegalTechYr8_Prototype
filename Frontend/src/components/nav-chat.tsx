"use client";

import { ArrowRight, Loader2, Scale, Send, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { post } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { Citation, Role } from "@/lib/types";
import { Citations } from "./citations";
import { Badge, cx } from "./ui";

type Action = { id: string; route: string; label: string; description: string; task: boolean };
type Reply = {
  kind: "nav" | "legal";
  reply: string;
  actions: Action[];
  suggestions: string[];
  mode: "ai" | "rules";
  model?: string;
  ai_error?: string;
  found?: boolean;
  citations?: Citation[];
  disclaimer?: string;
};
type Msg = { role: "user" | "assistant"; text: string; actions?: Action[]; mode?: Reply["mode"]; kind?: Reply["kind"]; found?: boolean; citations?: Citation[] };

const STARTERS: Record<Role, string[]> = {
  FARMER: ["มีงานอะไรค้างบ้าง", "อยากลงขายมะม่วง", "ผู้ซื้อยกเลิกหลังเซ็นสัญญาได้ไหม", "ถ้าผลผลิตขาดจะเป็นอย่างไร"],
  BUYER: ["มีงานอะไรค้างบ้าง", "อยากซื้อทุเรียน 5 ตัน", "สัญญา HarvestLock ผูกพันเมื่อไหร่", "เปิดข้อพิพาทแล้วคะแนน AgriTrust ลดไหม"],
  INSPECTOR: ["มีล็อตรอตรวจไหม", "ผลตรวจที่ไม่ตรงสัญญาต้องทำอย่างไร", "มีคำขอตรวจซ้ำไหม"],
  ADMIN: ["มีองค์กรรอยืนยันไหม", "ดูสัญญาณความเสี่ยง", "ระบบเก็บข้อมูลส่วนตัวอะไรบ้าง", "ลายเซ็นอิเล็กทรอนิกส์ใช้ได้ตามกฎหมายไหม"],
};
const KEY = "agriguard.navchat";

/** AgriChatLaw: one chat for legal questions (cited answers) and "take me there" requests (page buttons). */
export function AgriChatLawPanel({ onClose, onNavigate, className, back }: { onClose?: () => void; onNavigate?: () => void; className?: string; back?: React.ReactNode }) {
  const { user } = useSession();
  const pathname = usePathname();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const storeKey = user ? `${KEY}.${user.id}` : null;

  useEffect(() => {
    if (!storeKey) return;
    try {
      const raw = sessionStorage.getItem(storeKey);
      setMsgs(raw ? JSON.parse(raw) : []);
    } catch {
      setMsgs([]);
    }
  }, [storeKey]);
  useEffect(() => {
    if (!storeKey) return;
    try {
      sessionStorage.setItem(storeKey, JSON.stringify(msgs.slice(-30)));
    } catch {
      /* storage unavailable: keep the chat in memory only */
    }
    end.current?.scrollIntoView({ block: "end" });
  }, [msgs, storeKey]);

  if (!user) return null;

  async function send(message: string) {
    const m = message.trim();
    if (!m || busy) return;
    setText("");
    setSuggestions([]);
    const history = msgs.map((x) => ({ role: x.role, text: x.text }));
    setMsgs((s) => [...s, { role: "user", text: m }]);
    setBusy(true);
    try {
      const r = await post<Reply>("/assistant/chat", { message: m, history, current_path: pathname });
      setMsgs((s) => [...s, { role: "assistant", text: r.reply, actions: r.actions, mode: r.mode, kind: r.kind, found: r.found, citations: r.citations }]);
      setSuggestions(r.suggestions ?? []);
    } catch (e) {
      setMsgs((s) => [...s, { role: "assistant", text: e instanceof Error ? e.message : "ตอบไม่ได้ในตอนนี้" }]);
    } finally {
      setBusy(false);
    }
  }

  const chips = msgs.length ? suggestions : STARTERS[user.role];

  return (
    <div className={cx("flex flex-col overflow-hidden bg-white", className)}>
      <div className="flex items-center justify-between gap-2 bg-gradient-to-r from-green-800 to-green-700 px-4 py-3 text-white">
        <div className="flex min-w-0 items-center gap-2.5">
          {back}
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/15"><Scale className="size-5" /></span>
          <div className="min-w-0 leading-tight">
            <div className="text-sm font-semibold">AgriChatLaw</div>
            <div className="truncate text-[11px] text-green-100">ถามเรื่องสัญญาและกฎหมาย หรือบอกสิ่งที่อยากทำ เดี๋ยวพาไป</div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {msgs.length > 0 && (
            <button className="whitespace-nowrap rounded px-2 py-1 text-[11px] text-green-100 hover:bg-green-700" onClick={() => { setMsgs([]); setSuggestions([]); }}>
              เริ่มใหม่
            </button>
          )}
          {onClose && <button className="rounded p-1 hover:bg-green-700" onClick={onClose} aria-label="ปิดแชท"><X className="size-4" /></button>}
        </div>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/60 p-4 text-sm">
        {msgs.length === 0 && (
          <div className="max-w-[92%] rounded-2xl rounded-bl-sm bg-white px-3 py-2 text-slate-700 shadow-sm">
            สวัสดีครับคุณ{user.name.split(" ")[0]} ผม AgriChatLaw ถามเรื่องสัญญา สิทธิ ข้อพิพาท ได้ พร้อมแหล่งอ้างอิง หรือบอกสิ่งที่อยากทำ เดี๋ยวพาไปหน้านั้น
          </div>
        )}
        {msgs.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-green-800 px-3 py-2 text-white">{m.text}</div>
          ) : (
            <div key={i} className="max-w-[92%] space-y-2">
              <div className="rounded-2xl rounded-bl-sm bg-white px-3 py-2 text-slate-800 shadow-sm">
                {m.kind === "legal" && (
                  <div className="mb-1 flex flex-wrap gap-1">
                    <Badge tone="blue"><Scale className="size-3" />{m.mode === "ai" ? "ตอบจากสัญญาและเอกสารที่อนุมัติ" : "เอกสารที่เกี่ยวข้อง"}</Badge>
                    {m.mode === "ai" && m.found === false && <Badge tone="amber">ไม่พบในเอกสาร</Badge>}
                  </div>
                )}
                <p className="whitespace-pre-line">{m.text}</p>
                {m.citations && <Citations items={m.citations} />}
                {m.kind === "legal" && <p className="mt-1.5 text-[10px] text-slate-400">ไม่ใช่คำปรึกษาทางกฎหมาย ใช้ประกอบความเข้าใจเท่านั้น</p>}
              </div>
              {m.actions?.map((a) => (
                <Link
                  key={a.id}
                  href={a.route}
                  onClick={() => onNavigate?.()}
                  className={cx(
                    "flex items-center justify-between gap-2 rounded-xl border bg-white px-3 py-2 hover:border-green-700 hover:bg-green-50",
                    a.task ? "border-amber-200 bg-amber-50/60" : "border-slate-200",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-900">{a.label}</span>
                    <span className="block truncate text-xs text-slate-500">{a.description}</span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-green-800" />
                </Link>
              ))}
              {m.mode && <div className="text-[10px] text-slate-400">{m.mode === "ai" ? <Badge tone="violet">AI-generated</Badge> : m.kind === "legal" ? null : "จับคู่จากคำที่พิมพ์ (ไม่ได้ใช้ AI)"}</div>}
            </div>
          ),
        )}
        {busy && <span className="inline-flex items-center gap-2 text-slate-500"><Loader2 className="size-4 animate-spin" />กำลังคิด…</span>}
        <div ref={end} />
      </div>
      {chips.length > 0 && !busy && (
        <div className="flex gap-1.5 overflow-x-auto border-t border-slate-100 px-3 pt-2 sm:flex-wrap">
          {chips.map((c) => (
            <button key={c} onClick={() => send(c)} className="shrink-0 rounded-full bg-green-50 px-2.5 py-1 text-xs text-green-900 ring-1 ring-inset ring-green-200 hover:bg-green-100">{c}</button>
          ))}
        </div>
      )}
      <form className="flex gap-2 p-3" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="ถามกฎหมาย หรือบอกว่าอยากทำอะไร"
          maxLength={500}
          aria-label="ข้อความถึง AgriChatLaw"
          className="flex-1 rounded-full border border-slate-300 px-4 py-2 text-sm outline-none focus:border-green-700 focus:ring-2 focus:ring-green-700/20"
        />
        <button type="submit" disabled={!text.trim() || busy} className="rounded-full bg-green-800 p-2.5 text-white disabled:opacity-40" aria-label="ส่งข้อความ">
          <Send className="size-4" />
        </button>
      </form>
    </div>
  );
}

/** Floating AgriChatLaw button for desktop; on phones it is pinned at the top of the Chat tab. */
export function NavChat() {
  const { user } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  if (!user || pathname.startsWith("/chat")) return null;
  return (
    <div className="hidden print:hidden lg:block">
      {open && (
        <AgriChatLawPanel
          onClose={() => setOpen(false)}
          className="fixed bottom-24 right-6 z-40 max-h-[70vh] w-[380px] rounded-2xl border border-slate-200 shadow-2xl"
        />
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-40 flex size-14 items-center justify-center rounded-full bg-green-800 text-white shadow-lg shadow-green-900/30 transition hover:bg-green-900"
        aria-label={open ? "ปิด AgriChatLaw" : "เปิด AgriChatLaw"}
      >
        {open ? <X className="size-6" /> : <Scale className="size-6" />}
      </button>
    </div>
  );
}
