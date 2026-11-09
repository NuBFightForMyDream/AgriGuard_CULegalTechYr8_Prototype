export type Role = "FARMER" | "BUYER" | "INSPECTOR" | "ADMIN";

export type Org = {
  id: string;
  name: string;
  kind: "FARM" | "BUYER" | "PLATFORM";
  business_type: string | null;
  province: string | null;
  verified: boolean;
};

export type User = { id: string; name: string; email: string; role: Role; title: string | null; organization: Org; auth?: "google" | "demo" };

export type TrustSummary = {
  score: number | null;
  band: "LOW_RISK" | "MEDIUM_RISK" | "HIGH_RISK" | null;
  insufficient_data: boolean;
  transactions: number;
};

export type Inventory = {
  estimated_kg: number;
  available_kg: number;
  reserved_kg: number;
  contracted_kg: number;
  harvested_kg: number;
  delivered_kg: number;
  accepted_kg: number;
  rejected_kg: number;
  status: string;
};

export type Listing = {
  id: string;
  code: string;
  product_type: string;
  variety: string | null;
  estimated_qty_kg: number;
  harvest_start: string;
  harvest_end: string;
  expected_grades: string[];
  price_min: number | null;
  price_max: number | null;
  notes: string | null;
  farm: { id: string; name: string; province: string; organization_id: string };
  inventory: Inventory;
  pending_offers: number;
  offers?: Offer[];
  contracts?: ContractBrief[];
};

export type Offer = {
  id: string;
  code: string;
  status: string;
  quantity_kg: number;
  min_quantity_kg: number | null;
  grade_prices: Record<string, number>;
  top_price: number;
  payment_terms_days: number;
  deposit_thb: number;
  message: string | null;
  created_at: string;
  buyer: Org;
  buyer_trust: TrustSummary;
  purchase_request_code: string | null;
  listing: {
    id: string;
    code: string;
    product_type: string;
    variety: string | null;
    farm_name: string;
    harvest_start: string;
    harvest_end: string;
  };
};

export type PurchaseRequest = {
  id: string;
  code: string;
  buyer: Org;
  buyer_trust?: TrustSummary;
  product_type: string;
  variety: string | null;
  quantity_kg: number;
  min_quantity_kg: number | null;
  target_price: number | null;
  accepted_grades: string[];
  quality_notes: string | null;
  delivery_start: string;
  delivery_end: string;
  destination_province: string;
  payment_terms_days: number;
  expires_on: string | null;
  status: string;
  offers_count: number;
  best_match?: { score: number; listing_code: string; listing_id: string } | null;
  offers?: Offer[];
};

export type Match = {
  listing: Listing;
  already_offered: boolean;
  eligible: boolean;
  score: number;
  factors: Record<"timing" | "quantity" | "quality" | "logistics" | "reliability", number>;
  distance_km: number | null;
  reasons: string[];
};

export type ContractBrief = {
  id: string;
  code: string;
  status: string;
  order_status: string;
  quantity_kg: number;
  product_type: string;
  variety: string | null;
  listing_code: string;
  farmer: Org;
  buyer: Org;
  top_price: number;
  delivery_window: [string, string];
  reservation_expires_at: string | null;
  created_at: string;
  settlement_net: number | null;
  settlement_status: string | null;
};

export type Flag = { code: string; message: string };

export type Inspection = {
  id: string;
  lot_id: string;
  lot_code: string;
  contract_id: string;
  contract_code: string;
  inspector: { id: string; name: string; role: Role };
  inspected_at: string;
  received_kg: number;
  accepted_kg: number;
  rejected_kg: number;
  rejection_reason: string | null;
  sampling_method: string;
  evidence_note: string | null;
  notes: string | null;
  flags: Flag[];
  grades: { grade: string; quantity_kg: number }[];
};

export type Lot = {
  id: string;
  code: string;
  status: string;
  contract_id: string;
  contract_code: string;
  order_status: string;
  product_type: string;
  variety: string | null;
  farmer: Org;
  buyer: Org;
  contract_qty_kg: number;
  harvest_date: string;
  harvested_kg: number;
  vehicle: string | null;
  transport_operator: string | null;
  gross_kg: number | null;
  tare_kg: number | null;
  net_kg: number | null;
  dispatched_at: string | null;
  received_kg: number | null;
  received_at: string | null;
  destination_province: string;
  inspections: Inspection[];
};

export type SettlementLine = { grade: string; quantity_kg: number; price: number; amount: number };

export type Settlement = {
  id: string;
  contract_id: string;
  contract_code: string;
  order_status: string;
  product_type: string;
  variety: string | null;
  farmer: Org;
  buyer: Org;
  lines: SettlementLine[];
  gross_amount: number;
  deposit_amount: number;
  net_amount: number;
  paid_amount: number;
  outstanding: number;
  due_date: string;
  status: string;
  payments: { id: string; amount: number; reference: string; paid_at: string }[];
};

export type AuditEvent = {
  id: string;
  entity_type: string;
  entity_id: string;
  entity_code: string | null;
  action: string;
  from_status: string | null;
  to_status: string | null;
  actor: { id: string; name: string } | null;
  actor_role: Role | "SYSTEM";
  contract_id: string | null;
  message: string;
  created_at: string;
};

export type Terms = {
  farmer: string;
  buyer: string;
  listing_code: string;
  offer_code: string;
  product_type: string;
  variety: string | null;
  quantity_kg: number;
  tolerance_pct: number;
  grade_prices: Record<string, number>;
  harvest_window: [string, string];
  delivery_window: [string, string];
  destination_province: string;
  payment_due_days: number;
  deposit_thb: number;
  sampling_method: string;
  rejection_conditions: string[];
  shortfall_policy: string;
  cancellation: string;
  dispute_procedure: string;
};

export type Action =
  | "ACCEPT_HARVESTLOCK"
  | "DECLINE_HARVESTLOCK"
  | "RECORD_HARVEST"
  | "DISPATCH_LOT"
  | "RECEIVE_LOT"
  | "RECORD_QC"
  | "RECORD_PAYMENT"
  | "CONFIRM_PAYMENT_RECEIVED"
  | "OPEN_DISPUTE";

export type DisputeRef = { id: string; code: string; status: string; category: string; previous_order_status: string; outcome: string | null };

export type DisputeBrief = {
  id: string;
  code: string;
  category: string;
  category_label: string;
  status: string;
  contract_id: string;
  contract_code: string;
  opened_by_org: Org;
  against_org: Org;
  disputed_amount: number;
  held_amount: number;
  response_deadline: string;
  outcome: string | null;
  created_at: string;
  resolved_at: string | null;
};

export type DisputeDetail = DisputeBrief & {
  description: string;
  previous_order_status: string;
  contract: ContractBrief;
  opened_by: { id: string; name: string };
  reviewer: { id: string; name: string } | null;
  reviewer_notes: string | null;
  proposed_adjustment: number | null;
  resolution: string | null;
  settlement_adjustment: number | null;
  outcome_label: string | null;
  statements: { id: string; organization: Org; user_name: string; body: string; evidence_note: string | null; created_at: string; side: "FARMER" | "BUYER" }[];
  inspections: Inspection[];
  settlement: { net_amount: number; paid_amount: number; status: string } | null;
  timeline: AuditEvent[];
  actions: ("ADD_STATEMENT" | "START_REVIEW" | "REQUEST_REINSPECTION" | "RESOLVE" | "RECORD_REINSPECTION")[];
};

export type ContractDetail = ContractBrief & {
  terms: Terms;
  terms_hash: string;
  current_version: number;
  versions: { version: number; terms_hash: string; created_at: string }[];
  acceptances: { organization_id: string; user_name: string; version: number; terms_hash: string; accepted_at: string }[];
  confirmed_at: string | null;
  completed_at: string | null;
  purchase_request_code: string | null;
  offer_code: string;
  listing: Listing;
  buyer_trust: TrustSummary;
  lots: Lot[];
  inspection: Inspection | null;
  settlement: Settlement | null;
  timeline: AuditEvent[];
  actions: Action[];
  risks: string[];
  active_dispute: DisputeRef | null;
  disputes: DisputeRef[];
};

export type TrustDimension = {
  key: string;
  label: string;
  weight: number;
  successes: number;
  trials: number;
  rate: number | null;
  score: number;
  contribution: number;
};

export type TrustProfile = {
  organization: Org;
  profile: TrustSummary & { dimensions: TrustDimension[] };
  history: { month: string; score: number | null }[];
  min_transactions: number;
  recent_events: {
    id: string;
    dimension: string;
    success: boolean;
    verified: boolean;
    transaction_ref: string;
    contract_id: string | null;
    note: string | null;
    occurred_at: string;
  }[];
};

export type Catalog = {
  products: { key: string; th: string; varieties: string[]; grades: string[] }[];
  provinces: string[];
  rejection_reasons: { key: string; label: string }[];
};
