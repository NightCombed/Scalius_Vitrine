import { Link } from "react-router-dom";
import { ShoppingBag, XCircle, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/mockData";
import { getProductImage } from "@/lib/utils";
import { useCart } from "@/contexts/CartContext";
import { toast } from "sonner";
import type { Product } from "@/types/database";

interface Props {
  product: Product;
  storeSlug: string;
}

export function ProductCard({ product, storeSlug }: Props) {
  const { add } = useCart();
  const isOutOfStock = product.stock === 0;
  const hasVariants = product.hasVariants === true;

  const handleAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    // If product has variants, navigate to detail page instead of adding directly
    if (hasVariants) return;
    if (isOutOfStock) return;
    const firstImage = getProductImage(product.image_url);
    add({
      productId: product.id,
      name: product.name,
      unit_price_cents: product.price_cents,
      image_url: firstImage,
    });
    toast.success("Adicionado ao carrinho", { description: product.name });
  };

  return (
    <Link
      to={`/loja/${storeSlug}/produto/${product.id}`}
      className="group flex flex-col rounded-xl border border-border bg-card overflow-hidden shadow-soft hover:shadow-elegant transition-all relative h-full"
    >
      <div className="aspect-[4/3] bg-gradient-soft grid place-items-center overflow-hidden relative">
        {getProductImage(product.image_url) ? (
          <img
            src={getProductImage(product.image_url)!}
            alt={product.name}
            className={`h-full w-full object-cover transition-transform group-hover:scale-105 ${isOutOfStock ? "grayscale opacity-60" : ""}`}
            loading="lazy"
          />
        ) : (
          <ShoppingBag className="h-16 w-16 text-primary/40" />
        )}
        {isOutOfStock && (
          <div className="absolute inset-0 bg-background/20 backdrop-blur-[1px] flex items-center justify-center">
            <Badge variant="destructive" className="px-3 py-1 text-sm shadow-lg gap-1.5">
              <XCircle className="h-3.5 w-3.5" /> Esgotado
            </Badge>
          </div>
        )}
      </div>
      <div className="p-5 flex-1 flex flex-col justify-between gap-4">
        <div className="space-y-2">
          <h3 className="font-serif text-xl leading-tight break-words">{product.name}</h3>
          {product.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">{product.description}</p>
          )}
        </div>
        <div className="flex items-center justify-between pt-2 gap-2">
          <span className={`font-medium ${isOutOfStock ? "text-muted-foreground line-through" : "text-primary"}`}>
            {formatBRL(product.price_cents)}
          </span>

          {hasVariants ? (
            /* Products with variants → go to detail page to select option */
            <Button size="sm" variant="outline" className="gap-2 pointer-events-none">
              <SlidersHorizontal className="h-4 w-4" />
              Escolher
            </Button>
          ) : (
            <Button
              size="sm"
              variant={isOutOfStock ? "secondary" : "outline"}
              onClick={handleAdd}
              disabled={isOutOfStock}
              className="gap-2"
            >
              {isOutOfStock ? (
                "Indisponível"
              ) : (
                <>
                  <ShoppingBag className="h-4 w-4" />
                  Adicionar
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </Link>
  );
}
