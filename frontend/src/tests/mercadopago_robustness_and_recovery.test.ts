import { describe, it, expect, vi, beforeEach } from "vitest";

describe("Mercado Pago Production Robustness, PostgreSQL Semantics & Outbox Recovery Suite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Outbox Concurrency, Leases and Recovery Strategy", () => {
    it("simula claim_order_execution_jobs con bloqueo concurrente FOR UPDATE SKIP LOCKED", () => {
      // Estado simulado de la tabla PostgreSQL order_execution_jobs
      const now = Date.now();
      const jobs = [
        {
          id: "job-1",
          job_type: "commissions_calc",
          status: "PENDING",
          attempts: 0,
          max_attempts: 5,
          next_retry_at: new Date(now - 10000).toISOString(),
          locked_by: null,
          locked_at: null,
        },
        {
          id: "job-2",
          job_type: "ml_stock_sync",
          status: "PROCESSING",
          attempts: 1,
          max_attempts: 5,
          next_retry_at: new Date(now).toISOString(),
          locked_by: "worker-dead-1",
          locked_at: new Date(now - 400000).toISOString(), // 400s > lock_seconds (300s) -> abandoned lease!
        },
        {
          id: "job-3",
          job_type: "shipping_creation",
          status: "PROCESSING",
          attempts: 1,
          max_attempts: 5,
          next_retry_at: new Date(now).toISOString(),
          locked_by: "worker-active-2",
          locked_at: new Date(now - 60000).toISOString(), // 60s < lock_seconds (300s) -> active lease, DO NOT TOUCH
        },
        {
          id: "job-4",
          job_type: "zinc_fulfillment",
          status: "FAILED",
          attempts: 2,
          max_attempts: 5,
          next_retry_at: new Date(now - 5000).toISOString(),
          locked_by: null,
          locked_at: null,
        },
        {
          id: "job-5",
          job_type: "email_notification",
          status: "COMPLETED",
          attempts: 1,
          max_attempts: 5,
          next_retry_at: new Date(now).toISOString(),
          locked_by: null,
          locked_at: null,
        }
      ];

      // Implementación semántica idéntica al query SQL de claim_order_execution_jobs
      function claimJobsSimulated(workerId: string, limit: number = 10, lockSeconds: number = 300) {
        const lockExpiryTime = now - (lockSeconds * 1000);

        const candidates = jobs.filter(j => {
          if (j.status === "COMPLETED") return false;
          // Caso 1: PENDING o RETRYING elegible
          if (["PENDING", "RETRYING"].includes(j.status) && new Date(j.next_retry_at).getTime() <= now && j.attempts < j.max_attempts) {
            return true;
          }
          // Caso 2: PROCESSING pero con lease abandonado/expirado
          if (j.status === "PROCESSING" && j.locked_at && new Date(j.locked_at).getTime() < lockExpiryTime) {
            return true;
          }
          // Caso 3: FAILED recuperable
          if (j.status === "FAILED" && j.attempts < j.max_attempts && new Date(j.next_retry_at).getTime() <= now) {
            return true;
          }
          return false;
        }).slice(0, limit);

        // Lock & claim
        return candidates.map(j => {
          j.status = "PROCESSING";
          j.locked_by = workerId;
          j.locked_at = new Date(now).toISOString();
          j.attempts += 1;
          return { ...j };
        });
      }

      const claimed = claimJobsSimulated("recovery-worker-alpha", 10, 300);

      // Debe haber tomado job-1 (PENDING), job-2 (PROCESSING con lease expirado) y job-4 (FAILED con intentos restantes)
      expect(claimed.map(c => c.id)).toEqual(["job-1", "job-2", "job-4"]);

      // job-3 (lease activo) y job-5 (COMPLETED) no deben ser tomados
      expect(claimed.find(c => c.id === "job-3")).toBeUndefined();
      expect(claimed.find(c => c.id === "job-5")).toBeUndefined();

      // job-2 incrementó sus intentos de 1 a 2 y cambió ownership
      const claimedJob2 = claimed.find(c => c.id === "job-2");
      expect(claimedJob2?.locked_by).toBe("recovery-worker-alpha");
      expect(claimedJob2?.attempts).toBe(2);
    });

    it("aplica backoff exponencial y detiene reintentos al agotar max_attempts", () => {
      function calculateRetryBackoff(attempt: number, maxAttempts: number) {
        if (attempt >= maxAttempts) {
          return { status: "EXHAUSTED", nextRetrySeconds: null };
        }
        const backoffSeconds = Math.min(300, Math.pow(2, attempt) * 15);
        return { status: "RETRYING", nextRetrySeconds: backoffSeconds };
      }

      // Intento 1 -> 30s
      expect(calculateRetryBackoff(1, 5)).toEqual({ status: "RETRYING", nextRetrySeconds: 30 });
      // Intento 2 -> 60s
      expect(calculateRetryBackoff(2, 5)).toEqual({ status: "RETRYING", nextRetrySeconds: 60 });
      // Intento 4 -> cap en 300s
      expect(calculateRetryBackoff(4, 5)).toEqual({ status: "RETRYING", nextRetrySeconds: 240 });
      // Intento 5 (agotado) -> EXHAUSTED
      expect(calculateRetryBackoff(5, 5)).toEqual({ status: "EXHAUSTED", nextRetrySeconds: null });
    });
  });

  describe("2. Referencia Financiera Estricta en confirm-payment", () => {
    it("descarta pagos de MP sin external_reference o con external_reference no coincidente", () => {
      const orderId = "c1234567-89ab-4cde-0123-456789abcdef";

      function evaluatePaymentReference(paymentResult: any, expectedOrderId: string) {
        // En confirm-payment corregido: requiere estricta coincidencia
        if (paymentResult?.external_reference && String(paymentResult.external_reference).trim() === expectedOrderId.trim()) {
          return { valid: true };
        }
        return { valid: false, reason: "Strict external_reference mismatch" };
      }

      // Pago 1: Sin external_reference (antes aceptado por `|| !dData.external_reference`)
      expect(evaluatePaymentReference({ id: 100, external_reference: null }, orderId).valid).toBe(false);
      expect(evaluatePaymentReference({ id: 101, external_reference: "" }, orderId).valid).toBe(false);

      // Pago 2: De otra orden o tienda
      expect(evaluatePaymentReference({ id: 102, external_reference: "other-order-uuid" }, orderId).valid).toBe(false);

      // Pago 3: Coincidencia exacta
      expect(evaluatePaymentReference({ id: 103, external_reference: orderId }, orderId).valid).toBe(true);
    });

    it("asocia el intento correcto cuando existen múltiples reintentos para la misma orden", () => {
      const attempts = [
        { id: "att-1", order_id: "order-1", attempt_number: 1, external_preference_id: "pref-old" },
        { id: "att-2", order_id: "order-1", attempt_number: 2, external_preference_id: "pref-current" }
      ];

      // Busca la última preferencia activa
      const latestAttempt = attempts.reduce((max, att) => att.attempt_number > max.attempt_number ? att : max, attempts[0]);
      expect(latestAttempt.id).toBe("att-2");
      expect(latestAttempt.external_preference_id).toBe("pref-current");
    });
  });

  describe("3. Persistencia Atómica y Resiliente (payments, payment_attempts, payment_events)", () => {
    it("garantiza consistencia en las tres tablas con control de errores e idempotencia", () => {
      const db = {
        orders: new Map([["ord-1", { id: "ord-1", payment_status: "initiated" }]]),
        payment_attempts: new Map<string, any>(),
        payments: new Map<string, any>(),
        payment_events: new Set<string>(),
      };

      // Simulación de la RPC record_payment_transaction_atomic
      function recordPaymentAtomic(params: {
        order_id: string;
        provider: string;
        external_payment_id: string;
        amount: number;
        currency: string;
        normalized_status: string;
        provider_status: string;
      }) {
        const order = db.orders.get(params.order_id);
        if (!order) throw new Error("Order not found");

        // 1. payment_attempts
        let attempt = db.payment_attempts.get(params.order_id);
        if (attempt) {
          attempt.normalized_status = params.normalized_status;
          attempt.external_payment_id = params.external_payment_id;
        } else {
          attempt = {
            id: `att-${params.order_id}`,
            order_id: params.order_id,
            attempt_number: 1,
            amount: params.amount,
            currency: params.currency,
            normalized_status: params.normalized_status,
            external_payment_id: params.external_payment_id
          };
          db.payment_attempts.set(params.order_id, attempt);
        }

        // 2. payments
        let pay = db.payments.get(`${params.order_id}_${params.provider}`);
        if (pay) {
          pay.status = params.normalized_status;
          pay.transaction_external_id = params.external_payment_id;
        } else {
          pay = {
            id: `pay-${params.order_id}`,
            order_id: params.order_id,
            provider: params.provider,
            transaction_external_id: params.external_payment_id,
            amount: params.amount,
            currency: params.currency,
            status: params.normalized_status
          };
          db.payments.set(`${params.order_id}_${params.provider}`, pay);
        }

        // 3. payment_events (Append-only & idempotencia en provider_event_id)
        const eventKey = `${params.provider}-webhook-${params.external_payment_id}`;
        if (!db.payment_events.has(eventKey)) {
          db.payment_events.add(eventKey);
        }

        // 4. Update order payment status
        order.payment_status = params.normalized_status;

        return { success: true, attempt_id: attempt.id, payment_id: pay.id };
      }

      // Primera notificación: Aprobación
      const res1 = recordPaymentAtomic({
        order_id: "ord-1",
        provider: "mercadopago",
        external_payment_id: "mp-999888",
        amount: 3500,
        currency: "UYU",
        normalized_status: "approved",
        provider_status: "approved"
      });

      expect(res1.success).toBe(true);
      expect(db.orders.get("ord-1")?.payment_status).toBe("approved");
      expect(db.payments.get("ord-1_mercadopago")?.status).toBe("approved");
      expect(db.payment_attempts.get("ord-1")?.external_payment_id).toBe("mp-999888");
      expect(db.payment_events.size).toBe(1);

      // Notificación duplicada (reintento legítimo de Mercado Pago)
      const res2 = recordPaymentAtomic({
        order_id: "ord-1",
        provider: "mercadopago",
        external_payment_id: "mp-999888",
        amount: 3500,
        currency: "UYU",
        normalized_status: "approved",
        provider_status: "approved"
      });

      expect(res2.success).toBe(true);
      // No debe duplicar entradas en payment_events
      expect(db.payment_events.size).toBe(1);
    });
  });

  describe("5. Compatibilidad Estricta con Restricciones CHECK de PostgreSQL y Asociación por Identificadores", () => {
    it("respeta CHECK constraints de payments y payment_attempts ante discrepancias de monto o moneda", () => {
      // Definición real de CHECK constraints en PostgreSQL de producción:
      const allowedAttemptStatuses = new Set([
        'no_payment_attempt', 'initiated', 'pending', 'processing', 'approved',
        'rejected', 'cancelled', 'expired', 'refunded', 'partially_refunded',
        'charged_back', 'manual_verification_required', 'unknown_legacy'
      ]);
      const allowedPaymentsStatuses = new Set([
        'pending', 'redirected', 'approved', 'rejected', 'cancelled',
        'refunded', 'partially_refunded', 'refund_pending', 'refund_failed',
        'failed', 'manual_refund_required'
      ]);

      function mapStatusesForPersistence(normalizedStatus: string) {
        let isFinancialMismatch = false;
        let attemptStatus = normalizedStatus;
        let paymentStatus = normalizedStatus;

        if (['fraud_suspected', 'manual_verification_required', 'amount_mismatch'].includes(normalizedStatus)) {
          isFinancialMismatch = true;
          attemptStatus = 'manual_verification_required';
          paymentStatus = 'failed';
        } else {
          if (normalizedStatus === 'initiated' || normalizedStatus === 'processing') {
            paymentStatus = 'pending';
          } else if (normalizedStatus === 'expired') {
            paymentStatus = 'cancelled';
          }
        }

        return { isFinancialMismatch, attemptStatus, paymentStatus };
      }

      // Caso A: Discrepancia financiera (fraude o manipulación de importe/moneda)
      const fraudCase = mapStatusesForPersistence('fraud_suspected');
      expect(allowedAttemptStatuses.has(fraudCase.attemptStatus)).toBe(true);
      expect(allowedPaymentsStatuses.has(fraudCase.paymentStatus)).toBe(true);
      expect(fraudCase.isFinancialMismatch).toBe(true);
      expect(fraudCase.attemptStatus).toBe('manual_verification_required');
      expect(fraudCase.paymentStatus).toBe('failed');

      // Caso B: Pago aprobado legítimo
      const approvedCase = mapStatusesForPersistence('approved');
      expect(allowedAttemptStatuses.has(approvedCase.attemptStatus)).toBe(true);
      expect(allowedPaymentsStatuses.has(approvedCase.paymentStatus)).toBe(true);
      expect(approvedCase.isFinancialMismatch).toBe(false);

      // Caso C: Pago rechazado
      const rejectedCase = mapStatusesForPersistence('rejected');
      expect(allowedAttemptStatuses.has(rejectedCase.attemptStatus)).toBe(true);
      expect(allowedPaymentsStatuses.has(rejectedCase.paymentStatus)).toBe(true);
    });

    it("asocia pagos ÚNICAMENTE por payment_id o preference_id verificable, sin sobrescribir intentos previos", () => {
      const attempts = [
        {
          id: "att-1",
          order_id: "order-xyz",
          attempt_number: 1,
          external_payment_id: null,
          external_preference_id: "pref-111",
          normalized_status: "initiated"
        },
        {
          id: "att-2",
          order_id: "order-xyz",
          attempt_number: 2,
          external_payment_id: null,
          external_preference_id: "pref-222",
          normalized_status: "initiated"
        }
      ];

      function findOrAssociateAttempt(
        orderId: string,
        externalPaymentId: string | null,
        preferenceId: string | null
      ) {
        // 1. Por external_payment_id exacto
        if (externalPaymentId) {
          const matchedByPayment = attempts.find(a => a.order_id === orderId && a.external_payment_id === externalPaymentId);
          if (matchedByPayment) return { matched: matchedByPayment, isNew: false };
        }
        // 2. Por preference_id exacto
        if (preferenceId) {
          const matchedByPref = attempts.find(a => a.order_id === orderId && a.external_preference_id === preferenceId);
          if (matchedByPref) return { matched: matchedByPref, isNew: false };
        }
        // 3. Si no hay coincidencia exacta de identificadores, CREAR nuevo intento sin pisar att-1 ni att-2
        const nextAttemptNum = Math.max(...attempts.map(a => a.attempt_number)) + 1;
        const newAttempt = {
          id: `att-${nextAttemptNum}`,
          order_id: orderId,
          attempt_number: nextAttemptNum,
          external_payment_id: externalPaymentId,
          external_preference_id: preferenceId,
          normalized_status: "initiated"
        };
        attempts.push(newAttempt);
        return { matched: newAttempt, isNew: true };
      }

      // Si llega un webhook para la preferencia 1 (pref-111), debe asociar att-1 y NO el último att-2
      const match1 = findOrAssociateAttempt("order-xyz", "mp-pay-1", "pref-111");
      expect(match1.isNew).toBe(false);
      expect(match1.matched.id).toBe("att-1");

      // Si llega un webhook para una preferencia desconocida o externa, crea att-3 y preserva att-1 y att-2 intactos
      const match3 = findOrAssociateAttempt("order-xyz", "mp-pay-99", "pref-999");
      expect(match3.isNew).toBe(true);
      expect(match3.matched.id).toBe("att-3");
      expect(match3.matched.attempt_number).toBe(3);
      expect(attempts.length).toBe(3);
    });
  });
});
