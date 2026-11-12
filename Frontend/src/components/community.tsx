"use client";

import { Heart, MessageSquare, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useSWRConfig } from "swr";
import { api, post } from "@/lib/api";
import { fmtAgo } from "@/lib/format";
import { ACTOR_TONE, ROLE } from "@/lib/labels";
import type { CommunityAuthor, CommunityGroup, CommunityPost } from "@/lib/types";
import { useAction } from "@/lib/useAction";
import { useToast } from "./toast";
import { Avatar, Badge, Button, cx, Field, Input, Modal, Select, Textarea } from "./ui";

export function AuthorLine({ a, at, size = "md" }: { a: CommunityAuthor; at: string; size?: "sm" | "md" }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Avatar name={a.name} size={size === "sm" ? "sm" : "md"} />
      <div className="min-w-0 leading-tight">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-slate-900">{a.name}</span>
          <Badge tone={ACTOR_TONE[a.role]}>{ROLE[a.role]}</Badge>
        </div>
        <div className="truncate text-xs text-slate-500">{a.organization} · {fmtAgo(at)}</div>
      </div>
    </div>
  );
}

export function LikeButton({ p }: { p: CommunityPost }) {
  const { run, pending } = useAction();
  return (
    <button
      onClick={() => run(() => post(`/community/posts/${p.id}/like`))}
      disabled={pending}
      aria-pressed={p.liked}
      aria-label={p.liked ? "เลิกถูกใจ" : "ถูกใจ"}
      className={cx("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition", p.liked ? "bg-rose-50 text-rose-600" : "text-slate-500 hover:bg-slate-100")}
    >
      <Heart className={cx("size-4", p.liked && "fill-rose-500 text-rose-500")} />
      <span className="tabular">{p.likes}</span>
    </button>
  );
}

export function PostCard({ p }: { p: CommunityPost }) {
  return (
    <article className="rounded-3xl bg-white ring-1 ring-slate-900/[0.05] p-4 shadow-sm shadow-slate-900/[0.03] transition hover:border-green-300">
      <div className="flex items-start justify-between gap-2">
        <AuthorLine a={p.author} at={p.created_at} />
        <Link href={`/community?group=${p.group.slug}`} className="shrink-0 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-800 hover:bg-green-100">{p.group.name}</Link>
      </div>
      <Link href={`/community/${p.id}`} className="mt-3 block">
        <h3 className="font-semibold text-slate-900 hover:text-green-800">{p.title}</h3>
        <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-slate-600">{p.body}</p>
      </Link>
      <div className="mt-3 flex items-center gap-1 border-t border-slate-100 pt-2">
        <LikeButton p={p} />
        <Link href={`/community/${p.id}`} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-100">
          <MessageSquare className="size-4" />
          <span className="tabular">{p.comments}</span> ความคิดเห็น
        </Link>
      </div>
    </article>
  );
}

export function NewPostDialog({ open, onClose, groups, groupId, onCreated }: { open: boolean; onClose: () => void; groups: CommunityGroup[]; groupId?: string; onCreated?: (p: CommunityPost) => void }) {
  const { run, pending } = useAction();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [group, setGroup] = useState(groupId ?? "");
  const chosen = group || groupId || groups[0]?.id || "";
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const p = await run(() => post<CommunityPost>("/community/posts", { group_id: chosen, title, body }), "ตั้งกระทู้แล้ว");
    if (p) {
      setTitle("");
      setBody("");
      onClose();
      onCreated?.(p);
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="ตั้งกระทู้ใหม่">
      <form onSubmit={submit} className="space-y-4">
        <Field label="กลุ่ม">
          <Select value={chosen} onChange={(e) => setGroup(e.target.value)}>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </Select>
        </Field>
        <Field label="หัวข้อ"><Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} required minLength={3} placeholder="เช่น ปีนี้ราคามะม่วงเกรด B เป็นยังไงบ้าง" /></Field>
        <Field label="รายละเอียด" hint="อย่าโพสต์ข้อมูลส่วนตัว เช่น เบอร์โทรหรือเลขบัญชี"><Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={5000} required /></Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>ยกเลิก</Button>
          <Button type="submit" loading={pending} disabled={title.trim().length < 3 || !body.trim()}>โพสต์</Button>
        </div>
      </form>
    </Modal>
  );
}

export function DeleteButton({ path, label, onDone }: { path: string; label: string; onDone?: () => void }) {
  const { mutate } = useSWRConfig();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  return (
    <button
      disabled={pending}
      onClick={async () => {
        if (!window.confirm(`ลบ${label}นี้?`)) return;
        setPending(true);
        try {
          await api(path, { method: "DELETE" });
          toast("success", `ลบ${label}แล้ว`);
          onDone?.();
          // Refresh community data, but never refetch the item that was just deleted (it would 404).
          await mutate((k) => typeof k === "string" && k.startsWith("/community") && k !== path);
        } catch (e) {
          toast("error", e instanceof Error ? e.message : String(e));
        } finally {
          setPending(false);
        }
      }}
      className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600"
    >
      <Trash2 className="size-3.5" />ลบ
    </button>
  );
}
