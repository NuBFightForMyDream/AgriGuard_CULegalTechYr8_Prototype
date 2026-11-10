"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { PageSkeleton } from "@/components/ui";

/** The legal assistant now lives in Chat as AgriChatLaw; keep old links working. */
export default function AssistantRedirect() {
  const router = useRouter();
  useEffect(() => router.replace("/chat/agrichatlaw"), [router]);
  return <PageSkeleton />;
}
