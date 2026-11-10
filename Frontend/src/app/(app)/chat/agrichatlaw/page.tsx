"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { AgriChatLawPanel } from "@/components/nav-chat";

export default function AgriChatLawPage() {
  return (
    <AgriChatLawPanel
      className="fixed inset-0 z-40 lg:static lg:z-auto lg:h-full lg:rounded-2xl lg:border lg:border-slate-200/80 lg:shadow-sm"
      back={
        <Link href="/chat" className="-ml-1 rounded-full p-1 hover:bg-white/10 lg:hidden" aria-label="กลับไปรายการแชท">
          <ChevronLeft className="size-5" />
        </Link>
      }
    />
  );
}
