import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

function isValidCPF(cpf: string): boolean {
  if (cpf.length !== 11) return false;
  if (/^(\d)\1+$/.test(cpf)) return false; // all same digits
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cpf.charAt(i)) * (10 - i);
  }
  let rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(cpf.charAt(9))) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cpf.charAt(i)) * (11 - i);
  }
  rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(cpf.charAt(10))) return false;
  return true;
}

function isValidCNPJ(cnpj: string): boolean {
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1+$/.test(cnpj)) return false; // all same digits
  let size = cnpj.length - 2;
  let numbers = cnpj.substring(0, size);
  const digits = cnpj.substring(size);
  let sum = 0;
  let pos = size - 7;
  for (let i = size; i >= 1; i--) {
    sum += parseInt(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(0))) return false;
  
  size = size + 1;
  numbers = cnpj.substring(0, size);
  sum = 0;
  pos = size - 7;
  for (let i = size; i >= 1; i--) {
    sum += parseInt(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(1))) return false;
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: CORS_HEADERS });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { order_id } = body;
    console.log("mercadopago-pix called for order_id:", order_id);

    if (!order_id) {
      return new Response(JSON.stringify({ error: "Missing order_id" }), { status: 400, headers: CORS_HEADERS });
    }

    // 1. Load the order
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, store_id, order_number, total_cents, customer_name, customer_email, customer_document")
      .eq("id", order_id)
      .maybeSingle();

    if (orderErr) {
      console.error("Order fetch error:", JSON.stringify(orderErr));
      return new Response(JSON.stringify({ error: "DB error fetching order", details: orderErr }), { status: 500, headers: CORS_HEADERS });
    }
    if (!order) {
      console.error("Order not found:", order_id);
      return new Response(JSON.stringify({ error: "Order not found" }), { status: 404, headers: CORS_HEADERS });
    }

    console.log("Order found, store_id:", order.store_id, \"total_cents:\", order.total_cents);

    // 2. Load store settings separately
    const { data: settings, error: settingsErr } = await supabase
      .from("store_settings")
      .select("mp_access_token, mp_user_id, payment_provider")
      .eq("store_id", order.store_id)
      .maybeSingle();

    if (settingsErr) {
      console.error("Settings fetch error:", JSON.stringify(settingsErr));
      return new Response(JSON.stringify({ error: "DB error fetching settings", details: settingsErr }), { status: 500, headers: CORS_HEADERS });
    }
    if (!settings?.mp_access_token) {
      console.error("No MP access token for store:", order.store_id);
      return new Response(JSON.stringify({ error: "Mercado Pago not configured for this store" }), { status: 400, headers: CORS_HEADERS });
    }

    const accessToken = settings.mp_access_token;
    console.log("Access token found, creating MP payment...");

    // 3. Build payer info
    let payerEmail = order.customer_email || "cliente@comprando.com";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail)) {
      console.warn(`Payer email '${payerEmail}' is invalid. Falling back to default.`);
      payerEmail = "cliente@comprando.com";
    }

    const payerName = (order.customer_name || "Cliente").trim();
    const nameParts = payerName.split(" ");
    const firstName = nameParts[0] || "Cliente";
    const lastName = nameParts.slice(1).join(" ") || "Web";

    // 4. Expiration: 15 minutes from now
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString().replace("Z", "+00:00");

    // 5. Call Mercado Pago payments API
    const mpPayload: Record<string, any> = {
      transaction_amount: order.total_cents / 100,
      description: `Pedido #${order.order_number}`,
      payment_method_id: "pix",
      date_of_expiration: expiresAt,
      payer: {
        email: payerEmail,
        first_name: firstName,
        last_name: lastName,
      },
      notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mercadopago-webhook`,
      metadata: { order_id, store_id: order.store_id },
    };

    // Add document only if present and valid
    if (order.customer_document) {
      const docClean = order.customer_document.replace(/\D/g, "");
      const isCpf = docClean.length <= 11;
      const isValid = isCpf ? isValidCPF(docClean) : isValidCNPJ(docClean);
      if (isValid) {
        mpPayload.payer.identification = {
          type: isCpf ? "CPF" : "CNPJ",
          number: docClean,
        };
      } else {
        console.warn(`Payer document '${order.customer_document}' is invalid. Skipping to prevent MP 400 error.`);
      }
    }

    console.log("Calling MP API, amount:", mpPayload.transaction_amount);

    const mpRes = await fetch("https://api.mercadopago.com/v1/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": `order-${order_id}-${Date.now()}`,
      },
      body: JSON.stringify(mpPayload),
    });

    const mpData = await mpRes.json();
    console.log("MP response status:", mpRes.status, "payment_id:", mpData.id, "mp_status:", mpData.status);

    if (!mpRes.ok) {
      console.error("MP API error:", JSON.stringify(mpData));
      return new Response(
        JSON.stringify({ error: "Mercado Pago API error", details: mpData }),
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const pixData = mpData.point_of_interaction?.transaction_data;
    if (!pixData?.qr_code) {
      console.error("No QR code in MP response:", JSON.stringify(mpData.point_of_interaction));
      return new Response(
        JSON.stringify({ error: "No QR code returned by Mercado Pago", mp_status: mpData.status }),
        { status: 500, headers: CORS_HEADERS }
      );
    }

    console.log("QR code received, saving to order...");

    // 6. Save payment data to the order
    const { error: updateErr } = await supabase.from("orders").update({
      external_payment_id: String(mpData.id),
      payment_provider: "mercadopago",
      payment_status: "pending",
      qr_code_data: pixData.qr_code,
      qr_code_base64: pixData.qr_code_base64 ?? null,
      payment_expires_at: expiresAt,
    }).eq("id", order_id);

    if (updateErr) {
      console.error("Order update error:", JSON.stringify(updateErr));
    } else {
      console.log("Order updated successfully with payment data");
    }

    return new Response(JSON.stringify({
      ok: true,
      payment_id: mpData.id,
      qr_code: pixData.qr_code,
      qr_code_base64: pixData.qr_code_base64 ?? null,
      expires_at: expiresAt,
    }), { headers: CORS_HEADERS });

  } catch (e) {
    console.error("Function error:", e.message, e.stack);
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: CORS_HEADERS });
  }
});
