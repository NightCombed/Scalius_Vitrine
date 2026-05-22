import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

// ─── Crypto helpers ──────────────────────────────────────────────────────────

async function hashPassword(password: string): Promise<string> {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 200_000, hash: "SHA-256" }, keyMaterial, 256);
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, "0")).join("");
  const hashHex = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, "0")).join("");
  return `pbkdf2:${saltHex}:${hashHex}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [, saltHex, hashHex] = stored.split(":");
    const salt = Uint8Array.from(saltHex.match(/.{2}/g)!.map((b: string) => parseInt(b, 16)));
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 200_000, hash: "SHA-256" }, keyMaterial, 256);
    const computed = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, "0")).join("");
    return computed === hashHex;
  } catch { return false; }
}

async function signJWT(payload: Record<string, unknown>, secret: string): Promise<string> {
  const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const body = btoa(JSON.stringify(payload)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const data = `${header}.${body}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${data}.${sigB64}`;
}

async function verifyJWT(token: string, secret: string): Promise<Record<string, unknown> | null> {
  try {
    const [header, body, sig] = token.split(".");
    const data = `${header}.${body}`;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const sigBytes = Uint8Array.from(atob(sig.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(data));
    if (!valid) return null;
    const payload = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/")));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

async function hashToken(token: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

/** Validate token and return {customerId, storeId} or throw */
async function requireAuth(supabase: any, token: string | undefined, secret: string) {
  if (!token) throw Object.assign(new Error("Token obrigatório"), { status: 401 });
  const payload = await verifyJWT(token, secret);
  if (!payload) throw Object.assign(new Error("Sessão inválida ou expirada"), { status: 401 });
  const tokenHash = await hashToken(token);
  const { data: session } = await supabase
    .from("customer_sessions")
    .select("revoked, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (!session || session.revoked || new Date(session.expires_at) < new Date())
    throw Object.assign(new Error("Sessão inválida ou expirada"), { status: 401 });
  return { customerId: payload.sub as string, storeId: payload.store_id as string };
}

// ─── Main ────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("MY_SERVICE_ROLE_KEY")!);
  const JWT_SECRET = Deno.env.get("CUSTOMER_JWT_SECRET")!;
  const SESSION_DAYS = 30;

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const { action } = body;

  // ── REGISTER ────────────────────────────────────────────────────────────────
  if (action === "register") {
    const { store_id, email, password, full_name = "" } = body;
    if (!store_id || !email || !password) return json({ error: "store_id, email e password são obrigatórios" }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Email inválido." }, 400);
    if (password.length < 8) return json({ error: "Senha deve ter ao menos 8 caracteres." }, 400);
    if (password.toLowerCase() === email.toLowerCase()) return json({ error: "Senha não pode ser igual ao email." }, 400);

    const { data: existing } = await supabase.from("customers").select("id").eq("store_id", store_id).eq("email", email.toLowerCase()).maybeSingle();
    if (existing) return json({ error: "Este email já está registrado. Tente fazer login." }, 409);

    try {
      const password_hash = await hashPassword(password);
      const { data: customer, error: insertErr } = await supabase
        .from("customers").insert({ store_id, email: email.toLowerCase(), password_hash, full_name: full_name.trim() })
        .select("id, store_id, email, full_name, phone, created_at, updated_at").single();
      if (insertErr) { 
        console.error("Insert Error:", insertErr); 
        return json({ error: "Erro ao criar conta.", details: insertErr }, 500); 
      }
      return await createSession(supabase, customer, JWT_SECRET, SESSION_DAYS);
    } catch (err: any) {
      console.error("Caught Error:", err);
      return json({ error: "Internal server error", details: err.message || err }, 500);
    }
  }

  // ── LOGIN ────────────────────────────────────────────────────────────────────
  if (action === "login") {
    const { store_id, email, password } = body;
    if (!store_id || !email || !password) return json({ error: "Campos obrigatórios faltando" }, 400);
    const { data: customer } = await supabase.from("customers")
      .select("id, store_id, email, full_name, phone, password_hash, created_at, updated_at")
      .eq("store_id", store_id).eq("email", email.toLowerCase()).maybeSingle();
    const passwordOk = customer ? await verifyPassword(password, customer.password_hash) : false;
    if (!customer || !passwordOk) return json({ error: "Email ou senha incorretos." }, 401);
    const { password_hash: _, ...safeCustomer } = customer;
    return createSession(supabase, safeCustomer, JWT_SECRET, SESSION_DAYS);
  }

  // ── LOGOUT ───────────────────────────────────────────────────────────────────
  if (action === "logout") {
    const { token } = body;
    if (token) {
      const tokenHash = await hashToken(token);
      await supabase.from("customer_sessions").update({ revoked: true }).eq("token_hash", tokenHash);
    }
    return json({ ok: true });
  }

  // ── ME (validate session + return profile) ───────────────────────────────────
  if (action === "me") {
    try {
      const { customerId } = await requireAuth(supabase, body.token, JWT_SECRET);
      const { data: customer } = await supabase.from("customers")
        .select("id, store_id, email, full_name, phone, created_at, updated_at")
        .eq("id", customerId).maybeSingle();
      if (!customer) return json({ error: "Cliente não encontrado" }, 404);
      return json({ customer });
    } catch (e: any) { return json({ error: e.message }, e.status ?? 401); }
  }

  // ── MY_ORDERS ────────────────────────────────────────────────────────────────
  if (action === "my_orders") {
    try {
      const { customerId, storeId } = await requireAuth(supabase, body.token, JWT_SECRET);
      const status = body.status as string | undefined; // optional filter
      let query = supabase
        .from("orders")
        .select("id, order_number, created_at, status, payment_status, total_cents, subtotal_cents, shipping_fee_cents, delivery_type, shipping_region_name, customer_name")
        .eq("store_id", storeId)
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (status && status !== "all") query = query.eq("status", status);
      const { data: orders, error } = await query;
      if (error) throw error;
      return json({ orders: orders ?? [] });
    } catch (e: any) { return json({ error: e.message }, e.status ?? 500); }
  }

  // ── UPDATE_PROFILE ───────────────────────────────────────────────────────────
  if (action === "update_profile") {
    try {
      const { customerId } = await requireAuth(supabase, body.token, JWT_SECRET);
      const { full_name, phone } = body;
      const { data: customer, error } = await supabase
        .from("customers")
        .update({ full_name: full_name?.trim(), phone: phone?.trim() || null })
        .eq("id", customerId)
        .select("id, store_id, email, full_name, phone, created_at, updated_at")
        .single();
      if (error) throw error;
      return json({ customer });
    } catch (e: any) { return json({ error: e.message }, e.status ?? 500); }
  }

  // ── LINK_ORDER (associate anonymous order to customer after login/register) ───
  if (action === "link_order") {
    try {
      const { customerId, storeId } = await requireAuth(supabase, body.token, JWT_SECRET);
      const { order_id } = body;
      if (!order_id) return json({ error: "order_id é obrigatório" }, 400);

      // Verify the order belongs to this store and is not already linked
      const { data: order } = await supabase
        .from("orders")
        .select("id, store_id, customer_id, customer_name, customer_phone, customer_email")
        .eq("id", order_id)
        .eq("store_id", storeId)
        .maybeSingle();

      if (!order) return json({ error: "Pedido não encontrado" }, 404);
      if (order.customer_id && order.customer_id !== customerId) {
        return json({ error: "Este pedido já está vinculado a outra conta" }, 409);
      }

      // Link the order
      const { error: updateErr } = await supabase
        .from("orders")
        .update({ customer_id: customerId })
        .eq("id", order_id);

      if (updateErr) throw updateErr;

      // Also update customer profile with data from order if missing
      const { data: customer } = await supabase
        .from("customers")
        .select("full_name, phone")
        .eq("id", customerId)
        .maybeSingle();

      const updates: Record<string, string> = {};
      if (customer && !customer.phone && order.customer_phone) {
        updates.phone = order.customer_phone;
      }
      if (customer && (!customer.full_name || customer.full_name.trim() === "") && order.customer_name) {
        updates.full_name = order.customer_name;
      }
      let updatedCustomer = null;
      if (Object.keys(updates).length > 0) {
        const { data } = await supabase.from("customers")
          .update(updates)
          .eq("id", customerId)
          .select("id, store_id, email, full_name, phone, created_at, updated_at")
          .single();
        updatedCustomer = data;
      }

      return json({ ok: true, linked: true, customer: updatedCustomer });
    } catch (e: any) { return json({ error: e.message }, e.status ?? 500); }
  }

  // ── GET_LAST_ADDRESS (pre-fill checkout with last delivery address) ────────
  if (action === "get_last_address") {
    try {
      const { customerId, storeId } = await requireAuth(supabase, body.token, JWT_SECRET);

      // Get most recent delivery order with address
      const { data: order } = await supabase
        .from("orders")
        .select("customer_name, customer_phone, customer_email, address_street, address_number, address_neighborhood, address_city, address_state, address_complement, national_shipping_cep")
        .eq("store_id", storeId)
        .eq("customer_id", customerId)
        .in("delivery_type", ["delivery", "national_shipping"])
        .not("address_street", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Also get customer profile for name/phone
      const { data: customer } = await supabase
        .from("customers")
        .select("full_name, phone, email")
        .eq("id", customerId)
        .maybeSingle();

      return json({
        customer: customer ?? null,
        last_order: order ?? null,
      });
    } catch (e: any) { return json({ error: e.message }, e.status ?? 500); }
  }

  return json({ error: "action inválida" }, 400);
});

// ─── Helper: create session ───────────────────────────────────────────────────

async function createSession(supabase: any, customer: any, secret: string, days: number) {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + days * 86400;
  const expiresAt = new Date(exp * 1000).toISOString();
  const rawToken = await signJWT({ sub: customer.id, store_id: customer.store_id, email: customer.email, iat: now, exp }, secret);
  const tokenHash = await hashToken(rawToken);
  const { error: sessionErr } = await supabase.from("customer_sessions").insert({ customer_id: customer.id, token_hash: tokenHash, expires_at: expiresAt });
  if (sessionErr) throw new Error(`Erro ao criar sessão: ${sessionErr.message}`);
  return new Response(JSON.stringify({
    token: rawToken, expires_at: expiresAt,
    customer: { id: customer.id, store_id: customer.store_id, email: customer.email, full_name: customer.full_name, phone: customer.phone ?? null, created_at: customer.created_at, updated_at: customer.updated_at },
  }), { headers: { ...CORS, "Content-Type": "application/json" } });
}
