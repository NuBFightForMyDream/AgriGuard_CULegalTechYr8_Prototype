import Link from "next/link";
import { fmtDateTime } from "@/lib/format";
import { ACTOR_TONE, ROLE } from "@/lib/labels";
import type { AuditEvent } from "@/lib/types";
import { Badge, Empty } from "./ui";

export function ActivityList({ events }: { events: AuditEvent[] }) {
  if (!events.length) return <Empty title="ยังไม่มีความเคลื่อนไหว" />;
  return (
    <ol className="space-y-3">
      {events.map((e) => (
        <li key={e.id} className="flex gap-3 text-sm">
          <span className="mt-1.5 size-2 shrink-0 rounded-full bg-green-600" />
          <div className="min-w-0">
            <div className="text-slate-800">{e.message}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
              <Badge tone={ACTOR_TONE[e.actor_role]}>{e.actor?.name ?? ROLE[e.actor_role]}</Badge>
              {e.entity_code &&
                (e.contract_id ? (
                  <Link href={`/contracts/${e.contract_id}`} className="text-green-800 hover:underline">
                    {e.entity_code}
                  </Link>
                ) : (
                  <span>{e.entity_code}</span>
                ))}
              <span>{fmtDateTime(e.created_at)}</span>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
