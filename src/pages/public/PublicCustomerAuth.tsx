import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { Store } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { CustomerAuthModal } from "@/components/store/CustomerAuthModal";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";

export default function PublicCustomerAuth() {
  const { store } = useTenant();
  const { isAuthenticated, customer } = useCustomerAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [open, setOpen] = useState(true);

  // ?returnTo=/loja/slug/pedido/123 — redirect after login
  const returnTo = searchParams.get("returnTo");

  const handleSuccess = () => {
    if (returnTo) {
      navigate(returnTo, { replace: true });
    } else {
      navigate(`/loja/${store?.slug}`, { replace: true });
    }
  };

  // If already logged in, redirect immediately
  useEffect(() => {
    if (isAuthenticated && customer) {
      handleSuccess();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, customer]);

  if (!store) return null;

  return (
    <div className="container py-16 max-w-md mx-auto text-center space-y-4">
      <div className="mx-auto h-14 w-14 grid place-items-center rounded-full bg-primary/10 mb-4">
        <Store className="h-7 w-7 text-primary" />
      </div>
      <h1 className="font-serif text-3xl">Minha conta</h1>
      <p className="text-muted-foreground text-sm">
        Acesse sua conta para acompanhar seus pedidos.
      </p>
      <Button onClick={() => setOpen(true)} className="w-full max-w-xs">
        Entrar ou criar conta
      </Button>
      <p className="text-xs text-muted-foreground">
        <Link to={`/loja/${store.slug}`} className="underline underline-offset-4 hover:text-foreground">
          Voltar à loja
        </Link>
      </p>

      <CustomerAuthModal
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) navigate(`/loja/${store.slug}`);
        }}
        storeId={store.id}
        defaultTab="login"
        onSuccess={handleSuccess}
      />
    </div>
  );
}
