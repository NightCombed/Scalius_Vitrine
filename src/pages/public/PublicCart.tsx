import { Link, useNavigate } from "react-router-dom";
import { ShoppingBag, Trash2 } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { useCart } from "@/contexts/CartContext";
import { formatBRL } from "@/lib/mockData";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { QuantityStepper } from "@/components/store/QuantityStepper";
import { EmptyState } from "@/components/store/EmptyState";

export default function PublicCart() {
  const { store } = useTenant();
  const { items, subtotalCents, updateQty, remove, notes, setNotes } = useCart();
  const navigate = useNavigate();

  if (!store) return null;

  if (items.length === 0) {
    return (
      <div className="container py-12">
        <EmptyState
          title="Seu carrinho está vazio"
          description="Que tal escolher um buquê especial?"
          action={
            <Button asChild>
              <Link to={`/loja/${store.slug}/produtos`}>Ver produtos</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="container py-8 md:py-14">
      <h1 className="font-serif text-3xl md:text-4xl mb-8">Seu carrinho</h1>

      <div className="grid lg:grid-cols-[1fr_360px] gap-8">
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card divide-y divide-border shadow-soft">
            {items.map((it) => (
              <div key={it.cartKey} className="p-4 flex gap-4">
                <div className="h-20 w-20 flex-shrink-0 rounded-md bg-gradient-soft grid place-items-center overflow-hidden">
                  {it.image_url ? (
                    <img src={it.image_url} alt={it.name} className="h-full w-full object-cover" />
                  ) : (
                    <ShoppingBag className="h-8 w-8 text-primary/40" />
                  )}
                </div>
                <div className="flex-1 min-w-0 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium leading-tight">{it.name}</p>
                      {it.variantLabel && (
                        <p className="text-sm text-muted-foreground">{it.variantLabel}</p>
                      )}
                    </div>
                    <button
                      onClick={() => remove(it.cartKey)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
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
            ))}
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
            <Button size="lg" className="w-full" asChild>
              <Link to={`/loja/${store.slug}/checkout`}>Ir para o checkout</Link>
            </Button>
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
