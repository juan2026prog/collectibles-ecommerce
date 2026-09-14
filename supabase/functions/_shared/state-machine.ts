/**
 * COLLECTIBLES 2026 — STATE MACHINE ENGINE
 * Unified Finite State Machine (FSM) for:
 * - Payment Status
 * - Order Status
 * - Shipment Status
 * - Refund Status
 * 
 * Prevents invalid regressions, idempotently absorbs duplicate events,
 * and handles out-of-order webhooks safely.
 */

// ═══ 1. PAYMENT STATE MACHINE ═══
export type PaymentStatus =
  | "pending"
  | "in_process"
  | "authorized"
  | "approved"
  | "rejected"
  | "failed"
  | "cancelled"
  | "expired"
  | "refunded"
  | "partially_refunded";

export const PAYMENT_TERMINAL_STATES: ReadonlySet<PaymentStatus> = new Set([
  "approved",
  "refunded",
  "partially_refunded",
]);

export const VALID_PAYMENT_TRANSITIONS: Record<PaymentStatus, ReadonlySet<PaymentStatus>> = {
  pending: new Set(["in_process", "authorized", "approved", "rejected", "failed", "cancelled", "expired"]),
  in_process: new Set(["authorized", "approved", "rejected", "failed", "cancelled", "expired"]),
  authorized: new Set(["approved", "rejected", "failed", "cancelled", "expired"]),
  approved: new Set(["refunded", "partially_refunded"]), // Approved can only transition to refund
  rejected: new Set(["pending", "in_process"]), // Allow buyer retry on same order if allowed by gateway
  failed: new Set(["pending", "in_process"]),
  cancelled: new Set([]),
  expired: new Set(["approved"]), // Allow late approval if gateway confirms funds were captured
  refunded: new Set([]),
  partially_refunded: new Set(["refunded"]),
};

export function canTransitionPayment(current: PaymentStatus, target: PaymentStatus): boolean {
  if (current === target) return true; // Idempotent no-op
  const allowed = VALID_PAYMENT_TRANSITIONS[current];
  return !!allowed && allowed.has(target);
}

// ═══ 2. ORDER STATE MACHINE ═══
export type OrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "ready_to_ship"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded"
  | "expired";

export const ORDER_TERMINAL_STATES: ReadonlySet<OrderStatus> = new Set([
  "delivered",
  "cancelled",
  "refunded",
]);

export const VALID_ORDER_TRANSITIONS: Record<OrderStatus, ReadonlySet<OrderStatus>> = {
  pending: new Set(["confirmed", "processing", "cancelled", "expired"]),
  confirmed: new Set(["processing", "ready_to_ship", "shipped", "cancelled", "refunded"]),
  processing: new Set(["ready_to_ship", "shipped", "cancelled", "refunded"]),
  ready_to_ship: new Set(["shipped", "cancelled", "refunded"]),
  shipped: new Set(["delivered", "refunded", "cancelled"]),
  delivered: new Set(["refunded"]), // Post-delivery refund only
  cancelled: new Set([]),
  refunded: new Set([]),
  expired: new Set(["confirmed", "processing"]), // Late payment revival
};

export function canTransitionOrder(current: OrderStatus, target: OrderStatus): boolean {
  if (current === target) return true; // Idempotent no-op
  const allowed = VALID_ORDER_TRANSITIONS[current];
  return !!allowed && allowed.has(target);
}

// ═══ 3. SHIPMENT STATE MACHINE ═══
export type ShipmentStatus =
  | "draft"
  | "queued"
  | "documented"
  | "label_created"
  | "preparing"
  | "ready_to_ship"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "failed"
  | "cancelled"
  | "returned";

export const SHIPMENT_TERMINAL_STATES: ReadonlySet<ShipmentStatus> = new Set([
  "delivered",
  "cancelled",
  "returned",
]);

export const VALID_SHIPMENT_TRANSITIONS: Record<ShipmentStatus, ReadonlySet<ShipmentStatus>> = {
  draft: new Set(["queued", "documented", "label_created", "preparing", "cancelled"]),
  queued: new Set(["documented", "label_created", "preparing", "ready_to_ship", "failed", "cancelled"]),
  documented: new Set(["label_created", "preparing", "ready_to_ship", "in_transit", "failed", "cancelled"]),
  label_created: new Set(["preparing", "ready_to_ship", "in_transit", "failed", "cancelled"]),
  preparing: new Set(["ready_to_ship", "in_transit", "failed", "cancelled"]),
  ready_to_ship: new Set(["in_transit", "failed", "cancelled"]),
  in_transit: new Set(["out_for_delivery", "delivered", "returned", "failed", "cancelled"]),
  out_for_delivery: new Set(["delivered", "returned", "failed", "in_transit"]),
  delivered: new Set([]),
  failed: new Set(["queued", "documented", "ready_to_ship", "cancelled"]), // Retry allowed
  cancelled: new Set([]),
  returned: new Set([]),
};

export function canTransitionShipment(current: ShipmentStatus, target: ShipmentStatus): boolean {
  if (current === target) return true; // Idempotent no-op
  const allowed = VALID_SHIPMENT_TRANSITIONS[current];
  return !!allowed && allowed.has(target);
}

// ═══ 4. REFUND STATE MACHINE ═══
export type RefundStatus =
  | "pending"
  | "approved"
  | "processing"
  | "completed"
  | "rejected"
  | "failed";

export const VALID_REFUND_TRANSITIONS: Record<RefundStatus, ReadonlySet<RefundStatus>> = {
  pending: new Set(["approved", "processing", "rejected", "failed"]),
  approved: new Set(["processing", "completed", "failed"]),
  processing: new Set(["completed", "failed"]),
  completed: new Set([]),
  rejected: new Set([]),
  failed: new Set(["pending", "processing"]), // Retry allowed
};

export function canTransitionRefund(current: RefundStatus, target: RefundStatus): boolean {
  if (current === target) return true;
  const allowed = VALID_REFUND_TRANSITIONS[current];
  return !!allowed && allowed.has(target);
}
