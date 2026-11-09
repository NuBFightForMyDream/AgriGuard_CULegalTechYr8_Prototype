import Link from "next/link";
import { fmtKg, fmtRange } from "@/lib/format";
import { ORDER_STATUS, productName } from "@/lib/labels";
import type { ContractBrief, Role } from "@/lib/types";
import { Empty, StatusBadge, Table, Td } from "./ui";

export function OrdersTable({ orders, role }: { orders: ContractBrief[]; role: Role }) {
  if (!orders.length) return <Empty title="ยังไม่มีคำสั่งซื้อ">คำสั่งซื้อจะปรากฏหลังเกษตรกรยืนยันแผนจัดสรร</Empty>;
  return (
    <Table head={["สัญญา", "ผลผลิต", role === "BUYER" ? "สวน" : "ผู้ซื้อ", "ปริมาณ", "ช่วงส่งมอบ", "สถานะ"]}>
      {orders.map((c) => (
        <tr key={c.id} className="hover:bg-slate-50">
          <Td>
            <Link href={`/contracts/${c.id}`} className="font-medium text-green-800 hover:underline">
              {c.code}
            </Link>
          </Td>
          <Td>{productName(c.product_type, c.variety)}</Td>
          <Td className="max-w-[220px] truncate">{role === "BUYER" ? c.farmer.name : c.buyer.name}</Td>
          <Td className="tabular">{fmtKg(c.quantity_kg)}</Td>
          <Td>{fmtRange(c.delivery_window[0], c.delivery_window[1])}</Td>
          <Td>
            <StatusBadge map={ORDER_STATUS} value={c.order_status} />
          </Td>
        </tr>
      ))}
    </Table>
  );
}
