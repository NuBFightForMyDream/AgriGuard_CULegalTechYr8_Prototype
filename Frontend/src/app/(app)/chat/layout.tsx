"use client";

import { usePathname } from "next/navigation";
import { ChatList } from "@/components/chat-list";
import { cx } from "@/components/ui";

/** Phone: the list and a thread are separate screens. Desktop: list on the left, thread on the right. */
export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const root = usePathname() === "/chat";
  return (
    <div className="-mx-4 -my-5 sm:-mx-6 lg:mx-0 lg:my-0 lg:grid lg:h-[calc(100dvh-8.5rem)] lg:grid-cols-[360px_1fr] lg:gap-4">
      <div className={cx("min-h-[calc(100dvh-10rem)] lg:min-h-0", root ? "block" : "hidden lg:block")}>
        <ChatList />
      </div>
      <div className={cx("min-h-0", root ? "hidden lg:block" : "block")}>{children}</div>
    </div>
  );
}
