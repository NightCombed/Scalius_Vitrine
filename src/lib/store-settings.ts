import type { StoreSettings } from "@/types/database";

/**
 * Maps a raw database row from store_settings to the domain StoreSettings type.
 */
export function mapStoreSettings(data: any): StoreSettings {
  return {
    store_id: data.store_id,
    display_name: data.store_name,
    tagline: data.message,
    logo_url: data.logo_url,
    banner_url: data.banner_url,
    favicon_url: data.favicon_url,
    brand_color: data.primary_color || "22 100% 50%",
    secondary_color: data.secondary_color || "0 0% 0%",
    whatsapp: data.whatsapp_number,
    address: [
      [data.address_street, data.address_number].filter(Boolean).join(", "),
      data.address_neighborhood,
      [data.address_city, data.address_state].filter(Boolean).join(" — ")
    ].filter(Boolean).join(" — "),
    address_street: data.address_street,
    address_number: data.address_number,
    address_neighborhood: data.address_neighborhood,
    address_city: data.address_city,
    address_state: data.address_state,
    opening_hours: data.opening_hours,
    contact_message_template: data.contact_message_template,
    pix_key: data.pix_key,
    requires_payment_proof: data.requires_payment_proof ?? false,
    show_out_of_stock: data.show_out_of_stock ?? true,
    latitude: data.latitude ? Number(data.latitude) : null,
    longitude: data.longitude ? Number(data.longitude) : null,
    shipping_mode: data.shipping_mode ?? "regions",
    currency: "BRL",
    timezone: "America/Sao_Paulo",
    
    // National Shipping
    national_shipping_enabled: data.national_shipping_enabled ?? false,
    melhorenvio_token: data.melhorenvio_token || "",
    melhorenvio_sandbox: data.melhorenvio_sandbox ?? false,
    sender_postal_code: data.sender_postal_code || "",
    enabled_shipping_services: data.enabled_shipping_services ? (data.enabled_shipping_services as number[]) : [1, 2],
    shipping_markup_percent: data.shipping_markup_percent ?? 0,
    default_package_width_cm: data.default_package_width_cm ?? 30,
    default_package_height_cm: data.default_package_height_cm ?? 30,
    default_package_length_cm: data.default_package_length_cm ?? 40,
    default_package_weight_kg: data.default_package_weight_kg ?? 1,
    sender_document: data.sender_document || "",
    sender_email: data.sender_email || "",
    sender_name: data.sender_name || "",
    sender_phone: data.sender_phone || "",
    sender_address: data.sender_address || "",
    sender_address_number: data.sender_address_number || "",
    sender_complement: data.sender_complement || "",
    sender_neighborhood: data.sender_neighborhood || "",
    sender_city: data.sender_city || "",
    sender_state: data.sender_state || "",
    label_collect: data.label_collect ?? false,
    label_own_hand: data.label_own_hand ?? false,
    label_receipt: data.label_receipt ?? false,
    melhorenvio_insurance: data.melhorenvio_insurance ?? true,

    // Payment Gateway
    payment_provider: data.payment_provider ?? "manual",
    mp_access_token_secret_id: data.mp_access_token_secret_id ?? null,
    mp_refresh_token_secret_id: data.mp_refresh_token_secret_id ?? null,
    mp_token_expires_at: data.mp_token_expires_at ?? null,
    mp_user_id: data.mp_user_id ?? null,

    // Push Notifications
    notif_push_new_order: data.notif_push_new_order ?? true,
    notif_push_payment_confirmed: data.notif_push_payment_confirmed ?? true,
    // Email Notifications
    notification_email: data.notification_email || null,
    notification_preferences: data.notification_preferences || null,

    // Sound Notifications
    sound_enabled: data.sound_enabled ?? true,
    sound_volume: data.sound_volume ?? "normal",
    silent_hours_enabled: data.silent_hours_enabled ?? false,
    silent_hours_start: data.silent_hours_start ?? "20:00",
    silent_hours_end: data.silent_hours_end ?? "08:00",
  };
}
