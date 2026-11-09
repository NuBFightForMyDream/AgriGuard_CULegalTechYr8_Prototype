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

function currentUserId(): string | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as { id: string }).id : null;
  } catch {
    return null;
  }
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
  const userId = currentUserId();
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(userId ? { "X-Demo-User": userId } : {}),
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
