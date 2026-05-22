import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Define default preferences
const DEFAULT_PREFS = {
  store_new_order: true,
  store_payment_confirmed: true,
  store_order_cancelled: true,
  customer_new_order: false,
  customer_payment_confirmed: true,
  customer_order_ready: true,
  customer_order_dispatched: true,
  customer_tracking_added: true,
  customer_order_cancelled: true,
  customer_order_delivered: false,
  customer_order_picked_up: false,
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || (!supabaseAnonKey && !supabaseServiceRoleKey)) {
      throw new Error("Missing Supabase environment variables");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey || supabaseAnonKey!);

    const payload = await req.json();
    console.log("Received payload:", JSON.stringify(payload, null, 2));

    let orderId: string | undefined;
    let event: string | undefined;
    let record: any;
    let oldRecord: any;

    if (payload.type === "UPDATE" && payload.table === "orders") {
      record = payload.record;
      oldRecord = payload.old_record;
      orderId = record.id;
      
      // Determine event based on changes
      if (record.status === "ready" && oldRecord.status !== "ready") {
        event = "order_ready";
      } else if (record.payment_status === "paid" && oldRecord.payment_status !== "paid") {
        event = "payment_confirmed";
      } else if (record.status === "out_for_delivery" && oldRecord.status !== "out_for_delivery") {
        event = "order_dispatched";
      } else if (record.tracking_code && !oldRecord.tracking_code) {
        event = "tracking_added";
      } else if (record.status === "delivered" && oldRecord.status !== "delivered") {
        event = "order_delivered";
      } else if (record.status === "picked_up" && oldRecord.status !== "picked_up") {
        event = "order_picked_up";
      } else if (record.status === "cancelled" && oldRecord.status !== "cancelled") {
        event = "order_cancelled";
      }
    } else if (payload.type === "INSERT" && payload.table === "orders") {
      record = payload.record;
      orderId = record.id;
      event = "new_order";
    } else {
      orderId = payload.order_id;
      event = payload.event;
    }

    if (!orderId || !event) {
      console.log("No matching event to process or missing order_id. Payload:", payload);
      return new Response(JSON.stringify({ success: true, message: "No actionable event." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Get complete order information
    if (!record || !record.store_id) {
      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .select("*")
        .eq("id", orderId)
        .single();
      
      if (orderError) throw new Error("Order not found: " + orderError.message);
      record = orderData;
    }

    // Fetch order items for the templates
    const { data: orderItems } = await supabase
      .from("order_items")
      .select("*")
      .eq("order_id", orderId);

    const storeId = record.store_id;

    // 2. Get store settings
    const { data: settings, error: settingsError } = await supabase
      .from("store_settings")
      .select("*")
      .eq("store_id", storeId)
      .single();

    if (settingsError && settingsError.code !== "PGRST116") {
      throw new Error("Store settings error: " + settingsError.message);
    }

    // 3. Get customer info
    let customer = null;
    if (record.customer_id) {
      const { data: customerData } = await supabase
        .from("customers")
        .select("*")
        .eq("id", record.customer_id)
        .single();
      customer = customerData;
    }
    
    const customerEmail = record.customer_email || (customer?.email);
    const customerName = record.customer_name || (customer?.name) || "Cliente";

    // 4. Resolve Preferences
    const prefs = settings?.notification_preferences ?? {};
    const pref = (key: keyof typeof DEFAULT_PREFS) => prefs[key] ?? DEFAULT_PREFS[key];

    let sendToStore = false;
    let sendToCustomer = false;

    const storeEmail = settings?.notification_email || settings?.email || "contato@loja.com";

    // Mapping event to preference keys
    switch (event) {
      case "new_order":
        sendToStore = pref("store_new_order");
        sendToCustomer = pref("customer_new_order");
        break;
      case "payment_confirmed":
        sendToStore = pref("store_payment_confirmed");
        sendToCustomer = pref("customer_payment_confirmed");
        break;
      case "order_ready":
        sendToCustomer = pref("customer_order_ready");
        break;
      case "order_dispatched":
        sendToCustomer = pref("customer_order_dispatched");
        break;
      case "tracking_added":
        sendToCustomer = pref("customer_tracking_added");
        break;
      case "order_delivered":
        sendToCustomer = pref("customer_order_delivered");
        break;
      case "order_picked_up":
        sendToCustomer = pref("customer_order_picked_up");
        break;
      case "order_cancelled":
        sendToStore = pref("store_order_cancelled");
        sendToCustomer = pref("customer_order_cancelled");
        break;
    }

    if (!customerEmail) {
      sendToCustomer = false;
    }

    // Helper to send email via our SES edge function
    const sendViaSES = async (to: string, subject: string, html: string, fromName: string, replyTo?: string) => {
      // Pass service role key so the internal call is authorized (avoids 401)
      const { data, error } = await supabase.functions.invoke('send-email-ses', {
        body: { to, subject, html, fromName, replyTo },
        headers: {
          Authorization: `Bearer ${supabaseServiceRoleKey || supabaseAnonKey}`,
        },
      });
      if (error) throw error;
      return data;
    };

    // 5. Generate Templates and Send
    const responses = [];
    const storeName = settings?.display_name || "Loja";
    const brandColor = settings?.brand_color ? `hsl(${settings.brand_color.replace(/,/g, ' ')})` : "#333";
    const orderNumber = record.order_number || record.id.slice(-6).toUpperCase();
    
    // Build Items HTML
    let itemsHtml = `
      <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
        <thead>
          <tr style="border-bottom: 1px solid #eee; text-align: left;">
            <th style="padding: 8px 0;">Item</th>
            <th style="padding: 8px 0; text-align: center;">Qtd</th>
            <th style="padding: 8px 0; text-align: right;">Total</th>
          </tr>
        </thead>
        <tbody>
    `;
    
    if (orderItems && orderItems.length > 0) {
      for (const item of orderItems) {
        itemsHtml += `
          <tr style="border-bottom: 1px solid #f9f9f9;">
            <td style="padding: 8px 0;">${item.product_name}${item.variant_label ? ` <span style="color: #666; font-size: 0.9em;">(${item.variant_label})</span>` : ''}</td>
            <td style="padding: 8px 0; text-align: center;">${item.quantity}</td>
            <td style="padding: 8px 0; text-align: right;">R$ ${(item.line_total_cents / 100).toFixed(2).replace('.', ',')}</td>
          </tr>
        `;
      }
    } else {
       itemsHtml += `<tr><td colspan="3" style="padding: 8px 0; text-align: center;">Itens do pedido.</td></tr>`;
    }
    
    itemsHtml += `
        </tbody>
        <tfoot>
          <tr>
            <td colspan="2" style="padding: 8px 0; text-align: right; color: #666;">Subtotal:</td>
            <td style="padding: 8px 0; text-align: right;">R$ ${(record.subtotal_cents / 100).toFixed(2).replace('.', ',')}</td>
          </tr>
          <tr>
            <td colspan="2" style="padding: 8px 0; text-align: right; color: #666;">Frete:</td>
            <td style="padding: 8px 0; text-align: right;">R$ ${(record.shipping_fee_cents / 100).toFixed(2).replace('.', ',')}</td>
          </tr>
          <tr style="font-weight: bold; font-size: 1.1em;">
            <td colspan="2" style="padding: 8px 0; text-align: right;">Total:</td>
            <td style="padding: 8px 0; text-align: right;">R$ ${(record.total_cents / 100).toFixed(2).replace('.', ',')}</td>
          </tr>
        </tfoot>
      </table>
    `;

    const getBaseHtml = (title: string, message: string) => `
      <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #eaeaea; border-radius: 12px; overflow: hidden; color: #333; box-shadow: 0 4px 24px rgba(0,0,0,0.04);">
        <div style="background-color: #0e0e0e; padding: 32px 30px; text-align: center;">
          <img src="https://jrmixsvdnejzfxvybmng.supabase.co/storage/v1/object/public/store-logos/scalius-logo.png" alt="Scalius" style="display: inline-block; border: none; outline: none; height: 36px; max-height: 36px; vertical-align: middle;" />
          <p style="margin: 14px 0 0 0; color: rgba(255,255,255,0.4); font-size: 12px; letter-spacing: 1px; text-transform: uppercase;">Notificação de Pedido</p>
        </div>
        <div style="padding: 40px 30px;">
          <h3 style="margin-top: 0; font-size: 22px; color: #111; font-weight: 700;">${title}</h3>
          <p style="font-size: 16px; line-height: 1.6; color: #444; margin-bottom: 30px;">${message}</p>
          
          <div style="background-color: #fcfcfc; border: 1px solid #f0f0f0; border-radius: 10px; padding: 25px; margin-bottom: 30px;">
            <h4 style="margin-top: 0; margin-bottom: 15px; font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #888; border-bottom: 1px solid #eee; padding-bottom: 12px;">Resumo do Pedido #${orderNumber}</h4>
            ${itemsHtml}
          </div>
          
          <div style="text-align: center; margin-top: 40px; border-top: 1px solid #eaeaea; padding-top: 30px;">
            <p style="font-size: 14px; color: #666; margin-bottom: 6px;">
              Dúvidas sobre o pedido? Entre em contato com a loja <strong>${storeName}</strong>:
            </p>
            <p style="font-size: 15px; font-weight: 600; color: #FF5500; margin: 0;">
              ${settings?.whatsapp ? `WhatsApp: ${settings.whatsapp}` : `Basta responder este e-mail`}
            </p>
          </div>
        </div>
        <div style="background-color: #0e0e0e; padding: 18px 20px; text-align: center;">
          <p style="margin: 0; font-size: 11px; color: rgba(255,255,255,0.3); letter-spacing: 0.3px;">
            Enviado com segurança via <strong style="color: rgba(255,255,255,0.5);">Scalius</strong> &bull; A plataforma para marcas que buscam o próximo nível.
          </p>
        </div>
      </div>
    `;

    // --- SEND TO STORE ---
    if (sendToStore && storeEmail) {
      let emailSubject = `[${event}] Pedido #${orderNumber}`;
      let title = `Novo Evento: ${event}`;
      let message = `O pedido #${orderNumber} teve uma atualização de status.`;

      if (event === "new_order") {
        emailSubject = `🟢 Novo Pedido Recebido #${orderNumber}`;
        title = `Novo Pedido de ${customerName}`;
        message = `Você recebeu um novo pedido de ${customerName}. Verifique o painel para iniciar a preparação.`;
      } else if (event === "payment_confirmed") {
        emailSubject = `💰 Pagamento Confirmado - Pedido #${orderNumber}`;
        title = `Pagamento Confirmado`;
        message = `O pagamento do pedido #${orderNumber} de ${customerName} foi confirmado. Você já pode iniciar a preparação!`;
      } else if (event === "order_cancelled") {
        emailSubject = `❌ Pedido Cancelado #${orderNumber}`;
        title = `Pedido Cancelado`;
        message = `O pedido #${orderNumber} de ${customerName} foi cancelado.`;
      }

      const html = getBaseHtml(title, message);

      try {
        const result = await sendViaSES(storeEmail, emailSubject, html, storeName);
        responses.push({ to: "store", type: "email", result });
        
        await supabase.from("notification_logs").insert({
          store_id: storeId,
          event_type: event,
          channel: "email",
          recipient: storeEmail,
          status: "success",
          metadata: { result, target: "store" }
        });
      } catch (err: any) {
        console.error("Store Email Error:", err);
        await supabase.from("notification_logs").insert({
          store_id: storeId,
          event_type: event,
          channel: "email",
          recipient: storeEmail,
          status: "error",
          error_message: err.message,
          metadata: { target: "store" }
        });
      }
    }

    // --- SEND TO CUSTOMER ---
    if (sendToCustomer && customerEmail) {
      let emailSubject = `Atualização do seu pedido - Scalius`;
      let title = `Atualização do Pedido`;
      let message = `Seu pedido teve uma atualização.`;
      
      if (event === "new_order") {
        emailSubject = `Recebemos seu pedido #${orderNumber} - Scalius`;
        title = `Olá, ${customerName}!`;
        message = `Recebemos o seu pedido #${orderNumber} na loja <strong>${storeName}</strong>. Estamos aguardando a confirmação do pagamento para iniciar a preparação.`;
      } else if (event === "payment_confirmed") {
        emailSubject = `Pagamento Confirmado! ✅ - Scalius`;
        title = `Pagamento Confirmado!`;
        message = `O pagamento do seu pedido #${orderNumber} na loja <strong>${storeName}</strong> foi confirmado com sucesso. Em breve a loja iniciará a preparação.`;
      } else if (event === "order_ready") {
        emailSubject = `Seu pedido está PRONTO! 🎉 - Scalius`;
        title = `Pedido Pronto!`;
        message = record.delivery_type === "pickup" 
          ? `O seu pedido #${orderNumber} já está separado e pronto para ser retirado na loja <strong>${storeName}</strong>.`
          : `O seu pedido #${orderNumber} já está separado pela loja <strong>${storeName}</strong> e em breve sairá para entrega.`;
      } else if (event === "order_dispatched") {
        emailSubject = `Seu pedido saiu para entrega! 🚚 - Scalius`;
        title = `Saiu para entrega!`;
        message = `Oba! O seu pedido #${orderNumber} da loja <strong>${storeName}</strong> acabou de sair para entrega. Fique de olho! 👀`;
      } else if (event === "tracking_added") {
        emailSubject = `Código de Rastreio Disponível 📦 - Scalius`;
        title = `Pedido Enviado!`;
        message = `O seu pedido #${orderNumber} da loja <strong>${storeName}</strong> foi postado! Acompanhe a entrega com o código de rastreio: <strong>${record.tracking_code}</strong>.`;
      } else if (event === "order_delivered" || event === "order_picked_up") {
        emailSubject = `Pedido Entregue! ✅ - Scalius`;
        title = `Pedido Entregue!`;
        message = `O seu pedido #${orderNumber} da loja <strong>${storeName}</strong> foi entregue com sucesso. Esperamos que você goste! 🥰`;
      } else if (event === "order_cancelled") {
        emailSubject = `Pedido Cancelado ❌ - Scalius`;
        title = `Pedido Cancelado`;
        message = `Infelizmente, o seu pedido #${orderNumber} da loja <strong>${storeName}</strong> foi cancelado. Se tiver alguma dúvida, responda este e-mail para falar com o lojista.`;
      }
      
      const html = getBaseHtml(title, message);

      try {
        const result = await sendViaSES(customerEmail, emailSubject, html, storeName, storeEmail);
        responses.push({ to: "customer", type: "email", result });
        
        await supabase.from("notification_logs").insert({
          store_id: storeId,
          event_type: event,
          channel: "email",
          recipient: customerEmail,
          status: "success",
          metadata: { result, target: "customer" }
        });
      } catch (err: any) {
        console.error("Customer Email Error:", err);
        await supabase.from("notification_logs").insert({
          store_id: storeId,
          event_type: event,
          channel: "email",
          recipient: customerEmail,
          status: "error",
          error_message: err.message,
          metadata: { target: "customer" }
        });
      }
    }

    // Webhook (optional for store integration)
    if (settings?.notification_webhook_url && sendToStore) {
      try {
        const whResult = await fetch(settings.notification_webhook_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event,
            order: record
          })
        });
        
        const text = await whResult.text();
        responses.push({ to: "store", type: "webhook", status: whResult.status });
        
        await supabase.from("notification_logs").insert({
          store_id: storeId,
          event_type: event,
          channel: "webhook",
          recipient: settings.notification_webhook_url,
          status: whResult.ok ? "success" : "error",
          error_message: whResult.ok ? null : text,
          metadata: { status: whResult.status }
        });
      } catch (err: any) {
        console.error("Webhook Error:", err);
      }
    }

    return new Response(JSON.stringify({ success: true, processed: true, responses }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Function error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
