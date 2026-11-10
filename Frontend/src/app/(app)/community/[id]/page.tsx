"use client";

import { ChevronLeft, Send } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import { AuthorLine, DeleteButton, LikeButton } from "@/components/community";
import { Avatar, Card, Empty, ErrorState, PageSkeleton } from "@/components/ui";
import { post } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { CommunityPost } from "@/lib/types";
import { useAction } from "@/lib/useAction";

export default function PostPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useSession();
  const { data, error } = useSWR<CommunityPost>(`/community/posts/${id}`);
  const { run, pending } = useAction();
  const [text, setText] = useState("");
  if (error) return <ErrorState error={error} />;
  if (!data || !user) return <PageSkeleton />;

  async function comment(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    const ok = await run(() => post(`/community/posts/${id}/comments`, { body: text }));
    if (ok) setText("");
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link href={`/community?group=${data.group.slug}`} className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-green-800 hover:underline">
        <ChevronLeft className="size-4" />{data.group.name}
      </Link>
      <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <AuthorLine a={data.author} at={data.created_at} />
          {data.can_delete && <DeleteButton path={`/community/posts/${data.id}`} label="กระทู้" onDone={() => router.replace("/community")} />}
        </div>
        <h1 className="mt-4 text-xl font-semibold text-slate-900">{data.title}</h1>
        <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-slate-700">{data.body}</p>
        <div className="mt-4 border-t border-slate-100 pt-2"><LikeButton p={data} /></div>
      </article>

      <h2 className="mb-3 mt-6 font-semibold text-slate-900">{data.comments} ความคิดเห็น</h2>
      <form onSubmit={comment} className="mb-4 flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-sm">
        <Avatar name={user.name} size="sm" />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="แสดงความคิดเห็น…"
          aria-label="แสดงความคิดเห็น"
          className="min-h-[44px] flex-1 resize-y rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-green-700 focus:ring-2 focus:ring-green-700/20"
        />
        <button type="submit" disabled={!text.trim() || pending} className="flex size-10 items-center justify-center rounded-full bg-green-800 text-white disabled:opacity-40" aria-label="ส่งความคิดเห็น">
          <Send className="size-4" />
        </button>
      </form>
      {data.comment_list?.length ? (
        <ul className="space-y-3">
          {data.comment_list.map((c) => (
            <li key={c.id} className="rounded-2xl border border-slate-200/80 bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <AuthorLine a={c.author} at={c.created_at} size="sm" />
                {c.can_delete && <DeleteButton path={`/community/comments/${c.id}`} label="ความคิดเห็น" />}
              </div>
              <p className="mt-2 whitespace-pre-wrap pl-[42px] text-sm text-slate-700">{c.body}</p>
            </li>
          ))}
        </ul>
      ) : (
        <Card><Empty title="ยังไม่มีความคิดเห็น">เริ่มแลกเปลี่ยนเป็นคนแรก</Empty></Card>
      )}
    </div>
  );
}
