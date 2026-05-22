/**
 * Scalius Vitrine — Domain types (multi-tenant).
 * Every tenant-scoped entity carries `store_id`.
 * These shapes mirror the planned Supabase schema; swap the mock layer
 * for real queries without changing component contracts.
 */

export type UUID = string;
export type ISODate = string;

/* ---------- Payment Providers ---------- */

/**
 * Which payment gateway the store / order is using.
 * - 'manual'      — traditional Pix (lojista informa chave, cliente faz TEF)
 * - 'mercadopago' — Pix automático via Mercado Pago OAuth + QR Code dinâmico
 * - 'infinitepay' — futuro gateway (reservado)
 */
export type PaymentProvider = 'manual' | 'mercadopago' | 'infinitepay';

/**
 * Connection status of an OAuth payment integration.
 * Computed at runtime by comparing mp_token_expires_at vs now().
 */
export type PaymentIntegrationStatus = 'disconnected' | 'connected' | 'expired';

/**
 * Non-sensitive metadata about the Mercado Pago OAuth connection.
 * Raw token values are NEVER exposed to the frontend — they live
 * encrypted inside Supabase Vault (vault.secrets).
 * Only the Vault secret UUIDs and non-sensitive fields are here.
 */
export interface MercadoPagoOAuthData {
  /** UUID pointing to vault.secrets — access_token (never the token itself) */
  access_token_secret_id: UUID | null;
  /** UUID pointing to vault.secrets — refresh_token (never the token itself) */
  refresh_token_secret_id: UUID | null;
  /** When the access_token expires — used by Edge Functions for proactive refresh */
  token_expires_at: ISODate | null;
  /** Mercado Pago seller user ID (public, non-sensitive) */
  user_id: string | null;
  /** Computed from token_expires_at */
  status: PaymentIntegrationStatus;
}

/* ---------- Platform-level ---------- */

export type PlatformRole = "super_admin"; // global Scalius Vitrine staff
export type StoreRole = "owner" | "manager" | "staff";

export interface PlatformUser {
  id: UUID;
  email: string;
  full_name: string;
  platform_role?: PlatformRole; // null for normal store users
  created_at: ISODate;
}

export interface Store {
  id: UUID;
  slug: string;              // subdomain key — e.g. "rosa-bela"
  name: string;
  custom_domain?: string | null;
  status: "active" | "trial" | "suspended";
  created_at: ISODate;
}

export interface StoreMember {
  id: UUID;
  store_id: UUID;
  user_id: UUID;
  role: StoreRole;
  created_at: ISODate;
}

export interface StoreSettings {
  store_id: UUID;
  display_name: string;
  tagline?: string;            // home message
  logo_url?: string | null;
  favicon_url?: string | null; // store icon
  banner_url?: string | null;
  brand_color: string;         // primary HSL "H S% L%"
  secondary_color?: string;    // optional accent HSL
  whatsapp?: string;
  address?: string;            // pre-rendered single-line for display/fallback
  address_street?: string;
  address_number?: string;
  address_neighborhood?: string;
  address_city?: string;
  address_state?: string;
  opening_hours?: string;
  contact_message_template?: string;
  pix_key?: string | null;
  requires_payment_proof?: boolean;
  show_out_of_stock?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  shipping_mode?: "regions" | "distance";  // default: "regions"
  currency: string;            // "BRL"
  timezone: string;            // "America/Sao_Paulo"

  // National Shipping (Melhor Envio)
  national_shipping_enabled?: boolean;
  melhorenvio_token?: string | null;
  melhorenvio_sandbox?: boolean;
  sender_postal_code?: string | null;
  default_package_width_cm?: number;
  default_package_height_cm?: number;
  default_package_length_cm?: number;
  default_package_weight_kg?: number;
  shipping_markup_percent?: number;
  enabled_shipping_services?: number[]; // JSON array of service IDs
  sender_document?: string;
  sender_email?: string;
  sender_name?: string;
  sender_phone?: string;
  sender_address?: string;
  sender_address_number?: string;
  sender_complement?: string;
  sender_neighborhood?: string;
  sender_city?: string;
  sender_state?: string;
  store_name?: string;
  label_collect?: boolean;
  label_own_hand?: boolean;
  label_receipt?: boolean;
  melhorenvio_insurance?: boolean;

  // ---- Payment Gateway ----
  /**
   * Which payment provider the store uses.
   * 'manual' = traditional Pix key (default, backwards compatible).
   * Changing this switches the entire store's checkout flow.
   */
  payment_provider?: PaymentProvider;

  /**
   * Mercado Pago OAuth — Vault secret UUID refs (non-sensitive).
   * Raw tokens NEVER leave the server (Edge Functions only).
   * NULL when not connected or provider != 'mercadopago'.
   */
  mp_access_token_secret_id?: UUID | null;
  mp_refresh_token_secret_id?: UUID | null;

  /** When the MP access_token expires. Edge Functions check this before using. */
  mp_token_expires_at?: ISODate | null;

  /** Mercado Pago seller user ID (public). */
  mp_user_id?: string | null;

  // ---- Push Notifications ----
  notif_push_new_order?: boolean;
  notif_push_payment_confirmed?: boolean;
  notif_push_status_change?: boolean;

  // ---- Email Notifications ----
  notification_email?: string | null;
  notification_preferences?: NotificationPreferences | null;

  // Sound Notifications
  sound_enabled?: boolean;
  sound_volume?: "baixo" | "normal" | "alto";
  silent_hours_enabled?: boolean;
  silent_hours_start?: string;
  silent_hours_end?: string;
}

export interface NotificationPreferences {
  // Para a loja
  store_new_order?: boolean;
  store_payment_confirmed?: boolean;
  store_order_cancelled?: boolean;

  // Para o cliente
  customer_new_order?: boolean;
  customer_payment_confirmed?: boolean;
  customer_order_ready?: boolean;
  customer_order_dispatched?: boolean;
  customer_tracking_added?: boolean;
  customer_order_cancelled?: boolean;
  customer_order_delivered?: boolean;
  customer_order_picked_up?: boolean;
}

/* ---------- Catalog ---------- */

export interface Category {
  id: UUID;
  store_id: UUID;
  name: string;
  slug: string;
  position: number;
  image_url?: string | null;
}

export interface Product {
  id: UUID;
  store_id: UUID;
  category_id?: UUID | null;
  name: string;
  description?: string;
  price_cents: number;
  image_url?: string | null;
  active: boolean;
  stock?: number | null;
  created_at: ISODate;
  
  // Shipping dimensions
  weight_kg?: number | null;
  width_cm?: number | null;
  height_cm?: number | null;
  length_cm?: number | null;

  // Populated client-side when fetching with variant data
  hasVariants?: boolean;
}

/** A named group of options for a product, e.g. "Tamanho" or "Cor". */
export interface ProductVariantGroup {
  id: UUID;
  product_id: UUID;
  store_id: UUID;
  group_name: string;   // e.g. "Tamanho"
  sort_order: number;
  created_at: ISODate;
  // Populated when fetched with options
  options?: ProductVariantOption[];
}

/** A single selectable option within a variant group, e.g. "M" or "Azul". */
export interface ProductVariantOption {
  id: UUID;
  group_id: UUID;
  store_id: UUID;
  value: string;           // e.g. "P", "M", "G", "GG"
  stock_qty: number | null; // null = unlimited; 0 = out of stock
  sort_order: number;
  created_at: ISODate;
}

/* ---------- Customers & Orders ---------- */

export interface Customer {
  id: UUID;
  store_id: UUID;
  name: string;
  email?: string;
  phone?: string;
  created_at: ISODate;
}

export type OrderStatus =
  | "pending"
  | "preparing"
  | "ready"
  | "out_for_delivery"
  | "delivered"
  | "picked_up"
  | "cancelled";

export type DeliveryType = "delivery" | "pickup" | "local_delivery" | "national_shipping";

export interface OrderAddress {
  street?: string;
  number?: string;
  neighborhood?: string;
  complement?: string;
  full?: string; // pre-rendered single-line for display
}

export interface Order {
  id: UUID;
  store_id: UUID;
  customer_id: UUID;
  status: OrderStatus;
  delivery_type: DeliveryType;
  shipping_region_id?: UUID | null;
  shipping_region_name?: string | null;
  shipping_fee_cents: number;
  subtotal_cents: number;
  total_cents: number;
  delivery_id?: UUID | null;
  delivery_zone_id?: UUID | null;
  delivery_zone_name?: string | null;
  delivery_distance_km?: number | null;
  created_at: ISODate;
  
  // National Shipping
  shipping_service_id?: number | null;
  shipping_service_name?: string | null;
  shipping_company?: string | null;
  shipping_delivery_time_days?: number | null;
  tracking_code?: string | null;
  melhorenvio_order_id?: string | null;
  /**
   * Chave de acesso da NF-e (44 dígitos, sem espaços).
   * NULL = DC-e automática via Melhor Envio (non_commercial: true).
   * Preenchido = envio comercial com Nota Fiscal (non_commercial: false).
   */
  invoice_key?: string | null;

  // ---- Payment Gateway (per-order) ----
  /**
   * Which gateway generated this specific payment.
   * 'manual' for all existing orders (backwards compatible).
   */
  payment_provider?: PaymentProvider | null;

  /**
   * Payment ID in the external gateway (e.g. Mercado Pago payment ID).
   * Used for webhook reconciliation — match incoming webhook to this order.
   */
  external_payment_id?: string | null;

  /**
   * PIX EMV payload returned by the gateway (the "copia e cola" string).
   * Displayed in checkout so customer can copy and pay.
   */
  qr_code_data?: string | null;

  /**
   * Base64-encoded PNG of the PIX QR Code.
   * Displayed as <img src={`data:image/png;base64,${qr_code_base64}`} />
   */
  qr_code_base64?: string | null;

  /**
   * When this PIX charge expires.
   * Mercado Pago default: 30 minutes from creation.
   * After expiry a new charge must be created.
   */
  payment_expires_at?: ISODate | null;
}

export interface OrderItem {
  id: UUID;
  store_id: UUID;
  order_id: UUID;
  product_id: UUID;
  quantity: number;
  unit_price_cents: number;
  /** Human-readable variant selection, e.g. "Tamanho: M" or "Cor: Azul | Tamanho: G" */
  variant_label?: string | null;
  /** Array of ProductVariantOption IDs — used to decrement stock on order creation */
  variant_option_ids?: string[] | null;
}

/* ---------- Logistics ---------- */

export interface ShippingRule {
  id: UUID;
  store_id: UUID;
  name: string;              // neighborhood / region name shown to customer
  region?: string;           // optional extra (e.g. CEP prefix)
  price_cents: number;
  eta_hours?: number;
  active: boolean;
}

export interface DeliveryZone {
  id: UUID;
  store_id: UUID;
  name: string;              // ex: "Entrega Expressa"
  max_distance_km: number | null; // null = unlimited
  base_fee_cents: number;
  is_active: boolean;
  created_at: ISODate;
  pricing_type?: "manual" | "auto";
  auto_base_fee_cents?: number | null;
  auto_price_per_km_cents?: number | null;
  auto_price_per_min_cents?: number | null;
  auto_min_fee_cents?: number | null;
  auto_multiplier?: number | null;
}

export interface DistancePricing {
  id: UUID;
  delivery_zone_id: UUID;
  min_distance_km: number;
  max_distance_km: number;
  price_cents: number;
  created_at: ISODate;
}

export interface Delivery {
  id: UUID;
  store_id: UUID;
  order_id: UUID;
  recipient_name: string;
  address: string;
  scheduled_for: ISODate;
  status: "scheduled" | "in_transit" | "delivered" | "failed";
}