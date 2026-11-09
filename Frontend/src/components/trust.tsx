import { ShieldCheck, ShieldQuestion } from "lucide-react";
import Link from "next/link";
import { TRUST_BAND } from "@/lib/labels";
import type { TrustSummary } from "@/lib/types";
import { Badge } from "./ui";

export function TrustBadge({ trust, orgId }: { trust: TrustSummary; orgId?: string }) {
  const body = trust.insufficient_data ? (
    <Badge tone="gray">
      <ShieldQuestion className="size-3" />
      ข้อมูลไม่เพียงพอ
    </Badge>
  ) : (
    <Badge tone={TRUST_BAND[trust.band ?? ""]?.[1] ?? "gray"}>
      <ShieldCheck className="size-3" />
      <span className="tabular">{trust.score?.toFixed(0)}</span>/100 · {trust.transactions} ธุรกรรม
    </Badge>
  );
  return orgId ? (
    <Link href={`/buyers/${orgId}`} className="hover:opacity-80" title="ดูโปรไฟล์ AgriTrust">
      {body}
    </Link>
  ) : (
    body
  );
}
