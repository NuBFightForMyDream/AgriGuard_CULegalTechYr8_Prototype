"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { SESSION_KEY } from "./api";
import { supabase } from "./supabase";
import type { User } from "./types";

type Session = { user: User | null; ready: boolean; signIn: (u: User) => void; signOut: () => void };

const SessionContext = createContext<Session>({ user: null, ready: false, signIn: () => {}, signOut: () => {} });

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) setUser(JSON.parse(raw));
    } catch {
      /* storage unavailable: stay signed out */
    }
    setReady(true);
  }, []);

  const signIn = useCallback((u: User) => {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(u));
    } catch {
      /* ignore */
    }
    setUser(u);
  }, []);

  const signOut = useCallback(() => {
    supabase()?.auth.signOut().catch(() => {});
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      /* ignore */
    }
    setUser(null);
  }, []);

  return <SessionContext.Provider value={{ user, ready, signIn, signOut }}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);
