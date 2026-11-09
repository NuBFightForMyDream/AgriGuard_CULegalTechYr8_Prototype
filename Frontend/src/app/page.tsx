"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, API_URL, Health, PurchaseRequest } from "@/lib/api";
import styles from "./page.module.css";

export default function Home() {
  const [health, setHealth] = useState<Health | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [h, list] = await Promise.all([api.health(), api.listPurchaseRequests()]);
      setHealth(h);
      setRequests(list);
      setHealthError(null);
    } catch (err) {
      setHealth(null);
      setHealthError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const text = (k: string) => String(data.get(k) ?? "").trim();
    setSubmitting(true);
    setFormError(null);
    try {
      await api.createPurchaseRequest({
        product_type: text("product_type"),
        variety: text("variety") || null,
        grade: text("grade") || null,
        quantity_kg: Number(text("quantity_kg")),
        delivery_start: text("delivery_start"),
        delivery_end: text("delivery_end"),
        location: text("location"),
      });
      form.reset();
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const ok = health?.status === "ok" && health.database === "ok";

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <div>
          <h1>AgriGuard</h1>
          <p className={styles.muted}>Base prototype: frontend → API → database</p>
        </div>
        <span className={`${styles.badge} ${ok ? styles.ok : styles.bad}`}>
          {health
            ? `API ok · DB ${health.database} (${health.dialect})`
            : healthError
              ? `API unreachable at ${API_URL}`
              : "Checking…"}
        </span>
      </header>

      <section className={styles.card}>
        <h2>New purchase request</h2>
        <form className={styles.form} onSubmit={onSubmit}>
          <label>
            Product type
            <input name="product_type" required placeholder="durian" />
          </label>
          <label>
            Variety
            <input name="variety" placeholder="Monthong" />
          </label>
          <label>
            Grade
            <input name="grade" placeholder="A" />
          </label>
          <label>
            Quantity (kg)
            <input name="quantity_kg" type="number" min="0.01" step="0.01" required />
          </label>
          <label>
            Delivery from
            <input name="delivery_start" type="date" required />
          </label>
          <label>
            Delivery to
            <input name="delivery_end" type="date" required />
          </label>
          <label className={styles.wide}>
            Location
            <input name="location" required placeholder="Chanthaburi" />
          </label>
          <div className={styles.wide}>
            <button type="submit" disabled={submitting || !health}>
              {submitting ? "Saving…" : "Create request"}
            </button>
            {formError && <p className={styles.error}>{formError}</p>}
          </div>
        </form>
      </section>

      <section className={styles.card}>
        <h2>Purchase requests ({requests.length})</h2>
        {requests.length === 0 ? (
          <p className={styles.muted}>No requests yet.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Product</th>
                  <th>Grade</th>
                  <th>Qty (kg)</th>
                  <th>Delivery window</th>
                  <th>Location</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((pr) => (
                  <tr key={pr.id}>
                    <td>{pr.id}</td>
                    <td>
                      {pr.product_type}
                      {pr.variety && <span className={styles.muted}> · {pr.variety}</span>}
                    </td>
                    <td>{pr.grade ?? "—"}</td>
                    <td>{Number(pr.quantity_kg).toLocaleString()}</td>
                    <td>
                      {pr.delivery_start} → {pr.delivery_end}
                    </td>
                    <td>{pr.location}</td>
                    <td>
                      <code>{pr.status}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
