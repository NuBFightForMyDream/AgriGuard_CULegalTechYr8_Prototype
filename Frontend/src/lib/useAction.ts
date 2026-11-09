"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import { useToast } from "@/components/toast";

/** Run a mutation, toast the outcome, then revalidate every cached query so changes propagate across pages. */
export function useAction() {
  const { mutate } = useSWRConfig();
  const toast = useToast();
  const [pending, setPending] = useState(false);

  async function run<T>(fn: () => Promise<T>, success?: string): Promise<T | undefined> {
    setPending(true);
    try {
      const result = await fn();
      if (success) toast("success", success);
      await mutate(() => true);
      return result;
    } catch (e) {
      toast("error", e instanceof Error ? e.message : String(e));
      return undefined;
    } finally {
      setPending(false);
    }
  }

  return { run, pending };
}
