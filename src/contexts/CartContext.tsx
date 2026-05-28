import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTenant } from "@/contexts/TenantContext";

export interface CartItem {
  /** Unique key for this line — productId + variant options (allows same product with different variants) */
  cartKey: string;
  productId: string;
  name: string;
  unit_price_cents: number;
  quantity: number;
  image_url?: string | null;
  /** Human-readable variant label, e.g. "Tamanho: M" or "Cor: Azul | Tamanho: G" */
  variantLabel?: string;
  /** IDs of the selected ProductVariantOptions — used to decrement stock on order submit */
  variantOptionIds?: string[];
  /** True when the product has variant groups — used to flag incomplete selections */
  hasVariants?: boolean;
}

/**
 * Returns true when a cart item belongs to a product that has variants but
 * none (or not all) variant options have been selected yet.
 */
export function isCartItemIncomplete(item: CartItem): boolean {
  if (!item.hasVariants) return false;
  return !item.variantOptionIds || item.variantOptionIds.length === 0;
}

/** Helper: builds a stable cart key from productId + optional variant option IDs */
export function buildCartKey(productId: string, variantOptionIds?: string[]): string {
  if (!variantOptionIds || variantOptionIds.length === 0) return productId;
  return `${productId}__${[...variantOptionIds].sort().join("|")}`;
}

interface CartContextValue {
  items: CartItem[];
  notes: string;
  itemCount: number;
  subtotalCents: number;
  add: (
    item: Omit<CartItem, "quantity" | "cartKey">,
    quantity?: number
  ) => void;
  remove: (cartKey: string) => void;
  updateQty: (cartKey: string, quantity: number) => void;
  updateVariants: (cartKey: string, variantOptionIds: string[], variantLabel: string) => void;
  setNotes: (notes: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

const storageKey = (slug: string) => `scalius:cart:${slug}`;

export function CartProvider({ children }: { children: ReactNode }) {
  const { store } = useTenant();
  const slug = store?.slug ?? "__none__";

  const [items, setItems] = useState<CartItem[]>([]);
  const [notes, setNotesState] = useState("");

  // Load on slug change
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(slug));
      if (raw) {
        const parsed = JSON.parse(raw);
        // Backfill cartKey for items saved before this version
        const loadedItems: CartItem[] = (Array.isArray(parsed.items) ? parsed.items : []).map(
          (it: Partial<CartItem>) => ({
            ...it,
            cartKey: it.cartKey ?? buildCartKey(it.productId!, it.variantOptionIds),
          })
        );
        setItems(loadedItems);
        setNotesState(typeof parsed.notes === "string" ? parsed.notes : "");
      } else {
        setItems([]);
        setNotesState("");
      }
    } catch {
      setItems([]);
      setNotesState("");
    }
  }, [slug]);

  // Persist
  useEffect(() => {
    if (slug === "__none__") return;
    localStorage.setItem(storageKey(slug), JSON.stringify({ items, notes }));
  }, [slug, items, notes]);

  const value = useMemo<CartContextValue>(() => {
    const itemCount = items.reduce((n, i) => n + i.quantity, 0);
    const subtotalCents = items.reduce((n, i) => n + i.quantity * i.unit_price_cents, 0);

    return {
      items,
      notes,
      itemCount,
      subtotalCents,

      add: (item, quantity = 1) => {
        const cartKey = buildCartKey(item.productId, item.variantOptionIds);
        setItems((prev) => {
          const existing = prev.find((p) => p.cartKey === cartKey);
          if (existing) {
            return prev.map((p) =>
              p.cartKey === cartKey ? { ...p, quantity: p.quantity + quantity } : p
            );
          }
          return [...prev, { ...item, cartKey, quantity }];
        });
      },

      remove: (cartKey) =>
        setItems((prev) => prev.filter((p) => p.cartKey !== cartKey)),

      updateQty: (cartKey, quantity) =>
        setItems((prev) =>
          quantity <= 0
            ? prev.filter((p) => p.cartKey !== cartKey)
            : prev.map((p) => (p.cartKey === cartKey ? { ...p, quantity } : p))
        ),

      updateVariants: (cartKey, variantOptionIds, variantLabel) => {
        setItems((prev) => {
          const item = prev.find((p) => p.cartKey === cartKey);
          if (!item) return prev;

          const newCartKey = buildCartKey(item.productId, variantOptionIds);

          // Check if another item with target variants already exists
          const existing = prev.find((p) => p.cartKey === newCartKey);
          if (existing) {
            // Merge quantities and remove the old item
            return prev
              .map((p) =>
                p.cartKey === newCartKey
                  ? { ...p, quantity: p.quantity + item.quantity }
                  : p
              )
              .filter((p) => p.cartKey !== cartKey);
          }

          // Just update the item details
          return prev.map((p) =>
            p.cartKey === cartKey
              ? {
                  ...p,
                  cartKey: newCartKey,
                  variantOptionIds,
                  variantLabel,
                }
              : p
          );
        });
      },

      setNotes: (n) => setNotesState(n.slice(0, 500)),

      clear: () => {
        setItems([]);
        setNotesState("");
      },
    };
  }, [items, notes]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
