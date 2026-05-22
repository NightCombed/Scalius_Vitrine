import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { User, LogOut, ChevronDown, Loader2, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { CustomerAuthModal } from "@/components/store/CustomerAuthModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

interface CustomerNavButtonProps {
  storeId: string;
  storeSlug: string;
}

export function CustomerNavButton({ storeId, storeSlug }: CustomerNavButtonProps) {
  const { customer, isAuthenticated, isLoading, logout } = useCustomerAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      toast.success("Até logo!");
    } catch {
      toast.error("Erro ao sair.");
    } finally {
      setLoggingOut(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-9 w-9 grid place-items-center">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Logged in: show avatar dropdown ────────────────────────────────────────
  if (isAuthenticated && customer) {
    const initials = customer.full_name
      ? customer.full_name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
      : customer.email[0].toUpperCase();

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-1.5 rounded-full border border-border bg-background pl-1 pr-2 py-1 text-sm hover:bg-muted transition-colors">
            <span className="h-7 w-7 rounded-full bg-primary text-primary-foreground grid place-items-center text-xs font-bold">
              {initials}
            </span>
            <span className="hidden sm:inline max-w-[120px] truncate font-medium">
              {customer.full_name?.split(" ")[0] || customer.email}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel className="font-normal">
            <p className="font-medium text-sm truncate">{customer.full_name || "Cliente"}</p>
            <p className="text-xs text-muted-foreground truncate">{customer.email}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild className="gap-2">
            <Link to={`/loja/${storeSlug}/minha-conta`}>
              <ShoppingBag className="h-4 w-4" /> Meus pedidos
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleLogout}
            disabled={loggingOut}
            className="text-destructive focus:text-destructive gap-2"
          >
            {loggingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
            Sair da conta
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // ── Not logged in: show login button ───────────────────────────────────────
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setAuthOpen(true)}
        aria-label="Entrar na conta"
        title="Entrar na conta"
      >
        <User className="h-6 w-6" />
      </Button>

      <CustomerAuthModal
        open={authOpen}
        onOpenChange={setAuthOpen}
        storeId={storeId}
        defaultTab="login"
        onSuccess={() => setAuthOpen(false)}
      />
    </>
  );
}
