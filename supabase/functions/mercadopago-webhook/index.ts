import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  // Always return 200 quickly to avoid MP retries
  if (req.method !== "POST") return new Response("ok", { status: 200 });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let body: any = {};
  try {
    const raw = await req.text();
    body = raw ? JSON.parse(raw) : {};
  } catch {
    console.error("Failed to parse webhook body");
    return new Response("ok", { status: 200 });
  }

  console.log("[webhook] received body:", JSON.stringify(body));
  console.log("[webhook] headers x-signature:", req.headers.get("x-signature"));
  console.log("[webhook] headers x-request-id:", req.headers.get("x-request-id"));

  // ── Simulate endpoint ─────────────────────────────────────────────────
  if (body.action === "simulate") {
    const secret = req.headers.get("x-simulate-secret");
    if (secret !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { "Content-Type": "application/json" },
      });
    }
    const { order_id, payment_status: simStatus = "approved" } = body;
    if (!order_id) return new Response(JSON.stringify({ error: "Missing order_id" }), { status: 400 });
    const result = await processPaymentStatus(supabase, null, order_id, simStatus);
    return new Response(JSON.stringify({ ok: true, result }), { headers: { "Content-Type": "application/json" } });
  }

  // ── Extract payment ID from URL query param (MP standard) ───────────────────
  const url = new URL(req.url);
  const dataIdFromUrl = url.searchParams.get("data.id") || String(body.data?.id || "");
  const eventType: string = body.type || body.action || "unknown";

  console.log("[webhook] data.id:", dataIdFromUrl, "type:", eventType);

  if (!dataIdFromUrl || dataIdFromUrl === "" || dataIdFromUrl === "undefined") {
    console.log("[webhook] no data.id, ignoring");
    return new Response("ok", { status: 200 });
  }

  if (!eventType.includes("payment")) {
    console.log("[webhook] non-payment event, ignoring:", eventType);
    return new Response("ok", { status: 200 });
  }

  // ── Signature validation ───────────────────────────────────────────────
  const xSignature = req.headers.get("x-signature");
  const xRequestId = req.headers.get("x-request-id");
  const webhookSecret = Deno.env.get("MP_WEBHOOK_SECRET") || null;
  const signatureValid = await validateSignature(xSignature, xRequestId, dataIdFromUrl, webhookSecret);

  if (!signatureValid) {
    console.warn("[webhook] invalid signature, logging and returning 200");
    // Still log it so it shows up in the admin panel
    await supabase.from("webhook_logs").insert({
      provider: "mercadopago",
      external_id: dataIdFromUrl,
      event_type: eventType,
      raw_status: "signature_invalid",
      processed: false,
      error: "Invalid or missing signature",
    });
    return new Response("ok", { status: 200 });
  }

  // ── Find order by payment ID ─────────────────────────────────────────
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("id, store_id, payment_status")
    .eq("external_payment_id", dataIdFromUrl)
    .maybeSingle();

  console.log("[webhook] order lookup result:", order ? `found ${order.id}` : "not found", orderErr ? JSON.stringify(orderErr) : "");

  if (!order) {
    await supabase.from("webhook_logs").insert({
      provider: "mercadopago",
      external_id: dataIdFromUrl,
      event_type: eventType,
      raw_status: "no_order",
      processed: false,
      error: "Order not found for this payment_id",
    });
    return new Response("ok", { status: 200 });
  }

  // ── Idempotency ───────────────────────────────────────────────────────
  if (order.payment_status === "paid") {
    await supabase.from("webhook_logs").insert({
      store_id: order.store_id, order_id: order.id,
      provider: "mercadopago", external_id: dataIdFromUrl,
      event_type: eventType, raw_status: "already_paid", processed: false,
    });
    return new Response("ok", { status: 200 });
  }

  // ── Get store access token ──────────────────────────────────────────────
  const { data: settings } = await supabase
    .from("store_settings")
    .select("mp_access_token")
    .eq("store_id", order.store_id)
    .maybeSingle();

  if (!settings?.mp_access_token) {
    console.error("[webhook] no MP token for store:", order.store_id);
    await supabase.from("webhook_logs").insert({
      store_id: order.store_id, order_id: order.id,
      provider: "mercadopago", external_id: dataIdFromUrl,
      event_type: eventType, processed: false, error: "No MP access token",
    });
    return new Response("ok", { status: 200 });
  }

  // ── Double-check with MP API ─────────────────────────────────────────────
  const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${dataIdFromUrl}`, {
    headers: { Authorization: `Bearer ${settings.mp_access_token}` },
  });
  const mpPayment = await mpRes.json();
  const mpStatus: string = mpPayment.status ?? "unknown";
  console.log("[webhook] MP confirmed status:", mpStatus);

  const result = await processPaymentStatus(supabase, order, null, mpStatus);

  await supabase.from("webhook_logs").insert({
    store_id: order.store_id, order_id: order.id,
    provider: "mercadopago", external_id: dataIdFromUrl,
    event_type: eventType, raw_status: mpStatus,
    processed: result.processed, error: result.error ?? null,
  });

  return new Response("ok", { status: 200 });
});

// ─── Signature Validation ────────────────────────────────────────────────────────
async function validateSignature(
  signature: string | null,
  requestId: string | null,
  dataId: string | null,
  secret: string | null
): Promise<boolean> {
  if (!secret) {
    console.warn("[sig] MP_WEBHOOK_SECRET not set, skipping validation");
    return true; // allow without secret (dev mode)
  }
  if (!signature) {
    console.warn("[sig] no x-signature header present");
    return false;
  }
  try {
    const parts: Record<string, string> = {};
    signature.split(",").forEach((p) => {
      const idx = p.indexOf("=");
      if (idx > 0) parts[p.slice(0, idx).trim()] = p.slice(idx + 1).trim();
    });
    const ts = parts["ts"];
    const v1 = parts["v1"];
    if (!ts || !v1) { console.warn("[sig] missing ts or v1 in x-signature"); return false; }

    const template = `id:${dataId ?? ""};request-id:${requestId ?? ""};ts:${ts};`;
    console.log("[sig] validating template:", template);

    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw", enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(template));
    const expected = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
    console.log("[sig] expected:", expected, "got:", v1, "match:", expected === v1);
    return expected === v1;
  } catch (e) {
    console.error("[sig] error:", e.message);
    return false;
  }
}

// ─── Process Payment Status ────────────────────────────────────────────────────
async function processPaymentStatus(
  supabase: any,
  order: { id: string; store_id: string; payment_status: string } | null,
  orderId: string | null,
  mpStatus: string
): Promise<{ processed: boolean; error?: string }> {
  let targetOrder = order;
  if (!targetOrder && orderId) {
    const { data } = await supabase.from("orders").select("id, store_id, payment_status").eq("id", orderId).maybeSingle();
    targetOrder = data;
  }
  if (!targetOrder) return { processed: false, error: "Order not found" };

  let paymentStatus: string | null = null;
  let orderStatus: string | null = null;
  if (mpStatus === "approved") { paymentStatus = "paid"; orderStatus = "preparing"; }
  else if (mpStatus === "rejected" || mpStatus === "cancelled") { paymentStatus = "unpaid"; }
  else if (mpStatus === "pending" || mpStatus === "in_process") { paymentStatus = "pending"; }

  if (!paymentStatus) return { processed: false, error: `Unhandled MP status: ${mpStatus}` };
  if (paymentStatus === targetOrder.payment_status) return { processed: false };

  const updatePayload: Record<string, string> = { payment_status: paymentStatus };
  if (orderStatus) updatePayload.status = orderStatus;

  const { error: updateErr } = await supabase.from("orders").update(updatePayload).eq("id", targetOrder.id);
  if (updateErr) return { processed: false, error: updateErr.message };

  console.log(`✅ [webhook] Order ${targetOrder.id} → payment_status=${paymentStatus}${orderStatus ? `, status=${orderStatus}` : ""}`);
  
  if (paymentStatus === "paid") {
    // Notify customer about payment confirmed!
    supabase.functions.invoke("send-notification", {
      body: { event: "payment_confirmed", order_id: targetOrder.id }
    }).catch((err: any) => console.error("Failed to invoke send-notification", err));
  }
  
  return { processed: true };
}
