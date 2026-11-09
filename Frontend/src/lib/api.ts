import { accessToken } from "./supabase";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
export const SESSION_KEY = "agriguard.user";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

type Stored = { id: string; auth?: "google" | "demo" };

function storedSession(): Stored | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

/** Google users send their Supabase access token; demo users send the picked demo id. */
async function authHeaders(): Promise<Record<string, string>> {
  const token = await accessToken();
  if (token) return { Authorization: `Bearer ${token}` };
  const s = storedSession();
  return s && s.auth !== "google" ? { "X-Demo-User": s.id } : {};
}

function errorMessage(body: unknown, status: number): string {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => (typeof d === "string" ? d : String((d as { msg?: string }).msg ?? "")).replace(/^Value error, /, ""))
      .join(" · ");
  }
  return `คำขอไม่สำเร็จ (${status})`;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const auth = await authHeaders();
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...auth,
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiError(`เชื่อมต่อ API ไม่ได้ (${API_URL})`, 0);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(errorMessage(body, res.status), res.status);
  return body as T;
}

export const fetcher = <T,>(path: string) => api<T>(path);

export function post<T>(path: string, body?: unknown, headers?: Record<string, string>) {
  return api<T>(path, { method: "POST", body: JSON.stringify(body ?? {}), headers });
}
