"use client";

import { Check, Minus } from "lucide-react";
import { PlanBadge, useMyPlan } from "@/components/plan";
import { useToast } from "@/components/toast";
import { Card, PageHeader, cx } from "@/components/ui";
import { PLANS, PLAN_FEATURES, PLAN_ORDER, planRank, type PlanId } from "@/lib/plans";
import { useSession } from "@/lib/session";

export default function PlansPage() {
  const { user } = useSession();
  const [plan, setPlan] = useMyPlan();
  const toast = useToast();
  if (!user) return null;

  const choose = (p: PlanId) => {
    setPlan(p);
    toast("success", `เปลี่ยนเป็นแผน ${PLANS[p].name} แล้ว (จำลอง — ยังไม่เรียกเก็บเงินจริง)`);
  };

  return (
    <>
      <PageHeader
        eyebrow={user.organization.name}
        title="แผนบริการสำหรับโรงงานและผู้ซื้อ"
        subtitle="ฟีเจอร์ที่ปกป้องการซื้อขายใช้ได้ทุกแผน — แผนที่สูงขึ้นเพิ่มข้อมูลจัดซื้อ ทีม และการเชื่อมระบบองค์กร"
        actions={<span className="flex items-center gap-2 text-sm text-slate-500">แผนปัจจุบัน <PlanBadge plan={plan} /></span>}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {PLAN_ORDER.map((id) => {
          const p = PLANS[id];
          const current = id === plan;
          const dark = id === "ENTERPRISE";
          const featured = id === "PREMIUM";
          return (
            <section
              key={id}
              className={cx(
                "relative flex flex-col overflow-hidden rounded-[28px] p-6",
                dark ? "bg-green-950 text-white shadow-xl shadow-green-950/20" : "bg-white ring-1 ring-slate-900/[0.06]",
                featured && "ring-2 ring-lime-400",
              )}
            >
              {dark && <div className="glow-lime pointer-events-none absolute -right-24 -top-24 size-72" />}
              <div className="relative flex items-center justify-between gap-2">
                <PlanBadge plan={id} />
                {featured && <span className="rounded-full bg-lime-300 px-2 py-0.5 text-[11px] font-semibold text-green-950">ยอดนิยม</span>}
                {current && <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-semibold", dark ? "bg-white/10 text-white" : "bg-green-50 text-green-800")}>แผนของคุณ</span>}
              </div>
              <p className={cx("relative mt-4 text-sm", dark ? "text-green-100/80" : "text-slate-500")}>{p.tagline}</p>
              <div className="relative mt-3 flex items-baseline gap-2">
                <span className="text-4xl font-semibold tracking-tight">{p.price}</span>
                <span className={cx("text-sm", dark ? "text-green-100/70" : "text-slate-500")}>{p.priceNote}</span>
              </div>
              <div className={cx("relative mt-1 text-sm font-medium", dark ? "text-lime-300" : "text-green-800")}>+ {p.fee}</div>
              <ul className="relative mt-5 flex-1 space-y-2.5 text-sm">
                <li className="flex gap-2"><Check className={cx("mt-0.5 size-4 shrink-0", dark ? "text-lime-300" : "text-green-700")} />ผู้ใช้ {p.seats} · สวนต่อคำขอ {p.farmsPerRequest}</li>
                {p.highlights.map((h) => (
                  <li key={h} className="flex gap-2"><Check className={cx("mt-0.5 size-4 shrink-0", dark ? "text-lime-300" : "text-green-700")} />{h}</li>
                ))}
              </ul>
              <button
                disabled={current}
                onClick={() => choose(id)}
                className={cx(
                  "relative mt-6 rounded-full px-4 py-2.5 text-sm font-semibold transition active:scale-[0.98] disabled:cursor-default",
                  current
                    ? dark ? "bg-white/10 text-white/70" : "bg-slate-100 text-slate-500"
                    : dark ? "bg-lime-300 text-green-950 hover:bg-lime-200" : "bg-green-900 text-white hover:bg-green-950",
                )}
              >
                {current ? "ใช้อยู่ตอนนี้" : planRank(id) > planRank(plan) ? (id === "ENTERPRISE" ? "ทดลอง Enterprise" : `อัปเกรดเป็น ${p.name}`) : `เปลี่ยนเป็น ${p.name}`}
              </button>
            </section>
          );
        })}
      </div>

      <Card title="เปรียบเทียบฟีเจอร์" className="mt-6" bodyClassName="pb-2">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="text-left">
                <th className="px-5 py-3 font-medium text-slate-400">ฟีเจอร์</th>
                {PLAN_ORDER.map((id) => (
                  <th key={id} className={cx("px-3 py-3 text-center", id === plan && "bg-green-50/70")}><PlanBadge plan={id} /></th>
                ))}
              </tr>
            </thead>
            {PLAN_FEATURES.map((g) => (
              <tbody key={g.group}>
                <tr><td colSpan={4} className="px-5 pt-5 pb-1 text-xs font-semibold tracking-wide text-slate-400">{g.group}</td></tr>
                {g.rows.map((r) => (
                  <tr key={r.label} className="border-t border-slate-100">
                    <td className="px-5 py-2.5 text-slate-700">{r.label}</td>
                    {PLAN_ORDER.map((id) => {
                      const v = r.values[id];
                      return (
                        <td key={id} className={cx("px-3 py-2.5 text-center", id === plan && "bg-green-50/70")}>
                          {v === true ? <Check className="mx-auto size-4 text-green-700" aria-label="มี" /> : v === false ? <Minus className="mx-auto size-4 text-slate-300" aria-label="ไม่มี" /> : <span className="font-medium text-slate-900">{v}</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </Card>
      <p className="mt-4 text-xs text-slate-400">ราคาแพ็กเกจเป็นข้อเสนอเบื้องต้น ปรับได้หลังสัมภาษณ์ผู้ใช้ · การเปลี่ยนแผนในต้นแบบนี้เป็นการจำลอง ไม่มีการเรียกเก็บเงินจริง</p>
    </>
  );
}
