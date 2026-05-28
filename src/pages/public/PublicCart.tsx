import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ShoppingBag, Trash2, AlertCircle } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { useCart, type CartItem } from "@/contexts/CartContext";
import { formatBRL } from "@/lib/mockData";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { QuantityStepper } from "@/components/store/QuantityStepper";
import { EmptyState } from "@/components/store/EmptyState";
import { getStoreLink } from "@/lib/tenant";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export default function PublicCart() {
  const { store } = useTenant();
  const { items, subtotalCents, updateQty, remove, notes, setNotes, updateVariants } = useCart();
  const navigate = useNavigate();

  // Local state for incomplete variant choices: { [cartKey]: { [groupId]: optionId } }
  const [selectedVariants, setSelectedVariants] = useState<Record<string, Record<string, string>>>({});

  // Synchronize/cleanup selectedVariants state with current cart items
  useEffect(() => {
    const activeKeys = new Set(items.map((it) => it.cartKey));
    setSelectedVariants((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const key of Object.keys(prev)) {
        if (!activeKeys.has(key)) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [items]);

  // ── Busca quais produtos do carrinho têm grupos de variantes no banco ──────
  const productIds = items.map((it) => it.productId);

  const { data: productsWithVariants } = useQuery({
    queryKey: ["cart-page-variant-check", productIds.join(",")],
    queryFn: async () => {
      if (productIds.length === 0) return new Set<string>();
      const { data, error } = await supabase
        .from("product_variant_groups")
        .select("product_id")
        .in("product_id", productIds);
      if (error) throw error;
      return new Set<string>((data ?? []).map((g: any) => g.product_id as string));
    },
    enabled: productIds.length > 0,
    staleTime: 30_000,
  });

  // ── Busca todos os grupos e opções de variantes dos produtos do carrinho ──────
  const { data: cartVariantGroups = [] } = useQuery({
    queryKey: ["cart-page-variant-groups", productIds.join(",")],
    queryFn: async () => {
      if (productIds.length === 0) return [];
      
      const { data: groups, error: gErr } = await supabase
        .from("product_variant_groups")
        .select("*")
        .in("product_id", productIds)
        .order("sort_order");
      if (gErr) throw gErr;
      if (!groups || groups.length === 0) return [];

      const groupIds = groups.map((g) => g.id);
      const { data: opts, error: oErr } = await supabase
        .from("product_variant_options")
        .select("*")
        .in("group_id", groupIds)
        .order("sort_order");
      if (oErr) throw oErr;

      return groups.map((g: any) => ({
        id: g.id,
        product_id: g.product_id,
        group_name: g.group_name,
        sort_order: g.sort_order,
        options: (opts ?? [])
          .filter((o: any) => o.group_id === g.id)
          .map((o: any) => ({
            id: o.id,
            group_id: o.group_id,
            value: o.value,
            stock_qty: o.stock_qty ?? null,
            sort_order: o.sort_order,
          })),
      }));
    },
    enabled: productIds.length > 0,
    staleTime: 30_000,
  });

  if (!store) return null;

  if (items.length === 0) {
    return (
      <div className="container py-12">
        <EmptyState
          title="Seu carrinho está vazio"
          description="Que tal escolher um buquê especial?"
          action={
            <Button asChild>
              <Link to={getStoreLink("", store.slug)}>Ver produtos</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const isIncomplete = (it: CartItem): boolean => {
    const hasV = it.hasVariants || productsWithVariants?.has(it.productId);
    if (!hasV) return false;
    return !it.variantOptionIds || it.variantOptionIds.length === 0;
  };

  const hasIncomplete = items.some(isIncomplete);

  return (
    <div className="container py-8 md:py-14">
      <h1 className="font-serif text-3xl md:text-4xl mb-8">Seu carrinho</h1>

      <div className="grid lg:grid-cols-[1fr_360px] gap-8">
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card divide-y divide-border shadow-soft">
            {items.map((it) => {
              const incomplete = isIncomplete(it);
              const groups = cartVariantGroups.filter((g: any) => g.product_id === it.productId);

              return (
                <div key={it.cartKey} className={`p-4 flex gap-4 ${incomplete ? "bg-destructive/5" : ""}`}>
                  <div className="h-20 w-20 flex-shrink-0 rounded-md bg-gradient-soft grid place-items-center overflow-hidden relative">
                    {it.image_url ? (
                      <img src={it.image_url} alt={it.name} className="h-full w-full object-cover" />
                    ) : (
                      <ShoppingBag className="h-8 w-8 text-primary/40" />
                    )}
                    {incomplete && (
                      <div className="absolute inset-0 bg-destructive/25 flex items-center justify-center">
                        <AlertCircle className="h-8 w-8 text-destructive drop-shadow-sm" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium leading-tight">{it.name}</p>
                        {it.variantLabel ? (
                          <p className="text-sm text-muted-foreground mt-0.5">{it.variantLabel}</p>
                        ) : incomplete && groups.length > 0 ? (
                          <div className="mt-2 space-y-2 bg-background/50 p-2.5 rounded-md border border-destructive/10 max-w-md">
                            {groups.map((group: any) => {
                              const selectedOptionId = selectedVariants[it.cartKey]?.[group.id] || "";
                              return (
                                <div key={group.id} className="space-y-1">
                                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
                                    {group.group_name}:
                                  </span>
                                  <div className="flex flex-wrap gap-1.5">
                                    {group.options.map((opt: any) => {
                                      const isSelected = selectedOptionId === opt.id;
                                      const outOfStock = opt.stock_qty === 0;
                                      return (
                                        <button
                                          key={opt.id}
                                          disabled={outOfStock}
                                          onClick={() => {
                                            const newSelections = {
                                              ...(selectedVariants[it.cartKey] ?? {}),
                                              [group.id]: opt.id,
                                            };
                                            
                                            setSelectedVariants((prev) => ({
                                              ...prev,
                                              [it.cartKey]: newSelections,
                                            }));

                                            // Check if all groups have been selected
                                            const allSelected = groups.every((g: any) => !!newSelections[g.id]);
                                            if (allSelected) {
                                              const label = groups
                                                .map((g: any) => {
                                                  const oid = newSelections[g.id];
                                                  const o = g.options.find((xo: any) => xo.id === oid);
                                                  return o ? `${g.group_name}: ${o.value}` : null;
                                                })
                                                .filter(Boolean)
                                                .join(" | ");
                                              const optionIds = Object.values(newSelections);
                                              updateVariants(it.cartKey, optionIds, label);
                                            }
                                          }}
                                          className={`px-2 py-0.5 text-xs rounded border transition-all ${
                                            isSelected
                                              ? "bg-primary border-primary text-primary-foreground font-medium shadow-sm"
                                              : "border-input bg-background hover:bg-accent text-foreground"
                                          } ${outOfStock ? "opacity-40 cursor-not-allowed line-through" : ""}`}
                                        >
                                          {opt.value}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : incomplete ? (
                          <Link
                            to={getStoreLink(`produto/${it.productId}`, store.slug)}
                            className="text-xs text-destructive font-semibold mt-0.5 flex items-center gap-1 hover:underline animate-pulse"
                          >
                            <AlertCircle className="h-3 w-3 flex-shrink-0" />
                            Escolha uma opção →
                          </Link>
                        ) : null}
                      </div>
                      <button
                        onClick={() => remove(it.cartKey)}
                        className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                        aria-label="Remover"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="text-sm text-muted-foreground">{formatBRL(it.unit_price_cents)} cada</p>
                    <div className="flex items-center justify-between mt-auto">
                      <QuantityStepper value={it.quantity} onChange={(v) => updateQty(it.cartKey, v)} />
                      <span className="font-medium text-primary">
                        {formatBRL(it.unit_price_cents * it.quantity)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-xl border border-border bg-card p-5 space-y-2 shadow-soft">
            <Label htmlFor="cart-notes">Observações (opcional)</Label>
            <Textarea
              id="cart-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: deixar com a portaria, é presente..."
              maxLength={500}
              rows={3}
            />
            <p className="text-xs text-muted-foreground text-right">{notes.length}/500</p>
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-soft">
            <h2 className="font-serif text-xl">Resumo</h2>
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>{formatBRL(subtotalCents)}</span>
            </div>
            <Separator />
            <div className="flex justify-between items-baseline">
              <span>Total</span>
              <span className="font-serif text-2xl text-primary">{formatBRL(subtotalCents)}</span>
            </div>

            {hasIncomplete ? (
              <Button size="lg" disabled className="w-full opacity-60 cursor-not-allowed">
                Ir para o checkout (Escolha as opções)
              </Button>
            ) : (
              <Button size="lg" className="w-full" asChild>
                <Link to={getStoreLink("checkout", store.slug)}>Ir para o checkout</Link>
              </Button>
            )}

            <Button
              size="lg"
              variant="outline"
              className="w-full"
              onClick={() => navigate(-1)}
            >
              Continuar comprando
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
