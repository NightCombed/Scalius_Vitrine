import { ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/contexts/CartContext";

interface Props {
  onClick: () => void;
}

export function CartIconButton({ onClick }: Props) {
  const { itemCount } = useCart();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onClick}
      aria-label={`Abrir carrinho (${itemCount} ${itemCount === 1 ? "item" : "itens"})`}
      className="relative"
    >
      <ShoppingBag className="h-6 w-6" />
      {itemCount > 0 && (
        <span className="absolute -top-1 -right-1 grid place-items-center h-5 min-w-5 px-1 rounded-full bg-accent text-accent-foreground text-[10px] font-semibold">
          {itemCount}
        </span>
      )}
    </Button>
  );
}
