import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Props = { orderId: string; orderToken?: string; isInternational: boolean; paymentMethod: string; orderStatus: string };

export function InternationalCancellationRequest({ orderId, orderToken, isInternational, paymentMethod, orderStatus }: Props) {
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "submitted" | "error">("idle");
  const [message, setMessage] = useState("");
  if (!isInternational || paymentMethod !== "dlocalgo" || ["refunded", "cancelled", "cancelada"].includes(orderStatus.toLowerCase())) return null;
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reason.trim().length < 5) return;
    setStatus("sending");
    try {
      const { data, error } = await supabase.functions.invoke("request-international-cancellation", {
        body: { order_id: orderId, order_token: orderToken, reason: reason.trim() },
      });
      if (error || !data?.success) throw new Error(data?.error || error?.message || "No se pudo enviar la solicitud");
      setStatus("submitted");
      setMessage("Solicitud recibida. Vamos a verificar si Zinc ya procesó el pedido. La cancelación y el reembolso todavía no están confirmados.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "No se pudo enviar la solicitud");
    }
  }
  return (
    <section aria-label="Solicitar cancelación internacional">
      <h3>Solicitar cancelación</h3>
      <p>La solicitud no garantiza la cancelación. Si el producto ya fue despachado, corresponde evaluar una devolución.</p>
      {status === "submitted" ? <p role="status">{message}</p> : (
        <form onSubmit={submit}>
          <label htmlFor={`cancel-reason-${orderId}`}>Motivo de la solicitud</label>
          <textarea id={`cancel-reason-${orderId}`} minLength={5} maxLength={1000} required value={reason} onChange={e => setReason(e.target.value)} />
          <button type="submit" disabled={status === "sending" || reason.trim().length < 5}>
            {status === "sending" ? "Enviando..." : "Solicitar cancelación"}
          </button>
          {status === "error" && <p role="alert">{message}</p>}
        </form>
      )}
    </section>
  );
}
