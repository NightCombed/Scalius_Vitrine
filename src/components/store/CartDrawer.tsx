import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, ShoppingBag, Store, Trash2 } from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useCart } from "@/contexts/CartContext";
import { useTenant } from "@/contexts/TenantContext";
import { formatBRL } from "@/lib/mockData";
import { QuantityStepper } from "./QuantityStepper";
import { getStoreLink } from "@/lib/tenant";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CartItem } from "@/contexts/CartContext";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CartDrawer({ open, onOpenChange }: Props) {
  const { items, subtotalCents, updateQty, remove, updateVariants } = useCart();
  const { store } = useTenant();

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
    queryKey: ["cart-variant-check", productIds.join(",")],
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
    queryKey: ["cart-variant-groups", productIds.join(",")],
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

  const close = () => onOpenChange(false);

  /**
   * Item está incompleto quando:
   * - O produto tem grupos de variantes (flag local OU consulta ao banco)
   * - E nenhuma opção foi selecionada (variantOptionIds vazio/undefined)
   */
  const isIncomplete = (it: CartItem): boolean => {
    const hasV = it.hasVariants || productsWithVariants?.has(it.productId);
    if (!hasV) return false;
    return !it.variantOptionIds || it.variantOptionIds.length === 0;
  };

  const incompleteItems = items.filter(isIncomplete);
  const hasIncomplete = incompleteItems.length > 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-serif text-2xl">Seu carrinho</SheetTitle>
        </SheetHeader>

        {items.length === 0 ? (
          <div className="flex-1 grid place-items-center text-center px-6">
            <div className="space-y-3">
              <div className="mx-auto h-14 w-14 grid place-items-center rounded-full bg-secondary">
                <Store className="h-6 w-6 text-primary" />
              </div>
              <p className="text-muted-foreground">Seu carrinho está vazio.</p>
              <Button asChild onClick={close}>
                <Link to={getStoreLink("", store.slug)}>Ver produtos</Link>
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto -mx-6 px-6 divide-y divide-border">
              {items.map((it) => {
                const incomplete = isIncomplete(it);
                const groups = cartVariantGroups.filter((g: any) => g.product_id === it.productId);

                return (
                  <div
                    key={it.cartKey}
                    className={`py-4 flex gap-3 ${incomplete ? "bg-destructive/5 -mx-6 px-6" : ""}`}
                  >
                    {/* Miniatura */}
                    <div className="h-16 w-16 flex-shrink-0 rounded-md bg-gradient-soft grid place-items-center overflow-hidden relative">
                      {it.image_url ? (
                        <img src={it.image_url} alt={it.name} className="h-full w-full object-cover" />
                      ) : (
                        <ShoppingBag className="h-6 w-6 text-primary/40" />
                      )}
                      {incomplete && (
                        <div className="absolute inset-0 bg-destructive/25 flex items-center justify-center">
                          <AlertCircle className="h-6 w-6 text-destructive drop-shadow-sm" />
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium leading-tight line-clamp-2">{it.name}</p>
                          {it.variantLabel ? (
                            <p className="text-xs text-muted-foreground mt-0.5">{it.variantLabel}</p>
                          ) : incomplete && groups.length > 0 ? (
                            <div className="mt-2 space-y-2 bg-background/50 p-2 rounded-md border border-destructive/10">
                              {groups.map((group: any) => {
                                const selectedOptionId = selectedVariants[it.cartKey]?.[group.id] || "";
                                return (
                                  <div key={group.id} className="space-y-1">
                                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
                                      {group.group_name}:
                                    </span>
                                    <div className="flex flex-wrap gap-1">
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
                                            className={`px-1.5 py-0.5 text-[11px] rounded border transition-all ${
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
                              onClick={close}
                              className="text-xs text-destructive font-semibold mt-0.5 flex items-center gap-1 hover:underline"
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
                      <div className="flex items-center justify-between">
                        <QuantityStepper value={it.quantity} onChange={(v) => updateQty(it.cartKey, v)} />
                        <span className="text-sm font-medium text-primary">
                          {formatBRL(it.unit_price_cents * it.quantity)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <Separator />

            <SheetFooter className="flex-col sm:flex-col gap-3">
              {/* Banner de aviso */}
              {hasIncomplete && (
                <div className="w-full rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-destructive leading-snug">
                    <span className="font-semibold">
                      {incompleteItems.length === 1
                        ? "1 produto precisa de opções."
                        : `${incompleteItems.length} produtos precisam de opções.`}
                    </span>{" "}
                    Selecione as opções diretamente nos itens acima para prosseguir.
                  </p>
                </div>
              )}

              <div className="flex justify-between w-full">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-serif text-xl">{formatBRL(subtotalCents)}</span>
              </div>

              <div className="grid grid-cols-2 gap-2 w-full">
                <Button variant="outline" asChild onClick={close}>
                  <Link to={getStoreLink("carrinho", store.slug)}>Ver carrinho</Link>
                </Button>
                {hasIncomplete ? (
                  <Button disabled className="opacity-60 cursor-not-allowed">
                    Finalizar
                  </Button>
                ) : (
                  <Button asChild onClick={close}>
                    <Link to={getStoreLink("checkout", store.slug)}>Finalizar</Link>
                  </Button>
                )}
              </div>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
