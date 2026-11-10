"use client";

import { Flame, MessagesSquare, PenSquare, Search, Sparkles, Users } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import useSWR from "swr";
import { NewPostDialog, PostCard } from "@/components/community";
import { Button, Card, Chips, cx, Empty, ErrorState, Input, PageHeader, PageSkeleton, Skeleton } from "@/components/ui";
import { fmtAgo } from "@/lib/format";
import type { CommunityGroup, CommunityPost } from "@/lib/types";

export default function CommunityPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Community />
    </Suspense>
  );
}

function Community() {
  const params = useSearchParams();
  const router = useRouter();
  const slug = params.get("group") ?? "";
  const [sort, setSort] = useState<"new" | "top">("new");
  const [q, setQ] = useState("");
  const [compose, setCompose] = useState(false);
  const groups = useSWR<CommunityGroup[]>("/community/groups");
  const qs = new URLSearchParams({ sort, ...(slug ? { group: slug } : {}), ...(q.trim() ? { q: q.trim() } : {}) });
  const posts = useSWR<CommunityPost[]>(`/community/posts?${qs}`, { keepPreviousData: true });
  if (groups.error) return <ErrorState error={groups.error} />;
  if (!groups.data) return <PageSkeleton />;
  const current = groups.data.find((g) => g.slug === slug);
  const pick = (s: string) => router.replace(s ? `/community?group=${s}` : "/community");

  return (
    <>
      <PageHeader
        title="ชุมชน"
        subtitle="พื้นที่แลกเปลี่ยนของชาวสวน ผู้ซื้อ และโรงงาน — ถาม แชร์ประสบการณ์ และเรียนรู้จากกัน"
        actions={<Button onClick={() => setCompose(true)}><PenSquare className="size-4" />ตั้งกระทู้</Button>}
      />
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* Desktop: group list */}
        <aside className="hidden lg:block">
          <Card title="กลุ่ม" bodyClassName="p-2">
            <GroupButton active={!slug} onClick={() => pick("")} icon={<Sparkles className="size-4" />} name="ทุกกลุ่ม" meta={`${groups.data.reduce((n, g) => n + g.posts, 0)} กระทู้`} />
            {groups.data.map((g) => (
              <GroupButton key={g.id} active={g.slug === slug} onClick={() => pick(g.slug)} icon={<Users className="size-4" />} name={g.name} meta={`${g.posts} กระทู้${g.latest_at ? ` · ล่าสุด ${fmtAgo(g.latest_at)}` : ""}`} />
            ))}
          </Card>
        </aside>

        <div className="min-w-0">
          {/* Phone: group chips */}
          <Chips className="mb-4 lg:hidden" value={slug} onChange={pick} items={[{ value: "", label: "ทุกกลุ่ม" }, ...groups.data.map((g) => ({ value: g.slug, label: g.name }))]} />
          {current && (
            <div className="mb-4 rounded-2xl bg-gradient-to-br from-green-800 to-emerald-600 p-5 text-white">
              <div className="flex items-center gap-2 text-sm text-green-100"><Users className="size-4" />กลุ่ม</div>
              <h2 className="mt-1 text-xl font-semibold">{current.name}</h2>
              <p className="mt-1 text-sm text-green-50">{current.description}</p>
              <div className="mt-2 text-xs text-green-100">{current.posts} กระทู้</div>
            </div>
          )}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200/80">
              {(
                [
                  ["new", "ใหม่ล่าสุด", Sparkles],
                  ["top", "ยอดนิยม", Flame],
                ] as const
              ).map(([v, label, Icon]) => (
                <button key={v} onClick={() => setSort(v)} className={cx("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium", sort === v ? "bg-green-800 text-white" : "text-slate-600 hover:bg-slate-50")}>
                  <Icon className="size-4" />
                  {label}
                </button>
              ))}
            </div>
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหากระทู้" className="rounded-full pl-9" aria-label="ค้นหากระทู้" />
            </div>
          </div>
          {posts.error && <ErrorState error={posts.error} />}
          {!posts.data && !posts.error && <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-36" />)}</div>}
          {posts.data && posts.data.length === 0 && (
            <Card>
              <Empty icon={<MessagesSquare className="size-10" />} title={q ? "ไม่พบกระทู้ที่ค้นหา" : "ยังไม่มีกระทู้ในกลุ่มนี้"}>
                {!q && <button onClick={() => setCompose(true)} className="text-green-800 underline">เป็นคนแรกที่ตั้งกระทู้</button>}
              </Empty>
            </Card>
          )}
          <div className="space-y-3">{posts.data?.map((p) => <PostCard key={p.id} p={p} />)}</div>
          <p className="mt-6 text-center text-xs text-slate-400">
            ความเห็นในชุมชนเป็นของผู้โพสต์ ไม่ใช่คำแนะนำทางกฎหมายจาก AgriGuard · ดู <Link href="/assistant" className="underline">ผู้ช่วยกฎหมาย AI</Link>
          </p>
        </div>
      </div>
      <NewPostDialog open={compose} onClose={() => setCompose(false)} groups={groups.data} groupId={current?.id} onCreated={(p) => router.push(`/community/${p.id}`)} />
    </>
  );
}

function GroupButton({ active, onClick, icon, name, meta }: { active: boolean; onClick: () => void; icon: React.ReactNode; name: string; meta: string }) {
  return (
    <button onClick={onClick} className={cx("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left", active ? "bg-green-50" : "hover:bg-slate-50")}>
      <span className={cx("flex size-9 shrink-0 items-center justify-center rounded-xl", active ? "bg-green-800 text-white" : "bg-slate-100 text-slate-500")}>{icon}</span>
      <span className="min-w-0">
        <span className={cx("block truncate text-sm font-medium", active ? "text-green-900" : "text-slate-800")}>{name}</span>
        <span className="block truncate text-xs text-slate-500">{meta}</span>
      </span>
    </button>
  );
}
