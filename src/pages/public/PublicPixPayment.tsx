import { useEffect, useState, useCallback } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { Copy, QrCode, RefreshCw, CheckCircle2, Clock, AlertTriangle, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { useTenant } from "@/contexts/TenantContext";
import { formatBRL } from "@/lib/mockData";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { getStoreLink } from "@/lib/tenant";

function useCountdown(expiresAt: string | null | undefined) {
  const [secondsLeft, setSecondsLeft] = useState<number>(0);

  useEffect(() => {
    if (!expiresAt) return;
    const update = () => {
      const diff = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(diff);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const expired = secondsLeft === 0;

  return { minutes, seconds, expired, secondsLeft };
}

export default function PublicPixPayment() {
  const { store, settings } = useTenant();
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const [regenerating, setRegenerating] = useState(false);

  // Load the order
  const { data: order, isLoading, refetch } = useQuery({
    queryKey: ["pix-order", orderId],
    queryFn: async () => {
      if (!orderId) return null;
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, total_cents, payment_status, qr_code_data, qr_code_base64, payment_expires_at, customer_name")
        .eq("id", orderId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!orderId,
    refetchInterval: (query) => {
      const data = query.state.data;
      // Stop polling once paid or expired
      if (data?.payment_status === "paid") return false;
      return 3000; // poll every 3 seconds
    },
  });

  const { minutes, seconds, expired } = useCountdown(order?.payment_expires_at);

  // Redirect to confirmation once paid
  useEffect(() => {
    if (order?.payment_status === "paid") {
      toast.success("Pagamento confirmado! 🎉");
      setTimeout(() => navigate(getStoreLink(`pedido/${orderId}`, store?.slug || "")), 1500);
    }
  }, [order?.payment_status, navigate, orderId, store?.slug]);

  const copyPixCode = async () => {
    if (!order?.qr_code_data) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(order.qr_code_data);
      } else {
        const ta = document.createElement("textarea");
        ta.value = order.qr_code_data;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      toast.success("Código Pix copiado!");
    } catch {
      toast.error("Não foi possível copiar. Copie manualmente.");
    }
  };

  const regeneratePix = useCallback(async () => {
    if (!orderId) return;
    setRegenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("mercadopago-pix", {
        body: { order_id: orderId },
      });
      if (error || !data?.qr_code) throw new Error(error?.message || "Erro ao gerar QR Code");
      toast.success("Novo QR Code gerado!");
      refetch();
    } catch (err: any) {
      toast.error("Erro ao gerar novo QR Code", { description: err.message });
    } finally {
      setRegenerating(false);
    }
  }, [orderId, refetch]);

  if (!store) return null;

  if (isLoading) {
    return (
      <div className="container py-16 grid place-items-center min-h-[50vh]">
        <Loader2 className="h-10 w-10 text-primary animate-spin" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="container py-16 text-center">
        <p className="text-muted-foreground mb-4">Pedido não encontrado.</p>
        <Button asChild variant="outline"><Link to={getStoreLink("", store.slug)}>Voltar à loja</Link></Button>
      </div>
    );
  }

  if (order.payment_status === "paid") {
    return (
      <div className="container py-16 grid place-items-center min-h-[50vh]">
        <div className="text-center space-y-4">
          <CheckCircle2 className="h-16 w-16 text-emerald-500 mx-auto animate-in zoom-in duration-500" />
          <h1 className="font-serif text-3xl">Pagamento confirmado!</h1>
          <p className="text-muted-foreground">Redirecionando...</p>
        </div>
      </div>
    );
  }

  const orderNumber = order.order_number || order.id.slice(-6).toUpperCase();

  return (
    <div className="container py-10 md:py-16 max-w-lg mx-auto">
      {/* Header */}
      <div className="text-center space-y-2 mb-8">
        <div className="mx-auto h-14 w-14 grid place-items-center rounded-full bg-primary/10 mb-3">
          <QrCode className="h-7 w-7 text-primary" />
        </div>
        <h1 className="font-serif text-3xl">Pagar via Pix</h1>
        <p className="text-muted-foreground">
          Pedido <span className="font-medium text-foreground">#{orderNumber}</span>
        </p>
        <p className="text-2xl font-bold text-primary">{formatBRL(order.total_cents)}</p>
      </div>

      {/* Timer */}
      {!expired && (
        <div className={`flex items-center justify-center gap-2 mb-6 text-sm font-medium rounded-full py-2 px-4 w-fit mx-auto ${
          minutes === 0 ? "bg-destructive/10 text-destructive" : "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300"
        }`}>
          <Clock className="h-4 w-4" />
          QR Code expira em {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
        </div>
      )}

      {/* Main Payment Block */}
      {expired ? (
        <div className="rounded-xl border-2 border-destructive/30 bg-destructive/5 p-8 text-center space-y-4">
          <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
          <h2 className="font-serif text-xl">QR Code expirado</h2>
          <p className="text-muted-foreground text-sm">O tempo de pagamento expirou. Gere um novo QR Code para continuar.</p>
          <Button onClick={regeneratePix} disabled={regenerating} className="gap-2">
            {regenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Gerar novo QR Code
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border-2 border-primary/20 bg-card p-6 space-y-6">
          {/* QR Code Image */}
          {order.qr_code_base64 ? (
            <div className="flex flex-col items-center gap-3">
              <img
                src={`data:image/png;base64,${order.qr_code_base64}`}
                alt="QR Code Pix"
                className="rounded-xl border border-border shadow-md w-52 h-52 object-contain"
              />
              <p className="text-xs text-muted-foreground">Escaneie com o app do seu banco</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="w-52 h-52 rounded-xl border border-border bg-muted/50 grid place-items-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground font-medium">ou copie o código abaixo</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Pix Copy-Paste Code */}
          {order.qr_code_data && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2.5">
                <span className="flex-1 font-mono text-xs break-all text-muted-foreground select-all line-clamp-3">
                  {order.qr_code_data}
                </span>
              </div>
              <Button onClick={copyPixCode} className="w-full gap-2" size="lg">
                <Copy className="h-4 w-4" />
                Copiar código Pix
              </Button>
            </div>
          )}

          {/* Info */}
          <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 p-3 text-sm text-blue-800 dark:text-blue-300">
            <p className="font-medium mb-1">⚡ Confirmação automática</p>
            <p className="text-xs">Assim que o pagamento for identificado, você será redirecionado automaticamente para a confirmação do pedido.</p>
          </div>
        </div>
      )}

      {/* Back link */}
      <div className="mt-8 text-center">
        <Link
          to={getStoreLink(`pedido/${orderId}`, store.slug)}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
        >
          Ver resumo do pedido
        </Link>
      </div>
    </div>
  );
}
