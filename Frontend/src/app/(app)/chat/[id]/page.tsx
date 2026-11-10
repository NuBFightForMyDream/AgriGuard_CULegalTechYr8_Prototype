"use client";

import { ChevronLeft, FileSignature, Loader2, MapPin, Send, ShoppingBasket } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { DealChip } from "@/components/chat-list";
import { useToast } from "@/components/toast";
import { TrustBadge } from "@/components/trust";
import { Avatar, cx, ErrorState, Skeleton } from "@/components/ui";
import { post } from "@/lib/api";
import { fmtDate, fmtKg } from "@/lib/format";
import { BUSINESS_TYPE, productName } from "@/lib/labels";
import type { ChatMessage, ChatThread } from "@/lib/types";

const TZ = "Asia/Bangkok";
const day = (iso: string) => new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`).toLocaleDateString("en-CA", { timeZone: TZ });
const clock = (iso: string) =>
  new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`).toLocaleTimeString("th-TH", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

export default function ChatThreadPage() {
  const { id } = useParams<{ id: string }>();
  const key = `/chats/${id}`;
  const { data, error, mutate } = useSWR<ChatThread>(key, { refreshInterval: 4000 });
  const { mutate: globalMutate } = useSWRConfig();
  const toast = useToast();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const count = data?.messages.length ?? 0;
  const loaded = !!data;

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [count]);
  useEffect(() => {
    // Opening the thread marks it read; refresh the list badge and tab counter.
    if (loaded) {
      globalMutate("/chats");
      globalMutate("/chats/unread");
    }
  }, [count, loaded, globalMutate]);

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const m = await post<ChatMessage>(`${key}/messages`, { body });
      setText("");
      await mutate((cur) => (cur ? { ...cur, messages: [...cur.messages, m] } : cur), { revalidate: true });
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "ส่งข้อความไม่สำเร็จ");
    } finally {
      setSending(false);
    }
  }

  if (error) return <div className="p-4"><ErrorState error={error} /></div>;

  const o = data?.counterpart;
  const deals = data ? data.contracts.filter((c) => !["CANCELLED", "RESERVATION_EXPIRED"].includes(c.order_status)) : [];

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#eef3ec] lg:static lg:z-auto lg:h-full lg:overflow-hidden lg:rounded-2xl lg:border lg:border-slate-200/80 lg:shadow-sm">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-slate-200/80 bg-white px-3 py-2.5">
        <Link href="/chat" className="rounded-full p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="กลับไปรายการแชท">
          <ChevronLeft className="size-5" />
        </Link>
        {o ? <Avatar name={o.name} /> : <Skeleton className="size-10 rounded-full" />}
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold text-slate-900">{o?.name ?? "…"}</div>
          {o && (
            <div className="flex items-center gap-1 truncate text-xs text-slate-500">
              {o.business_type ? BUSINESS_TYPE[o.business_type] : o.kind === "FARM" ? "สวน" : "ผู้ซื้อ"}
              {o.province && <><MapPin className="ml-1 size-3" />{o.province}</>}
            </div>
          )}
        </div>
        {data?.counterpart_trust && <TrustBadge trust={data.counterpart_trust} orgId={o!.id} />}
      </header>

      {/* Deals between the pair (status chips from the sketch) */}
      {data && (deals.length > 0 || data.offers.length > 0) && (
        <div className="flex gap-2 overflow-x-auto border-b border-slate-200/80 bg-white/80 px-3 py-2">
          {deals.map((c) => (
            <Link key={c.id} href={`/contracts/${c.id}`} className="flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs hover:border-green-700">
              <FileSignature className="size-3.5 text-green-800" />
              <span className="font-medium text-slate-800">{c.code}</span>
              <span className="text-slate-500">{productName(c.product_type)} {fmtKg(c.quantity_kg)}</span>
              <DealChip deal={{ kind: "contract", id: c.id, code: c.code, status: c.order_status }} />
            </Link>
          ))}
          {data.offers.map((x) => (
            <Link key={x.id} href="/offers" className="flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs hover:border-green-700">
              <ShoppingBasket className="size-3.5 text-amber-600" />
              <span className="font-medium text-slate-800">{x.code}</span>
              <span className="text-slate-500">{fmtKg(x.quantity_kg)} · {x.listing_code}</span>
              <DealChip deal={{ kind: "offer", id: x.id, code: x.code, status: x.status }} />
            </Link>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 space-y-1.5 overflow-y-auto px-3 py-4 sm:px-5">
        {!data && [0, 1, 2].map((i) => <Skeleton key={i} className={cx("h-10 w-2/3", i % 2 === 1 && "ml-auto")} />)}
        {data?.messages.length === 0 && (
          <div className="mx-auto mt-10 max-w-xs rounded-2xl bg-white/80 p-4 text-center text-sm text-slate-500">
            เริ่มคุยกับ {o?.name} ได้เลย — ตกลงรายละเอียดแล้วอย่าลืมทำเป็น HarvestLock เพื่อให้มีผลผูกพัน
          </div>
        )}
        {data?.messages.map((m, i) => {
          const prev = data.messages[i - 1];
          const newDay = !prev || day(prev.created_at) !== day(m.created_at);
          const grouped = prev && !newDay && prev.mine === m.mine;
          return (
            <div key={m.id}>
              {newDay && <div className="my-3 text-center"><span className="rounded-full bg-white/80 px-3 py-1 text-[11px] text-slate-500 shadow-sm">{fmtDate(m.created_at)}</span></div>}
              <div className={cx("flex", m.mine ? "justify-end" : "justify-start", !grouped && "mt-2")}>
                <div
                  className={cx(
                    "max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm shadow-sm sm:max-w-[65%]",
                    m.mine ? "rounded-br-md bg-green-800 text-white" : "rounded-bl-md bg-white text-slate-800",
                  )}
                >
                  {!m.mine && !grouped && <div className="mb-0.5 text-[11px] font-semibold text-green-800">{m.sender.name}</div>}
                  {m.body}
                  <div className={cx("mt-0.5 text-right text-[10px]", m.mine ? "text-green-100" : "text-slate-400")}>{clock(m.created_at)}</div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={end} />
      </div>

      {/* Composer */}
      <form
        className="flex items-end gap-2 border-t border-slate-200/80 bg-white p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder="พิมพ์ข้อความ…"
          aria-label="ข้อความ"
          className="max-h-32 min-h-[42px] flex-1 resize-none rounded-2xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-green-700 focus:ring-2 focus:ring-green-700/20"
        />
        <button type="submit" disabled={!text.trim() || sending} className="flex size-[42px] shrink-0 items-center justify-center rounded-full bg-green-800 text-white disabled:opacity-40" aria-label="ส่งข้อความ">
          {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </button>
      </form>
    </div>
  );
}
