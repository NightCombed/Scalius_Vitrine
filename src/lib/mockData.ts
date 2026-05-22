/**
 * In-memory mock dataset, fully scoped by store_id.
 * Replace with Supabase queries later — same shapes.
 */
import type {
  Store, StoreSettings, Category, Product, Customer,
  Order, OrderItem, ShippingRule, Delivery, PlatformUser, StoreMember,
} from "@/types/database";

const mockRuntime = globalThis as typeof globalThis & {
  __scaliusMockDataInitialized__?: boolean;
};

export const stores: Store[] = [
  { id: "st_1", slug: "rosa-bela", name: "Rosa Bela Floricultura", status: "active", created_at: "2025-01-12T10:00:00Z" },
  { id: "st_2", slug: "jardim-do-sol", name: "Jardim do Sol", status: "trial", created_at: "2025-03-04T10:00:00Z" },
];

export const storeSettings: StoreSettings[] = [
  {
    store_id: "st_1",
    display_name: "Rosa Bela",
    tagline: "Flores frescas para todos os momentos. Entregamos com carinho na sua região 🌸",
    brand_color: "22 100% 50%",
    secondary_color: "0 0% 0%",
    whatsapp: "+55 11 90000-0000",
    address: "Rua das Acácias, 120 — Pinheiros, São Paulo — SP",
    address_street: "Rua das Acácias",
    address_number: "120",
    address_neighborhood: "Pinheiros",
    address_city: "São Paulo",
    address_state: "SP",
    opening_hours: "Segunda a sábado, das 08:00 às 18:00",
    contact_message_template: "Olá! Gostaria de fazer um pedido pela loja Rosa Bela.",
    logo_url: null,
    currency: "BRL",
    timezone: "America/Sao_Paulo",
    sound_enabled: true,
    sound_volume: "normal",
    silent_hours_enabled: false,
    silent_hours_start: "20:00",
    silent_hours_end: "08:00",
  },
  {
    store_id: "st_2",
    display_name: "Jardim do Sol",
    tagline: "Buquês frescos para todas as ocasiões",
    brand_color: "22 100% 50%",
    secondary_color: "0 0% 0%",
    whatsapp: "+55 21 90000-0000",
    address: "Av. Atlântica, 500 — Copacabana, Rio de Janeiro — RJ",
    address_street: "Av. Atlântica",
    address_number: "500",
    address_neighborhood: "Copacabana",
    address_city: "Rio de Janeiro",
    address_state: "RJ",
    opening_hours: "Todos os dias, das 09:00 às 19:00",
    contact_message_template: "Olá! Gostaria de fazer um pedido pela loja Jardim do Sol.",
    logo_url: null,
    currency: "BRL",
    timezone: "America/Sao_Paulo",
    sound_enabled: true,
    sound_volume: "normal",
    silent_hours_enabled: false,
    silent_hours_start: "20:00",
    silent_hours_end: "08:00",
  },
];

export const categories: Category[] = [
  { id: "c1", store_id: "st_1", name: "Buquês", slug: "buques", position: 1 },
  { id: "c2", store_id: "st_1", name: "Arranjos", slug: "arranjos", position: 2 },
  { id: "c3", store_id: "st_1", name: "Plantas", slug: "plantas", position: 3 },
  { id: "c4", store_id: "st_2", name: "Buquês", slug: "buques", position: 1 },
];

export const products: Product[] = [
  { id: "p1", store_id: "st_1", category_id: "c1", name: "Buquê de Rosas Vermelhas", description: "12 rosas premium colhidas no dia, embaladas com papel artesanal e fita de cetim.", price_cents: 18900, active: true, stock: 14, created_at: "" },
  { id: "p2", store_id: "st_1", category_id: "c1", name: "Buquê Campestre", description: "Mix delicado de flores do campo em tons pastéis.", price_cents: 14500, active: true, stock: 8, created_at: "" },
  { id: "p3", store_id: "st_1", category_id: "c2", name: "Arranjo Tropical", description: "Helicônias, antúrios e folhagens em vaso de cerâmica.", price_cents: 22900, active: true, stock: 5, created_at: "" },
  { id: "p4", store_id: "st_1", category_id: "c3", name: "Costela-de-Adão", description: "Planta tropical em vaso de 25cm, ideal para ambientes internos.", price_cents: 16900, active: true, stock: 11, created_at: "" },
  { id: "p5", store_id: "st_2", category_id: "c4", name: "Buquê Girassol", description: "5 girassóis frescos com folhagens.", price_cents: 12900, active: true, stock: 20, created_at: "" },
];

export const customers: Customer[] = [
  { id: "cu1", store_id: "st_1", name: "Marina Alves", email: "marina@example.com", phone: "+55 11 99999-1111", created_at: "" },
  { id: "cu2", store_id: "st_1", name: "Pedro Souza", email: "pedro@example.com", created_at: "" },
];

const today = new Date();
const iso = (daysAgo: number, h = 10, m = 0) => {
  const d = new Date(today);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

export const orders: Order[] = [
  { id: "o1", store_id: "st_1", customer_id: "cu1", status: "preparing", delivery_type: "delivery", shipping_region_id: "sr1", shipping_region_name: "Centro SP", shipping_fee_cents: 1500, subtotal_cents: 18900, total_cents: 20400, created_at: iso(0, 9, 15) },
  { id: "o2", store_id: "st_1", customer_id: "cu2", status: "delivered", delivery_type: "delivery", shipping_region_id: "sr2", shipping_region_name: "Zona Sul SP", shipping_fee_cents: 2500, subtotal_cents: 33400, total_cents: 35900, created_at: iso(1, 14, 20) },
  { id: "o3", store_id: "st_1", customer_id: "cu1", status: "pending", delivery_type: "pickup", shipping_fee_cents: 0, subtotal_cents: 14500, total_cents: 14500, created_at: iso(0, 11, 5) },
  { id: "o4", store_id: "st_1", customer_id: "cu2", status: "out_for_delivery", delivery_type: "delivery", shipping_region_id: "sr2", shipping_region_name: "Zona Sul SP", shipping_fee_cents: 2500, subtotal_cents: 22900, total_cents: 25400, created_at: iso(0, 8, 0) },
  { id: "o5", store_id: "st_1", customer_id: "cu1", status: "delivered", delivery_type: "delivery", shipping_region_id: "sr1", shipping_region_name: "Centro SP", shipping_fee_cents: 1500, subtotal_cents: 16900, total_cents: 18400, created_at: iso(2, 16, 30) },
  { id: "o6", store_id: "st_1", customer_id: "cu2", status: "cancelled", delivery_type: "pickup", shipping_fee_cents: 0, subtotal_cents: 12900, total_cents: 12900, created_at: iso(3, 10, 0) },
  { id: "o7", store_id: "st_1", customer_id: "cu1", status: "delivered", delivery_type: "delivery", shipping_region_id: "sr1", shipping_region_name: "Centro SP", shipping_fee_cents: 1500, subtotal_cents: 37800, total_cents: 39300, created_at: iso(5, 13, 0) },
];

export const orderItems: OrderItem[] = [
  { id: "oi1", store_id: "st_1", order_id: "o1", product_id: "p1", quantity: 1, unit_price_cents: 18900 },
  { id: "oi2", store_id: "st_1", order_id: "o2", product_id: "p2", quantity: 1, unit_price_cents: 14500 },
  { id: "oi3", store_id: "st_1", order_id: "o2", product_id: "p4", quantity: 1, unit_price_cents: 16900 },
  { id: "oi4", store_id: "st_1", order_id: "o3", product_id: "p2", quantity: 1, unit_price_cents: 14500 },
  { id: "oi5", store_id: "st_1", order_id: "o4", product_id: "p3", quantity: 1, unit_price_cents: 22900 },
  { id: "oi6", store_id: "st_1", order_id: "o5", product_id: "p4", quantity: 1, unit_price_cents: 16900 },
  { id: "oi7", store_id: "st_1", order_id: "o6", product_id: "p5", quantity: 1, unit_price_cents: 12900 },
  { id: "oi8", store_id: "st_1", order_id: "o7", product_id: "p1", quantity: 2, unit_price_cents: 18900 },
];

/** Order notes — separate so OrderItem stays clean. */
export const orderNotes: Record<string, string> = {
  o1: "Cartão: Feliz aniversário, mãe! Entregar antes das 12h.",
  o3: "Sem fita vermelha, por favor.",
  o4: "Tocar interfone 42.",
};

/** Order delivery addresses (mock — would come from order.delivery_address in DB). */
export const orderAddresses: Record<string, string> = {
  o1: "Rua das Acácias, 120 — Apto 32 — Pinheiros, São Paulo",
  o2: "Av. Paulista, 1000 — Bela Vista, São Paulo",
  o4: "Rua Oscar Freire, 200 — Jardins, São Paulo",
  o5: "Av. Faria Lima, 1500 — Itaim, São Paulo",
  o7: "Rua Teodoro Sampaio, 800 — Pinheiros, São Paulo",
};

export const shippingRules: ShippingRule[] = [
  { id: "sr1", store_id: "st_1", name: "Centro", price_cents: 1000, eta_hours: 3, active: true },
  { id: "sr2", store_id: "st_1", name: "Taquaralto", price_cents: 1500, eta_hours: 4, active: true },
  { id: "sr3", store_id: "st_1", name: "Plano Diretor", price_cents: 1200, eta_hours: 4, active: true },
  { id: "sr4", store_id: "st_2", name: "Centro", price_cents: 1500, eta_hours: 3, active: true },
];

export const deliveries: Delivery[] = [
  { id: "d1", store_id: "st_1", order_id: "o1", recipient_name: "Marina Alves", address: "R. das Flores, 10", scheduled_for: "2025-04-19T16:00:00Z", status: "scheduled" },
];

export const platformUsers: PlatformUser[] = [
  { id: "u_admin", email: "admin@scalius.com.br", full_name: "Scalius Admin", platform_role: "super_admin", created_at: "" },
  { id: "u_owner1", email: "owner@rosabela.com", full_name: "Helena Rosa", created_at: "" },
];

export const storeMembers: StoreMember[] = [
  { id: "m1", store_id: "st_1", user_id: "u_owner1", role: "owner", created_at: "" },
];

const MOCK_DATA_KEY = "scalius:mock-data:v1";
const MOCK_DATA_EVENT = "scalius:mock-data:changed";
const mockListeners = new Set<() => void>();

let mockSnapshot = {
  version: 0,
  orders,
  orderItems,
  customers,
  deliveries,
  orderNotes,
  orderAddresses,
  products,
  categories,
  shippingRules,
  storeSettings,
};

const replaceArray = <T,>(target: T[], next: T[] | undefined) => {
  if (!next) return;
  target.splice(0, target.length, ...next);
};

const replaceRecord = <T extends Record<string, string>>(target: T, next: T | undefined) => {
  Object.keys(target).forEach((key) => delete target[key]);
  if (next) Object.assign(target, next);
};

const refreshMockSnapshot = () => {
  mockSnapshot = {
    version: mockSnapshot.version + 1,
    orders,
    orderItems,
    customers,
    deliveries,
    orderNotes,
    orderAddresses,
    products,
    categories,
    shippingRules,
    storeSettings,
  };
};

const persistMockData = () => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    MOCK_DATA_KEY,
    JSON.stringify({ orders, orderItems, customers, deliveries, orderNotes, orderAddresses, products, categories, shippingRules, storeSettings })
  );
};

const emitMockDataChange = (reason: string) => {
  refreshMockSnapshot();
  persistMockData();
  console.log(`[mockData] ${reason}`, {
    orders: orders.length,
    customers: customers.length,
    deliveries: deliveries.length,
  });
  mockListeners.forEach((listener) => listener());
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(MOCK_DATA_EVENT, { detail: { reason } }));
  }
};

const hydrateMockData = () => {
  if (typeof window === "undefined") return;
  const raw = window.localStorage.getItem(MOCK_DATA_KEY);
  if (!raw) return;

  try {
    const parsed = JSON.parse(raw) as Partial<typeof mockSnapshot>;
    replaceArray(orders, parsed.orders);
    replaceArray(orderItems, parsed.orderItems);
    replaceArray(customers, parsed.customers);
    replaceArray(deliveries, parsed.deliveries);
    replaceArray(products, (parsed as any).products);
    replaceArray(categories, (parsed as any).categories);
    replaceArray(shippingRules, (parsed as any).shippingRules);
    replaceArray(storeSettings, (parsed as any).storeSettings);
    replaceRecord(orderNotes, parsed.orderNotes as typeof orderNotes | undefined);
    replaceRecord(orderAddresses, parsed.orderAddresses as typeof orderAddresses | undefined);
    refreshMockSnapshot();
  } catch (error) {
    console.error("[mockData] erro ao hidratar mock persistido", error);
  }
};

if (typeof window !== "undefined" && !mockRuntime.__scaliusMockDataInitialized__) {
  mockRuntime.__scaliusMockDataInitialized__ = true;
  hydrateMockData();
  window.addEventListener("storage", (event) => {
    if (event.key !== MOCK_DATA_KEY || !event.newValue) return;
    hydrateMockData();
    mockListeners.forEach((listener) => listener());
  });
  window.addEventListener(MOCK_DATA_EVENT, () => {
    refreshMockSnapshot();
    mockListeners.forEach((listener) => listener());
  });
}

export function subscribeMockData(listener: () => void) {
  mockListeners.add(listener);
  return () => mockListeners.delete(listener);
}

export function getMockDataSnapshot() {
  return mockSnapshot;
}

/* Tenant-scoped accessors — mirror the queries you'll do via Supabase RLS. */
export const byStore = {
  store: (slug: string) => stores.find((s) => s.slug === slug) ?? null,
  settings: (store_id: string) => storeSettings.find((s) => s.store_id === store_id) ?? null,
  categories: (store_id: string) => categories.filter((c) => c.store_id === store_id),
  products: (store_id: string) => products.filter((p) => p.store_id === store_id),
  product: (store_id: string, product_id: string) =>
    products.find((p) => p.store_id === store_id && p.id === product_id) ?? null,
  category: (store_id: string, slug: string) =>
    categories.find((c) => c.store_id === store_id && c.slug === slug) ?? null,
  orders: (store_id: string) => orders.filter((o) => o.store_id === store_id),
  order: (store_id: string, order_id: string) =>
    orders.find((o) => o.store_id === store_id && o.id === order_id) ?? null,
  orderItems: (store_id: string, order_id: string) =>
    orderItems.filter((oi) => oi.store_id === store_id && oi.order_id === order_id),
  customers: (store_id: string) => customers.filter((c) => c.store_id === store_id),
  customer: (store_id: string, customer_id: string) =>
    customers.find((c) => c.store_id === store_id && c.id === customer_id) ?? null,
  shippingRules: (store_id: string) => shippingRules.filter((s) => s.store_id === store_id),
  deliveries: (store_id: string) => deliveries.filter((d) => d.store_id === store_id),
};

export const formatBRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/* ---------- Order mutations & metrics ---------- */

export function updateOrderStatus(store_id: string, order_id: string, status: Order["status"]): Order | null {
  const o = orders.find((x) => x.store_id === store_id && x.id === order_id);
  if (!o) return null;
  o.status = status;
  console.log("[mockData] status atualizado", { store_id, order_id, status });
  emitMockDataChange(`updateOrderStatus:${order_id}`);
  return o;
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export const metrics = {
  todayRevenueCents(store_id: string) {
    const now = new Date();
    return byStore.orders(store_id)
      .filter((o) => o.status !== "cancelled" && sameDay(new Date(o.created_at), now))
      .reduce((s, o) => s + o.total_cents, 0);
  },
  countByStatus(store_id: string, status: Order["status"]) {
    return byStore.orders(store_id).filter((o) => o.status === status).length;
  },
  ordersToday(store_id: string) {
    const now = new Date();
    return byStore.orders(store_id).filter((o) => sameDay(new Date(o.created_at), now));
  },
  topProducts(store_id: string, limit = 5) {
    const items = orderItems.filter((oi) => oi.store_id === store_id);
    const map = new Map<string, { product_id: string; quantity: number; revenue_cents: number }>();
    for (const it of items) {
      const cur = map.get(it.product_id) ?? { product_id: it.product_id, quantity: 0, revenue_cents: 0 };
      cur.quantity += it.quantity;
      cur.revenue_cents += it.quantity * it.unit_price_cents;
      map.set(it.product_id, cur);
    }
    return Array.from(map.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, limit)
      .map((row) => ({
        ...row,
        product: products.find((p) => p.id === row.product_id) ?? null,
      }));
  },
};

export const ORDER_STATUS_LABEL: Record<string, string> = {
  pending:          "Pendente",
  preparing:        "Em preparação",
  ready:            "Pronto",
  out_for_delivery: "Saiu para entrega",
  delivered:        "Entregue",
  picked_up:        "Retirado",
  cancelled:        "Cancelado",
};

export const ORDER_STATUS_FLOW: string[] = [
  "pending", "preparing", "ready", "out_for_delivery", "delivered",
];

/* ---------- Order creation (mock) ---------- */

export interface CreateOrderInput {
  customer: { name: string; phone: string; email?: string };
  delivery_type: "delivery" | "pickup";
  address?: {
    street?: string;
    number?: string;
    neighborhood?: string;
    complement?: string;
  };
  shipping_region_id?: string | null;
  shipping_region_name?: string | null;
  shipping_fee_cents?: number;
  scheduled_for?: string | null;
  notes?: string;
  items: { product_id: string; quantity: number; unit_price_cents: number }[];
}

const genId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const formatAddress = (a?: CreateOrderInput["address"]) => {
  if (!a) return "";
  const left = [a.street, a.number].filter(Boolean).join(", ");
  const parts = [left, a.neighborhood, a.complement].filter(Boolean);
  return parts.join(" — ");
};

export function createOrder(store_id: string, input: CreateOrderInput): Order {
  console.log("[mockData] createOrder:store", { store_id, delivery_type: input.delivery_type, items: input.items.length });
  const customer: Customer = {
    id: genId("cu"),
    store_id,
    name: input.customer.name,
    email: input.customer.email,
    phone: input.customer.phone,
    created_at: new Date().toISOString(),
  };
  customers.push(customer);

  const subtotal_cents = input.items.reduce((n, i) => n + i.quantity * i.unit_price_cents, 0);
  const shipping_fee_cents = input.delivery_type === "delivery" ? (input.shipping_fee_cents ?? 0) : 0;
  const total_cents = subtotal_cents + shipping_fee_cents;
  const fullAddress = input.delivery_type === "delivery" ? formatAddress(input.address) : "";

  const order: Order = {
    id: genId("o"),
    store_id,
    customer_id: customer.id,
    status: "pending",
    delivery_type: input.delivery_type,
    shipping_region_id: input.delivery_type === "delivery" ? input.shipping_region_id ?? null : null,
    shipping_region_name: input.delivery_type === "delivery" ? input.shipping_region_name ?? null : null,
    shipping_fee_cents,
    subtotal_cents,
    total_cents,
    created_at: new Date().toISOString(),
  };
  orders.push(order);

  for (const it of input.items) {
    orderItems.push({
      id: genId("oi"),
      store_id,
      order_id: order.id,
      product_id: it.product_id,
      quantity: it.quantity,
      unit_price_cents: it.unit_price_cents,
    });
  }

  if (fullAddress) orderAddresses[order.id] = fullAddress;
  if (input.notes && input.notes.trim()) orderNotes[order.id] = input.notes.trim();

  if (input.delivery_type === "delivery" && fullAddress) {
    deliveries.push({
      id: genId("d"),
      store_id,
      order_id: order.id,
      recipient_name: customer.name,
      address: fullAddress,
      scheduled_for: input.scheduled_for ?? new Date().toISOString(),
      status: "scheduled",
    });
  }

  console.log("[mockData] pedido criado", {
    store_id, order_id: order.id, delivery_type: order.delivery_type,
    subtotal_cents, shipping_fee_cents, total_cents,
  });
  emitMockDataChange(`createOrder:${order.id}`);
  return order;
}

/* ---------- Catalog mutations ---------- */

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export interface ProductInput {
  name: string;
  description?: string;
  price_cents: number;
  category_id?: string | null;
  image_url?: string | null;
  active?: boolean;
  stock?: number | null;
}

export function createProduct(store_id: string, input: ProductInput): Product {
  const product: Product = {
    id: genId("p"),
    store_id,
    category_id: input.category_id ?? null,
    name: input.name.trim(),
    description: input.description?.trim() ?? "",
    price_cents: input.price_cents,
    image_url: input.image_url ?? null,
    active: input.active ?? true,
    stock: input.stock ?? null,
    created_at: new Date().toISOString(),
  };
  products.push(product);
  emitMockDataChange(`createProduct:${product.id}`);
  return product;
}

export function updateProduct(store_id: string, product_id: string, patch: Partial<ProductInput>): Product | null {
  const p = products.find((x) => x.store_id === store_id && x.id === product_id);
  if (!p) return null;
  Object.assign(p, {
    ...patch,
    name: patch.name?.trim() ?? p.name,
    description: patch.description?.trim() ?? p.description,
  });
  emitMockDataChange(`updateProduct:${product_id}`);
  return p;
}

export function deleteProduct(store_id: string, product_id: string): boolean {
  const idx = products.findIndex((x) => x.store_id === store_id && x.id === product_id);
  if (idx < 0) return false;
  products.splice(idx, 1);
  emitMockDataChange(`deleteProduct:${product_id}`);
  return true;
}

export function toggleProductActive(store_id: string, product_id: string): Product | null {
  const p = products.find((x) => x.store_id === store_id && x.id === product_id);
  if (!p) return null;
  p.active = !p.active;
  emitMockDataChange(`toggleProductActive:${product_id}`);
  return p;
}

export interface CategoryInput {
  name: string;
  position?: number;
}

export function createCategory(store_id: string, input: CategoryInput): Category {
  const maxPos = categories.filter((c) => c.store_id === store_id).reduce((m, c) => Math.max(m, c.position), 0);
  const cat: Category = {
    id: genId("c"),
    store_id,
    name: input.name.trim(),
    slug: slugify(input.name),
    position: input.position ?? maxPos + 1,
  };
  categories.push(cat);
  emitMockDataChange(`createCategory:${cat.id}`);
  return cat;
}

export function updateCategory(store_id: string, category_id: string, patch: Partial<CategoryInput>): Category | null {
  const c = categories.find((x) => x.store_id === store_id && x.id === category_id);
  if (!c) return null;
  if (patch.name !== undefined) {
    c.name = patch.name.trim();
    c.slug = slugify(patch.name);
  }
  if (patch.position !== undefined) c.position = patch.position;
  emitMockDataChange(`updateCategory:${category_id}`);
  return c;
}

export function deleteCategory(store_id: string, category_id: string): boolean {
  const idx = categories.findIndex((x) => x.store_id === store_id && x.id === category_id);
  if (idx < 0) return false;
  categories.splice(idx, 1);
  products.forEach((p) => {
    if (p.store_id === store_id && p.category_id === category_id) p.category_id = null;
  });
  emitMockDataChange(`deleteCategory:${category_id}`);
  return true;
}


/* ---------- Shipping rules (regions) mutations ---------- */

export interface ShippingRuleInput {
  name: string;
  price_cents: number;
  active?: boolean;
}

export function createShippingRule(store_id: string, input: ShippingRuleInput): ShippingRule {
  const rule: ShippingRule = {
    id: genId("sr"),
    store_id,
    name: input.name.trim(),
    price_cents: input.price_cents,
    active: input.active ?? true,
  };
  shippingRules.push(rule);
  emitMockDataChange(`createShippingRule:${rule.id}`);
  return rule;
}

export function updateShippingRule(store_id: string, rule_id: string, patch: Partial<ShippingRuleInput>): ShippingRule | null {
  const r = shippingRules.find((x) => x.store_id === store_id && x.id === rule_id);
  if (!r) return null;
  if (patch.name !== undefined) r.name = patch.name.trim();
  if (patch.price_cents !== undefined) r.price_cents = patch.price_cents;
  if (patch.active !== undefined) r.active = patch.active;
  emitMockDataChange(`updateShippingRule:${rule_id}`);
  return r;
}

export function deleteShippingRule(store_id: string, rule_id: string): boolean {
  const idx = shippingRules.findIndex((x) => x.store_id === store_id && x.id === rule_id);
  if (idx < 0) return false;
  shippingRules.splice(idx, 1);
  emitMockDataChange(`deleteShippingRule:${rule_id}`);
  return true;
}

export function toggleShippingRuleActive(store_id: string, rule_id: string): ShippingRule | null {
  const r = shippingRules.find((x) => x.store_id === store_id && x.id === rule_id);
  if (!r) return null;
  r.active = !r.active;
  emitMockDataChange(`toggleShippingRuleActive:${rule_id}`);
  return r;
}

/* ---------- Store settings mutation ---------- */

export type StoreSettingsPatch = Partial<Omit<StoreSettings, "store_id">>;

const composeAddress = (s: StoreSettings) => {
  const left = [s.address_street, s.address_number].filter(Boolean).join(", ");
  const cityState = [s.address_city, s.address_state].filter(Boolean).join(" — ");
  return [left, s.address_neighborhood, cityState].filter(Boolean).join(" — ");
};

export function updateStoreSettings(store_id: string, patch: StoreSettingsPatch): StoreSettings | null {
  const s = storeSettings.find((x) => x.store_id === store_id);
  if (!s) return null;
  Object.assign(s, patch);
  // Recompose single-line address from structured fields if any structured field was provided
  const structuralKeys: (keyof StoreSettings)[] = [
    "address_street", "address_number", "address_neighborhood", "address_city", "address_state",
  ];
  if (structuralKeys.some((k) => k in patch)) {
    s.address = composeAddress(s);
  }
  emitMockDataChange(`updateStoreSettings:${store_id}`);
  return s;
}
