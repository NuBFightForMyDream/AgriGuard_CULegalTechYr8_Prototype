"use client";

import { ArrowUpRight, Crown, Gem, Lock, Sparkles } from "lucide-react";
import Link from "next/link";
import { PLANS, hasPlan, usePlan, type PlanId } from "@/lib/plans";
import { useSession } from "@/lib/session";
import { cx } from "./ui";

const PLAN_STYLE: Record<PlanId, { chip: string; icon: React.ElementType }> = {
  BASIC: { chip: "bg-slate-100 text-slate-700 ring-slate-200", icon: Sparkles },
  PREMIUM: { chip: "bg-lime-100 text-green-900 ring-lime-300", icon: Gem },
  ENTERPRISE: { chip: "bg-green-950 text-lime-300 ring-green-950", icon: Crown },
};

export function PlanBadge({ plan, className }: { plan: PlanId; className?: string }) {
  const S = PLAN_STYLE[plan];
  return (
    <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset", S.chip, className)}>
      <S.icon className="size-3" />
      {PLANS[plan].name}
    </span>
  );
}

/** Current buyer org's plan; non-buyers are treated as Basic. */
export function useMyPlan(): [PlanId, (p: PlanId) => void] {
  const { user } = useSession();
  const fallback = { id: "-", name: "", kind: "PLATFORM" as const, business_type: null, province: null, verified: false };
  return usePlan(user?.organization ?? fallback);
}

/**
 * Shows `children` when the plan allows it; otherwise a blurred, inert preview of the same content
 * with an upgrade card on top, so people can see what the feature does before upgrading.
 */
export function PlanGate({ need, title, children, className }: { need: PlanId; title: string; children: React.ReactNode; className?: string }) {
  const [plan] = useMyPlan();
  if (hasPlan(plan, need)) return <>{children}</>;
  return (
    <div className={cx("relative isolate", className)}>
      <div className="pointer-events-none select-none blur-[5px] saturate-50" aria-hidden inert>
        {children}
      </div>
      <div className="absolute inset-0 z-10 flex items-start justify-center bg-canvas/40 p-4 pt-10 sm:items-center sm:pt-4">
        <div className="w-full max-w-sm rounded-3xl bg-white p-5 text-center shadow-2xl shadow-green-950/15 ring-1 ring-slate-900/[0.06]">
          <span className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-green-950 text-lime-300"><Lock className="size-5" /></span>
          <div className="mt-3 flex items-center justify-center gap-2">
            <span className="font-semibold tracking-tight text-slate-900">{title}</span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            ใช้ได้ในแผน <PlanBadge plan={need} className="align-middle" /> {need === "PREMIUM" && "ขึ้นไป"} — แผนปัจจุบันของคุณคือ {PLANS[plan].name}
          </p>
          <Link href="/plans" className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-full bg-green-900 px-4.5 py-2.5 text-sm font-medium text-white hover:bg-green-950">
            ดูแผนและอัปเกรด <ArrowUpRight className="size-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Home card for buyers: current plan, what it unlocks, and where to go next. */
export function PlanCard() {
  const [plan] = useMyPlan();
  const p = PLANS[plan];
  const next = plan === "BASIC" ? PLANS.PREMIUM : plan === "PREMIUM" ? PLANS.ENTERPRISE : null;
  return (
    <div className="mt-3 flex flex-col gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-900/[0.05] sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className={cx("flex size-11 shrink-0 items-center justify-center rounded-2xl", plan === "ENTERPRISE" ? "bg-green-950 text-lime-300" : plan === "PREMIUM" ? "bg-lime-200 text-green-900" : "bg-slate-100 text-slate-600")}>
          {(() => {
            const I = PLAN_STYLE[plan].icon;
            return <I className="size-5" />;
          })()}
        </span>
        <div className="min-w-0 leading-tight">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            แผนของบริษัท <PlanBadge plan={plan} />
          </div>
          <div className="mt-1 truncate text-sm font-medium text-slate-900">
            {next ? `อัปเกรดเป็น ${next.name}: ${next.highlights.slice(0, 2).join(" · ")}` : p.highlights.join(" · ")}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <Link href="/insights" className="flex-1 rounded-full bg-canvas px-4 py-2 text-center text-sm font-medium text-slate-700 hover:bg-slate-200/60 sm:flex-none">Insights</Link>
        <Link href="/plans" className="flex-1 rounded-full bg-green-900 px-4 py-2 text-center text-sm font-medium text-white hover:bg-green-950 sm:flex-none">{next ? "ดูแผน" : "จัดการแผน"}</Link>
      </div>
    </div>
  );
}
