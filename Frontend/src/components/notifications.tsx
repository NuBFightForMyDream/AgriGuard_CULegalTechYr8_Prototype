"use client";

import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { post } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { cx } from "./ui";

type Feed = { unread: number; items: { id: string; title: string; body: string; link: string | null; read: boolean; created_at: string }[] };

export function NotificationBell() {
  const { data } = useSWR<Feed>("/notifications", { refreshInterval: 15000 });
  const { mutate } = useSWRConfig();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  async function go(id: string, link: string | null) {
    setOpen(false);
    await post(`/notifications/${id}/read`).catch(() => {});
    mutate("/notifications");
    if (link) router.push(link);
  }

  return (
    <div className="relative" ref={box}>
      <button onClick={() => setOpen((o) => !o)} className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="การแจ้งเตือน">
        <Bell className="size-5" />
        {!!data?.unread && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-semibold text-white">
            {data.unread > 9 ? "9+" : data.unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <span className="text-sm font-semibold">การแจ้งเตือน</span>
            {!!data?.unread && (
              <button className="text-xs text-green-800 hover:underline" onClick={async () => { await post("/notifications/read-all"); mutate("/notifications"); }}>
                อ่านทั้งหมด
              </button>
            )}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {!data?.items.length && <li className="px-4 py-6 text-center text-sm text-slate-500">ยังไม่มีการแจ้งเตือน</li>}
            {data?.items.map((n) => (
              <li key={n.id}>
                <button onClick={() => go(n.id, n.link)} className={cx("w-full border-b border-slate-50 px-4 py-2.5 text-left hover:bg-slate-50", !n.read && "bg-green-50/60")}>
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                    {!n.read && <span className="size-1.5 shrink-0 rounded-full bg-green-600" />}
                    {n.title}
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-xs text-slate-600">{n.body}</div>
                  <div className="mt-0.5 text-[11px] text-slate-400">{fmtDateTime(n.created_at)}</div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
