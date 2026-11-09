export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Health = { status: string; database: string; dialect: string };

export type PurchaseRequestInput = {
  product_type: string;
  variety: string | null;
  grade: string | null;
  quantity_kg: number;
  delivery_start: string;
  delivery_end: string;
  location: string;
};

export type PurchaseRequest = Omit<PurchaseRequestInput, "quantity_kg"> & {
  id: number;
  quantity_kg: string; // Decimal serialized as string by the API
  status: string;
  created_at: string;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = Array.isArray(body?.detail)
      ? body.detail.map((d: { msg: string }) => d.msg).join("; ")
      : body?.detail;
    throw new Error(detail ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => request<Health>("/health"),
  listPurchaseRequests: () => request<PurchaseRequest[]>("/purchase-requests"),
  createPurchaseRequest: (input: PurchaseRequestInput) =>
    request<PurchaseRequest>("/purchase-requests", {
      method: "POST",
      body: JSON.stringify(input),
    }),
};
