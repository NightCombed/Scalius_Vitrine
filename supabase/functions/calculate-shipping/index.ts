import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const melhorenvioApiUrl = Deno.env.get("MELHORENVIO_API_URL") || "https://melhorenvio.com.br";

const supabase = createClient(supabaseUrl, supabaseServiceKey);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders() });
  }

  try {
    const body = await req.json();
    const { action = "calculate", store_id } = body;

    if (!store_id) throw new Error("Missing store_id");

    const { data: settings, error: settingsError } = await supabase
      .from("store_settings")
      .select("*")
      .eq("store_id", store_id)
      .single();

    if (settingsError || !settings) throw new Error("Store settings not found");

    const parseNum = (val: any) => {
      if (val === undefined || val === null || val === "") return 0;
      const s = val.toString().replace(",", ".");
      const n = parseFloat(s);
      return isNaN(n) ? 0 : n;
    };

    const cleanPhone = (p: string) => {
      let c = (p || "").replace(/\D/g, "");
      if (c.startsWith("55") && c.length > 11) c = c.substring(2);
      return c;
    };

    const includeInsurance = settings.melhorenvio_insurance === true;
    const markup = parseNum(settings.shipping_markup_percent) || 0;

    // ─────────────────────────────────────────────────────────────────────────
    // ACTION: calculate — cotação de frete
    // ─────────────────────────────────────────────────────────────────────────
    if (action === "calculate") {
      const { receiver_postal_code, weight_kg, width_cm, height_cm, length_cm, insurance } = body;

      const options: any = {
        receipt: settings.label_receipt ?? false,
        own_hand: settings.label_own_hand ?? false,
        insurance_value: includeInsurance
          ? Math.max(1, parseNum(insurance) || 1)
          : 1.00,
      };

      const payload: any = {
        from: { postal_code: (settings.sender_postal_code || "").replace(/\D/g, "") },
        to:   { postal_code: (receiver_postal_code || "").replace(/\D/g, "") },
        package: {
          weight: Math.max(0.1, parseNum(weight_kg) || parseNum(settings.default_package_weight_kg) || 0.1),
          width:  Math.max(1, parseNum(width_cm)  || parseNum(settings.default_package_width_cm)  || 10),
          height: Math.max(1, parseNum(height_cm) || parseNum(settings.default_package_height_cm) || 2),
          length: Math.max(1, parseNum(length_cm) || parseNum(settings.default_package_length_cm) || 15),
        },
        services: settings.enabled_shipping_services?.join(",") || "1,2",
        options,
      };

      const isSandbox = settings.melhorenvio_sandbox === true;
      const melhorenvioApiUrl = isSandbox
        ? "https://sandbox.melhorenvio.com.br"
        : "https://melhorenvio.com.br";

      const response = await fetch(`${melhorenvioApiUrl}/api/v2/me/shipment/calculate`, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "Authorization": `Bearer ${settings.melhorenvio_token}`,
          "User-Agent": "Scalius Vitrine (suporte@scalius.com.br)",
        },
        body: JSON.stringify(payload),
      });

      const services = await response.json();

      // Log raw response to help debug why services may be filtered
      const rawArray = Array.isArray(services) ? services : [];
      console.log("[calculate] raw Melhor Envio response count:", rawArray.length);
      rawArray.forEach((s: any) => {
        if (s.error) {
          console.warn(`[calculate] service ${s.id} (${s.name}) error:`, s.error);
        }
      });

      const availableServices = rawArray
        .filter((s: any) => !s.error && s.price)
        .map((s: any) => ({
          id: s.id,
          name: s.name,
          company: s.company.name,
          price: Number((parseFloat(s.price) * (1 + markup / 100)).toFixed(2)),
          delivery_time: s.delivery_time,
          original_price: parseFloat(s.price),
        }))
        .sort((a, b) => a.price - b.price);

      // If nothing passed the filter, return the service errors for debugging
      if (availableServices.length === 0 && rawArray.length > 0) {
        const serviceErrors = rawArray.map((s: any) => ({
          id: s.id,
          name: s.name,
          error: s.error ?? null,
        }));
        console.warn("[calculate] All services filtered out. Errors:", JSON.stringify(serviceErrors));
        return new Response(JSON.stringify({ services: [], debug_service_errors: serviceErrors }), {
          headers: { "Content-Type": "application/json", ...getCorsHeaders() },
        });
      }

      return new Response(JSON.stringify({ services: availableServices }), {
        headers: { "Content-Type": "application/json", ...getCorsHeaders() },
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ACTION: create-label — inserir no carrinho do Melhor Envio
    // Payload estruturado conforme OpenAPI schema oficial (Melhor Envio API v2)
    // ─────────────────────────────────────────────────────────────────────────
    if (action === "create-label") {
      const { order_id } = body;
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .eq("id", order_id)
        .single();

      if (orderError || !order) throw new Error("Order not found");

      // ── Product dimensions ──────────────────────────────────────────────────
      const productIds = order.order_items.map((it: any) => it.product_id);
      const { data: products } = await supabase
        .from("products")
        .select("id, weight_kg, width_cm, height_cm, length_cm")
        .in("id", productIds);

      let totalWeight = 0, maxWidth = 0, totalHeight = 0, maxLength = 0;
      const defaultWeight = parseNum(settings.default_package_weight_kg) || 0.3;
      const defaultWidth  = parseNum(settings.default_package_width_cm)  || 11;
      const defaultHeight = parseNum(settings.default_package_height_cm) || 2;
      const defaultLength = parseNum(settings.default_package_length_cm) || 16;

      order.order_items.forEach((it: any) => {
        const prod   = products?.find((p: any) => p.id === it.product_id);
        const w      = prod?.weight_kg != null ? parseNum(prod.weight_kg) : defaultWeight;
        const width  = prod?.width_cm  != null ? parseNum(prod.width_cm)  : defaultWidth;
        const height = prod?.height_cm != null ? parseNum(prod.height_cm) : defaultHeight;
        const length = prod?.length_cm != null ? parseNum(prod.length_cm) : defaultLength;

        totalWeight  += w * it.quantity;
        maxWidth      = Math.max(maxWidth, width);
        totalHeight  += height * it.quantity;
        maxLength     = Math.max(maxLength, length);
      });

      // ── Sender (from) ───────────────────────────────────────────────────────
      const senderName   = settings.sender_name           || settings.store_name           || "";
      const senderPhone  = cleanPhone(settings.sender_phone || settings.whatsapp_number   || "");
      const senderEmail  = settings.sender_email           || "";
      const senderDocRaw = (settings.sender_document       || "").replace(/\D/g, "");
      const senderAddr   = settings.sender_address         || settings.address_street      || "";
      const senderNumber = settings.sender_address_number  || settings.address_number      || "";
      const senderCompl  = settings.sender_complement      || "";
      const senderDistr  = settings.sender_neighborhood    || settings.address_neighborhood || "";
      const senderCity   = settings.sender_city            || settings.address_city        || "";
      const senderState  = settings.sender_state           || settings.address_state       || "";
      const senderCep    = (settings.sender_postal_code    || "").replace(/\D/g, "");

      if (!senderEmail)  throw new Error("E-mail do remetente não configurado. Acesse Configurações → Frete Nacional.");
      if (!senderDocRaw) throw new Error("CPF/CNPJ do remetente não configurado. Acesse Configurações → Frete Nacional.");
      if (!senderCep)    throw new Error("CEP de origem não configurado. Acesse Configurações → Frete Nacional.");

      // ── Recipient (to) ──────────────────────────────────────────────────────
      const recipientDocRaw = (order.customer_document || "").replace(/\D/g, "");
      const recipientEmail  = order.customer_email || "";

      if (!recipientDocRaw) throw new Error("CPF/CNPJ do destinatário não informado no pedido.");

      // ── Document rules (per Melhor Envio API docs):
      // PF → apenas `document` (CPF), `company_document` = ""
      // PJ → apenas `company_document` (CNPJ), `document` = ""
      const senderIsCnpj    = senderDocRaw.length === 14;
      const recipientIsCnpj = recipientDocRaw.length === 14;

      // ── Invoice / Fiscal document ──────────────────────────────────────────
      // NF-e:  non_commercial: false + options.invoice.key (44-digit NF-e key)
      // DC-e:  non_commercial: true  (Melhor Envio generates it automatically)
      const invoiceKey = (order.invoice_key || "").replace(/\D/g, "");
      const isNfe     = invoiceKey.length === 44;

      // ── Insurance value ─────────────────────────────────────────────────────
      const totalValue    = order.subtotal_cents / 100;
      const insuranceValue = includeInsurance ? Math.max(1, totalValue) : 1.00;

      // ── Options (REQUIRED fields per schema: insurance_value, receipt, own_hand, reverse, non_commercial)
      const options: any = {
        insurance_value: insuranceValue,
        receipt:         settings.label_receipt  ?? false,
        own_hand:        settings.label_own_hand ?? false,
        reverse:         false,
        non_commercial:  !isNfe,  // true = DC-e automática; false = NF-e (requer invoice.key)
        platform:        "Scalius",
        reminder:        `Pedido #${order.id?.slice(0, 8) ?? ""}`,
        tags: [{
          tag: order.id ?? "",
          url: "",
        }],
        // NF-e: só inclui invoice se a chave tiver 44 dígitos numéricos
        ...(isNfe && { invoice: { key: invoiceKey } }),
      };

      // ── Final payload — matches Melhor Envio OpenAPI schema exactly ──────────
      const payload: any = {
        service: order.shipping_service_id,
        from: {
          name:             senderName,
          email:            senderEmail,
          phone:            senderPhone,
          // PF: document = CPF, company_document = ""
          // PJ: document = "", company_document = CNPJ
          document:         senderIsCnpj ? "" : senderDocRaw,
          company_document: senderIsCnpj ? senderDocRaw : "",
          state_register:   "",  // empty for non-commercial
          address:          senderAddr,
          complement:       senderCompl,
          number:           senderNumber,
          district:         senderDistr,
          city:             senderCity,
          country_id:       "BR",  // REQUIRED per schema
          postal_code:      senderCep,
          state_abbr:       senderState,
        },
        to: {
          name:             order.customer_name,
          email:            recipientEmail,
          phone:            cleanPhone(order.customer_phone || ""),
          document:         recipientIsCnpj ? "" : recipientDocRaw,
          company_document: recipientIsCnpj ? recipientDocRaw : "",
          state_register:   "ISENTO",
          address:          order.address_street       || "",
          complement:       order.address_complement   || "",
          number:           order.address_number       || "S/N",
          district:         order.address_neighborhood || "",
          city:             order.address_city         || "",
          country_id:       "BR",
          postal_code:      (order.national_shipping_cep || "").replace(/\D/g, ""),
          state_abbr:       order.address_state        || "",
        },
        products: order.order_items.map((it: any) => ({
          name:          it.product_name,
          quantity:      String(it.quantity),
          unitary_value: String(Number((it.unit_price_cents / 100).toFixed(2))),
        })),
        volumes: [{
          height: Math.ceil(Math.max(1, totalHeight)),
          width:  Math.ceil(Math.max(1, maxWidth)),
          length: Math.ceil(Math.max(1, maxLength)),
          weight: Math.max(0.1, totalWeight),
        }],
        options,
      };

      console.log("[create-label] KEY FIELDS:", JSON.stringify({
        service: payload.service,
        fiscal_mode: isNfe ? "NF-e" : "DC-e (auto)",
        invoice_key_len: invoiceKey.length,
        from_document: payload.from.document,
        from_company_document: payload.from.company_document,
        to_document: payload.to.document,
        to_company_document: payload.to.company_document,
        receipt: payload.options.receipt,
        own_hand: payload.options.own_hand,
        non_commercial: payload.options.non_commercial,
        has_invoice: !!payload.options.invoice,
        insurance_value: payload.options.insurance_value,
        senderDocLen: senderDocRaw.length,
        recipientDocLen: recipientDocRaw.length,
      }));

      const isSandbox = settings.melhorenvio_sandbox === true;
      const melhorenvioApiUrl = isSandbox
        ? "https://sandbox.melhorenvio.com.br"
        : "https://melhorenvio.com.br";

      const response = await fetch(`${melhorenvioApiUrl}/api/v2/me/cart`, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "Authorization": `Bearer ${settings.melhorenvio_token}`,
          "User-Agent": "Scalius Vitrine (suporte@scalius.com.br)",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        const errMsg = result.message
          || (result.errors ? JSON.stringify(result.errors) : null)
          || `HTTP ${response.status}`;
        return new Response(
          JSON.stringify({ error: errMsg, details: result, debug_payload: payload }),
          { status: response.status, headers: { "Content-Type": "application/json", ...getCorsHeaders() } }
        );
      }

      await supabase.from("orders").update({ melhorenvio_order_id: result.id }).eq("id", order_id);

      return new Response(JSON.stringify({
        success: true,
        melhorenvio_order_id: result.id,
        debug_payload: payload,
        debug_response: result,
      }), {
        headers: { "Content-Type": "application/json", ...getCorsHeaders() },
      });
    }

    throw new Error("Invalid action");

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...getCorsHeaders() },
    });
  }
});

function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}
