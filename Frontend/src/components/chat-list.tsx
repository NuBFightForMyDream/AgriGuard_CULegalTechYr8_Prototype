"use client";

import { Bot, MessageCirclePlus, Pin, Search } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { post } from "@/lib/api";
import { fmtChatTime } from "@/lib/format";
import { BUSINESS_TYPE, OFFER_STATUS, ORDER_STATUS } from "@/lib/labels";
import type { ChatDeal, ChatSummary, Org } from "@/lib/types";
import { PROBLEM } from "./deal-card";
import { useToast } from "./toast";
import { Avatar, Badge, Button, cx, Empty, Input, Modal, Skeleton } from "./ui";

export function DealChip({ deal }: { deal: ChatDeal | null }) {
  if (!deal) return <Badge tone="gray">ยังไม่มีดีล</Badge>;
  const [label, tone] = (deal.kind === "contract" ? ORDER_STATUS : OFFER_STATUS)[deal.status] ?? [deal.status, "gray"];
  return <Badge tone={tone} className={PROBLEM.has(deal.status) ? "ring-2 ring-red-300" : undefined}>{deal.kind === "offer" ? `ข้อเสนอ: ${label}` : label}</Badge>;
}

export function ChatList() {
  const { data, error } = useSWR<ChatSummary[]>("/chats", { refreshInterval: 8000 });
  const pathname = usePathname();
  const [q, setQ] = useState("");
  const [picker, setPicker] = useState(false);
  const needle = q.trim().toLowerCase();
  const rows = (data ?? []).filter((c) => !needle || c.counterpart.name.toLowerCase().includes(needle) || c.last_message?.body.toLowerCase().includes(needle));

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-none bg-white lg:rounded-2xl lg:border lg:border-slate-200/80 lg:shadow-sm">
      <div className="space-y-3 border-b border-slate-100 p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-slate-900">แชท</h1>
          <Button size="sm" variant="secondary" onClick={() => setPicker(true)}><MessageCirclePlus className="size-4" />แชทใหม่</Button>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาแชท" className="rounded-full pl-9" aria-label="ค้นหาแชท" />
        </div>
      </div>
      <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto">
        <li>
          <Link href="/chat/agribot" className={cx("flex items-center gap-3 px-4 py-3 hover:bg-green-50/60", pathname === "/chat/agribot" && "bg-green-50")}>
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-green-800 to-emerald-600 text-white"><Bot className="size-6" /></span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 font-semibold text-slate-900">AgriBot <Pin className="size-3 text-green-700" /></span>
              <span className="block truncate text-sm text-slate-500">ผู้ช่วยนำทาง · บอกสิ่งที่อยากทำ เดี๋ยวพาไป</span>
            </span>
            <Badge tone="lime">ปักหมุด</Badge>
          </Link>
        </li>
        {error && <li className="p-4 text-sm text-red-600">โหลดแชทไม่สำเร็จ: {error.message}</li>}
        {!data && !error && [0, 1, 2].map((i) => <li key={i} className="flex gap-3 p-4"><Skeleton className="size-12 rounded-full" /><Skeleton className="h-12 flex-1" /></li>)}
        {data && rows.length === 0 && (
          <li><Empty title={needle ? "ไม่พบแชท" : "ยังไม่มีแชท"}>{!needle && "กด \"แชทใหม่\" หรือกดปุ่มแชทจากหน้าค้นหาเพื่อเริ่มคุยกับคู่ค้า"}</Empty></li>
        )}
        {rows.map((c) => {
          const active = pathname === `/chat/${c.id}`;
          return (
            <li key={c.id}>
              <Link href={`/chat/${c.id}`} className={cx("flex items-start gap-3 px-4 py-3 hover:bg-slate-50", active && "bg-green-50")}>
                <span className="relative">
                  <Avatar name={c.counterpart.name} size="lg" />
                  {c.unread > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-red-500 px-1 text-center text-[10px] font-semibold leading-[18px] text-white ring-2 ring-white">{c.unread}</span>}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2">
                    <span className={cx("truncate text-slate-900", c.unread ? "font-bold" : "font-semibold")}>{c.counterpart.name}</span>
                    <span className="shrink-0 text-xs text-slate-400">{fmtChatTime(c.last_message?.created_at ?? c.updated_at)}</span>
                  </span>
                  <span className={cx("block truncate text-sm", c.unread ? "font-medium text-slate-800" : "text-slate-500")}>
                    {c.last_message ? `${c.last_message.mine ? "คุณ: " : ""}${c.last_message.body}` : "เริ่มบทสนทนา"}
                  </span>
                  <span className="mt-1 block"><DealChip deal={c.deal} /></span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <NewChat open={picker} onClose={() => setPicker(false)} />
    </div>
  );
}

function NewChat({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data } = useSWR<(Org & { partner: boolean })[]>(open ? "/chats/contacts" : null);
  const router = useRouter();
  const toast = useToast();
  const [q, setQ] = useState("");
  const shown = (data ?? []).filter((o) => o.name.toLowerCase().includes(q.trim().toLowerCase()));
  async function start(id: string) {
    try {
      const r = await post<{ id: string }>("/chats", { organization_id: id });
      onClose();
      router.push(`/chat/${r.id}`);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "เปิดแชทไม่สำเร็จ");
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="เริ่มแชทใหม่">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ" aria-label="ค้นหาคู่ค้า" />
      <ul className="mt-3 divide-y divide-slate-100">
        {!data && <li className="py-3"><Skeleton className="h-10" /></li>}
        {shown.map((o) => (
          <li key={o.id}>
            <button onClick={() => start(o.id)} className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-slate-50">
              <Avatar name={o.name} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-slate-900">{o.name}</span>
                <span className="block text-xs text-slate-500">{o.business_type ? BUSINESS_TYPE[o.business_type] : o.kind === "FARM" ? "สวน" : "ผู้ซื้อ"} · {o.province ?? "—"}</span>
              </span>
              {o.partner && <Badge tone="green">คู่ค้า</Badge>}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
