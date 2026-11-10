"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { PageSkeleton } from "@/components/ui";

/** The legal assistant now lives in Chat as AgriBot; keep old links working. */
export default function AssistantRedirect() {
  const router = useRouter();
  useEffect(() => router.replace("/chat/agribot"), [router]);
  return <PageSkeleton />;
}
