import { Link } from "react-router-dom";
import { ShoppingBag, Store, Trash2 } from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useCart } from "@/contexts/CartContext";
import { useTenant } from "@/contexts/TenantContext";
import { formatBRL } from "@/lib/mockData";
import { QuantityStepper } from "./QuantityStepper";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CartDrawer({ open, onOpenChange }: Props) {
  const { items, subtotalCents, updateQty, remove } = useCart();
  const { store } = useTenant();
  if (!store) return null;

  const close = () => onOpenChange(false);

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
                <Link to={`/loja/${store.slug}/produtos`}>Ver produtos</Link>
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto -mx-6 px-6 divide-y divide-border">
              {items.map((it) => (
                <div key={it.cartKey} className="py-4 flex gap-3">
                  <div className="h-16 w-16 flex-shrink-0 rounded-md bg-gradient-soft grid place-items-center overflow-hidden">
                    {it.image_url ? (
                      <img src={it.image_url} alt={it.name} className="h-full w-full object-cover" />
                    ) : (
                      <ShoppingBag className="h-6 w-6 text-primary/40" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-tight line-clamp-2">{it.name}</p>
                        {it.variantLabel && (
                          <p className="text-xs text-muted-foreground mt-0.5">{it.variantLabel}</p>
                        )}
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
              ))}
            </div>

            <Separator />

            <SheetFooter className="flex-col sm:flex-col gap-3">
              <div className="flex justify-between w-full">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-serif text-xl">{formatBRL(subtotalCents)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 w-full">
                <Button variant="outline" asChild onClick={close}>
                  <Link to={`/loja/${store.slug}/carrinho`}>Ver carrinho</Link>
                </Button>
                <Button asChild onClick={close}>
                  <Link to={`/loja/${store.slug}/checkout`}>Finalizar</Link>
                </Button>
              </div>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
