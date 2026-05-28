import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  CheckCircle2, Clock, Copy, ExternalLink, Loader2, Package,
  QrCode, Store, Truck, UserPlus, X, XCircle, ShoppingBag,
} from "lucide-react";
import { format, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import QRCode from "qrcode";

import { useTenant } from "@/contexts/TenantContext";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { formatBRL } from "@/lib/mockData";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { WhatsAppButton } from "@/components/store/WhatsAppButton";
import { EmptyState } from "@/components/store/EmptyState";
import { CustomerAuthModal } from "@/components/store/CustomerAuthModal";
import { getStoreLink } from "@/lib/tenant";

// ─── Pix helpers (kept from old confirmation page) ────────────────────────────

function pixKeyType(key: string): string | null {
  if (!key) return null;
  const clean = key.trim();
  if (/^\+?\d{10,14}$/.test(clean.replace(/[\s\-().]/g, ""))) return "phone";
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return "email";
  if (/^\d{11}$/.test(clean.replace(/\D/g, ""))) return "cpf";
  if (/^\d{14}$/.test(clean.replace(/\D/g, ""))) return "cnpj";
  if (/^[0-9a-f-]{36}$/i.test(clean)) return "random";
  return null;
}

function buildPixPayload(key: string, merchantName: string, city: string): string {
  const e = (id: string, v: string) => `${id}${v.length.toString().padStart(2, "0")}${v}`;
  const mai = e("00", "BR.GOV.BCB.PIX") + e("01", key.trim());
  const payload =
    e("00", "01") + e("26", mai) + e("52", "0000") + e("53", "986") +
    e("59", merchantName.slice(0, 25)) + e("60", city.slice(0, 15)) + e("62", e("05", "***"));
  const data = payload + "6304";
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
    crc &= 0xffff;
  }
  return payload + "6304" + crc.toString(16).toUpperCase().padStart(4, "0");
}

// ─── Status / timeline config ─────────────────────────────────────────────────

const PICKUP_STEPS = ["pending", "preparing", "ready", "picked_up"];
const LOCAL_STEPS  = ["pending", "preparing", "out_for_delivery", "delivered"];
const NATIONAL_STEPS = ["pending", "preparing", "out_for_delivery", "delivered"];

const STEP_LABELS: Record<string, Record<string, string>> = {
  pickup: {
    pending:    "Pedido realizado",
    preparing:  "Em preparação",
    ready:      "Pronto para retirar",
    picked_up:  "Retirado ✓",
  },
  local_delivery: {
    pending:          "Pedido realizado",
    preparing:        "Em preparação",
    out_for_delivery: "Saiu para entrega",
    delivered:        "Entregue ✓",
  },
  national_shipping: {
    pending:          "Pedido realizado",
    preparing:        "Preparando envio",
    out_for_delivery: "Despachado",
    delivered:        "Entregue ✓",
  },
};

const STATUS_COLOR: Record<string, string> = {
  pending:          "text-amber-600   bg-amber-50   border-amber-200   dark:bg-amber-900/20  dark:text-amber-300",
  preparing:        "text-blue-600    bg-blue-50    border-blue-200    dark:bg-blue-900/20   dark:text-blue-300",
  ready:            "text-emerald-600 bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300",
  out_for_delivery: "text-purple-600  bg-purple-50  border-purple-200  dark:bg-purple-900/20 dark:text-purple-300",
  delivered:        "text-emerald-600 bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300",
  picked_up:        "text-emerald-600 bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300",
  cancelled:        "text-red-600     bg-red-50     border-red-200     dark:bg-red-900/20    dark:text-red-300",
};

const STATUS_LABEL: Record<string, string> = {
  pending:          "Aguardando confirmação",
  preparing:        "Em preparação",
  ready:            "Pronto para retirar",
  out_for_delivery: "Saiu para entrega",
  delivered:        "Entregue",
  picked_up:        "Retirado",
  cancelled:        "Cancelado",
};

// ─── Carrier tracking links ───────────────────────────────────────────────────

function carrierTrackingUrl(company: string, code: string): string {
  const c = (company ?? "").toLowerCase();
  if (c.includes("correio")) return `https://rastreamento.correios.com.br/app/trackobject?codigo=${code}`;
  if (c.includes("jadlog"))  return `https://www.jadlog.com.br/rastreio?codigo=${code}`;
  if (c.includes("azul"))    return `https://www.azulcargo.com.br/rastreamento?codigo=${code}`;
  if (c.includes("loggi"))   return `https://www.loggi.com/rastreador/?tracking=${code}`;
  // Generic fallback
  return `https://rastreio.io/${code}`;
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

function Timeline({ 
  deliveryType, 
  status,
  paymentStatus
}: { 
  deliveryType: string; 
  status: string;
  paymentStatus?: string;
}) {
  const key = deliveryType === "pickup" ? "pickup"
    : deliveryType === "national_shipping" ? "national_shipping"
    : "local_delivery";

  const steps = key === "pickup" ? PICKUP_STEPS 
    : key === "national_shipping" ? NATIONAL_STEPS 
    : LOCAL_STEPS;
    
  const labels = STEP_LABELS[key];

  // Determine current index
  const cancelled = status === "cancelled";
  const currentIdx = cancelled ? -1 : steps.indexOf(status);

  // Helper to get helper text for the active step
  const getActiveStepSubtext = (step: string) => {
    if (step === "pending") {
      if (paymentStatus === "paid") {
        return "Pedido pago e confirmado";
      }
      return "Aguardando confirmação de pagamento";
    }
    
    if (step === "preparing") {
      if (key === "national_shipping") {
        return "Preparando a embalagem e etiqueta de envio";
      }
      return "Preparando o seu pedido";
    }
    
    if (step === "ready") {
      return "Seu pedido está pronto para ser retirado na loja!";
    }
    
    if (step === "out_for_delivery") {
      if (key === "national_shipping") {
        return "Despachado na transportadora / Correios";
      }
      return "O entregador já saiu com seu pedido";
    }
    
    if (step === "delivered") {
      return "Entregue com sucesso!";
    }
    
    if (step === "picked_up") {
      return "Pedido retirado";
    }
    
    return "Agora";
  };

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-[19px] top-5 bottom-5 w-0.5 bg-border" />
      <ol className="space-y-5 relative">
        {steps.map((step, i) => {
          const done   = !cancelled && i < currentIdx;
          const active = !cancelled && i === currentIdx;
          const future = cancelled || i > currentIdx;
          return (
            <li key={step} className="flex items-start gap-4">
              {/* Dot */}
              <div className={`relative z-10 h-10 w-10 rounded-full border-2 grid place-items-center shrink-0 transition-colors ${
                done   ? "bg-primary border-primary text-primary-foreground" :
                active ? "bg-primary/10 border-primary text-primary" :
                         "bg-background border-border text-muted-foreground"
              }`}>
                {done ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : active ? (
                  <div className="h-2.5 w-2.5 rounded-full bg-primary animate-pulse" />
                ) : (
                  <div className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30" />
                )}
              </div>
              {/* Label */}
              <div className="pt-2">
                <p className={`text-sm font-medium leading-none ${future ? "text-muted-foreground" : "text-foreground"}`}>
                  {labels[step]}
                </p>
                {active && (
                  <p className="text-xs text-primary font-medium mt-1">
                    {getActiveStepSubtext(step)}
                  </p>
                )}
              </div>
            </li>
          );
        })}

        {cancelled && (
          <li className="flex items-start gap-4">
            <div className="relative z-10 h-10 w-10 rounded-full border-2 grid place-items-center shrink-0 bg-red-50 border-red-300 dark:bg-red-900/20">
              <XCircle className="h-5 w-5 text-red-500" />
            </div>
            <div className="pt-2">
              <p className="text-sm font-medium text-red-600 dark:text-red-400">Pedido cancelado</p>
            </div>
          </li>
        )}
      </ol>
    </div>
  );
}

// ─── Tracking card (national shipping) ────────────────────────────────────────

function TrackingCard({ order }: { order: any }) {
  if (order.delivery_type !== "national_shipping" && !order.tracking_code) return null;

  const hasCode = !!order.tracking_code;
  const carrier = order.shipping_company || order.shipping_service_name || "Transportadora";
  const eta = order.shipping_delivery_time_days
    ? addDays(new Date(order.created_at), order.shipping_delivery_time_days)
    : null;

  const copyCode = async () => {
    if (!order.tracking_code) return;
    try {
      await navigator.clipboard.writeText(order.tracking_code);
      toast.success("Código copiado!");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Truck className="h-5 w-5 text-primary shrink-0" />
        <div>
          <p className="font-medium text-sm">{carrier}</p>
          {order.shipping_service_name && order.shipping_service_name !== carrier && (
            <p className="text-xs text-muted-foreground">{order.shipping_service_name}</p>
          )}
        </div>
      </div>

      {hasCode ? (
        <>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
            <code className="flex-1 text-sm font-mono break-all select-all">{order.tracking_code}</code>
            <button onClick={copyCode} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
              <Copy className="h-4 w-4" />
            </button>
          </div>
          <a
            href={carrierTrackingUrl(carrier, order.tracking_code)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline font-medium"
          >
            <ExternalLink className="h-4 w-4" /> Rastrear na {carrier}
          </a>
        </>
      ) : (
        <div className="bg-primary/5 p-3 rounded-lg border border-primary/10">
          <p className="text-sm text-muted-foreground">
            O código de rastreamento será disponibilizado <strong>nesta página</strong> pela loja assim que o pedido for despachado na transportadora. Acompanhe por aqui!
          </p>
        </div>
      )}

      {eta && (
        <p className="text-xs text-muted-foreground">
          Prazo estimado: <span className="font-medium text-foreground">{format(eta, "d 'de' MMMM", { locale: ptBR })}</span>
          {" "}({order.shipping_delivery_time_days} dias úteis)
        </p>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PublicOrderTracking() {
  const { store, settings } = useTenant();
  const { orderId } = useParams<{ orderId: string }>();
  const { isAuthenticated, customer, linkOrder } = useCustomerAuth();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [justLinked, setJustLinked] = useState(false);
  const queryClient = useQueryClient();
  const prevStatus = useRef<string | null>(null);

  const POLL_MS = 8_000; // every 8 seconds

  const { data: order, isLoading } = useQuery({
    queryKey: ["public-order", orderId],
    queryFn: async () => {
      if (!orderId) return null;
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .eq("id", orderId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!orderId,
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      if (!s || s === "delivered" || s === "picked_up" || s === "cancelled") return false;
      return POLL_MS;
    },
  });

  // Toast when status changes
  useEffect(() => {
    if (!order) return;
    if (prevStatus.current && prevStatus.current !== order.status) {
      const label = STATUS_LABEL[order.status] ?? order.status;
      toast.success(`Pedido atualizado: ${label}`, { duration: 5000 });
    }
    prevStatus.current = order.status;
  }, [order?.status]);

  // Build Pix QR code
  const pixKey = settings?.pix_key;
  const hasPixKey = !!pixKey && !!pixKeyType(pixKey);

  useEffect(() => {
    if (!hasPixKey || !pixKey || !store || order?.payment_status === "paid") return;
    const payload = buildPixPayload(pixKey, settings?.display_name ?? store.name, settings?.address_city ?? "Brasil");
    QRCode.toDataURL(payload, { width: 200, margin: 1 }).then(setQrDataUrl).catch(() => setQrDataUrl(null));
  }, [hasPixKey, pixKey, store, settings, order?.payment_status]);

  const copyPixKey = async () => {
    if (!pixKey) return;
    try {
      await navigator.clipboard.writeText(pixKey);
      toast.success("Chave Pix copiada!");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

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
      <div className="container py-16">
        <EmptyState
          title="Pedido não encontrado"
          action={<Button asChild><Link to={getStoreLink("", store.slug)}>Voltar à loja</Link></Button>}
        />
      </div>
    );
  }

  const items = order.order_items || [];
  const orderNum = order.order_number || order.id.slice(-6).toUpperCase();
  const statusCfg = STATUS_COLOR[order.status] ?? STATUS_COLOR.pending;
  const statusLabel = STATUS_LABEL[order.status] ?? order.status;

  const isNational = order.delivery_type === "national_shipping";
  const isPickup   = order.delivery_type === "pickup";
  const isPaid     = order.payment_status === "paid";
  const isPending  = order.status === "pending";
  const isDone     = ["delivered", "picked_up", "cancelled"].includes(order.status);

  const whatsappMsg = `Olá! Tenho dúvida sobre o pedido *#${orderNum}*.`;

  const estimatedDelivery =
    isNational && order.shipping_delivery_time_days
      ? format(addDays(new Date(order.created_at), order.shipping_delivery_time_days), "d 'de' MMMM", { locale: ptBR })
      : null;

  return (
    <div className="container py-8 md:py-12 max-w-2xl space-y-6">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground mb-1">Acompanhar pedido</p>
          <h1 className="font-serif text-3xl">#{orderNum}</h1>
          <p className="text-xs text-muted-foreground mt-1">
            {format(new Date(order.created_at), "d 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
          </p>
        </div>
        <span className={`inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full border font-medium ${statusCfg}`}>
          {isPending ? <Clock className="h-4 w-4" /> : isDone ? <CheckCircle2 className="h-4 w-4" /> : <Package className="h-4 w-4" />}
          {statusLabel}
        </span>
      </div>

      {/* ── Timeline ────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-medium text-sm text-muted-foreground mb-5 uppercase tracking-wide">Status</h2>
        <Timeline 
          deliveryType={order.delivery_type ?? "local_delivery"} 
          status={order.status} 
          paymentStatus={order.payment_status}
        />
      </div>

      {/* ── Tracking card (national) ─────────────────────────────── */}
      <TrackingCard order={order} />

      {/* ── Auth banner (only when not logged in) ─────────────────── */}
      {!isAuthenticated && !bannerDismissed && (
        <div className={cn(
          "rounded-xl border-2 p-5 flex items-start gap-4 relative overflow-hidden transition-all",
          isNational 
            ? "border-primary/50 bg-primary/5 shadow-md" 
            : "border-primary/30 bg-gradient-to-br from-primary/5 to-background shadow-sm"
        )}>
          {isNational && (
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-2xl -mr-10 -mt-10" />
          )}
          <div className={cn("h-11 w-11 rounded-full grid place-items-center shrink-0", isNational ? "bg-primary/20" : "bg-primary/15")}>
            <UserPlus className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0 relative z-10">
            <p className="font-semibold text-sm">
              {isNational ? "Não perca seu pacote de vista! 📦" : "Salve este pedido na sua conta"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {isNational 
                ? "Para entregas via transportadora, é muito importante criar uma conta gratuita. Assim você terá acesso rápido ao código de rastreio e acompanha cada passo até a sua casa."
                : "Crie uma conta grátis e acompanhe todos os seus pedidos em um lugar. Seus dados já serão preenchidos!"}
            </p>
            {justLinked ? (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Pedido vinculado à sua conta!
              </div>
            ) : (
              <div className="flex gap-2 mt-3">
                <Button size="sm" className="gap-1.5" onClick={() => setAuthOpen(true)}>
                  <UserPlus className="h-3.5 w-3.5" /> Criar conta
                </Button>
                <Button size="sm" variant="outline" onClick={() => setAuthOpen(true)}>Já tenho conta</Button>
              </div>
            )}
          </div>
          <button onClick={() => setBannerDismissed(true)} className="text-muted-foreground hover:text-foreground transition-colors shrink-0" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Pix payment (only when pending + has pix key) ─────────── */}
      {!isPaid && hasPixKey && pixKey && (
        <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-5 space-y-4">
          <h2 className="font-serif text-lg flex items-center gap-2">
            <QrCode className="h-5 w-5 text-primary" /> Pagar via Pix
          </h2>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-3">
            <span className="flex-1 font-mono text-sm break-all select-all">{pixKey}</span>
            <Button size="sm" variant="outline" onClick={copyPixKey} className="shrink-0 gap-1.5">
              <Copy className="h-3.5 w-3.5" /> Copiar
            </Button>
          </div>
          {qrDataUrl && (
            <div className="flex flex-col items-center gap-2">
              <p className="text-xs text-muted-foreground">QR Code</p>
              <img src={qrDataUrl} alt="QR Code Pix" className="rounded-lg border border-border" width={180} height={180} />
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            Pague <strong className="text-foreground">{formatBRL(order.total_cents)}</strong>
            {order.pix_name && <> usando o nome <strong className="text-foreground">{order.pix_name}</strong></>}
          </p>
        </div>
      )}

      {/* ── Order summary ────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Resumo do pedido</h2>
        <div className="space-y-2">
          {items.map((it: any) => (
            <div key={it.id} className="flex gap-3 text-sm">
              <div className="h-9 w-9 rounded-md bg-primary/5 grid place-items-center flex-shrink-0">
                <ShoppingBag className="h-4 w-4 text-primary/40" />
              </div>
              <div className="flex-1">
                <p className="font-medium">{it.product_name ?? "Produto"}</p>
                <p className="text-muted-foreground">{it.quantity}× {formatBRL(it.unit_price_cents)}</p>
              </div>
              <span className="font-medium tabular-nums">{formatBRL(it.unit_price_cents * it.quantity)}</span>
            </div>
          ))}
        </div>
        <Separator />
        <div className="space-y-1 text-sm text-muted-foreground">
          <div className="flex justify-between"><span>Subtotal</span><span>{formatBRL(order.subtotal_cents)}</span></div>
          <div className="flex justify-between">
            <span>Frete{order.shipping_region_name ? ` (${order.shipping_region_name})` : ""}</span>
            <span>{order.shipping_fee_cents > 0 ? formatBRL(order.shipping_fee_cents) : "Grátis"}</span>
          </div>
        </div>
        <Separator />
        <div className="flex justify-between items-baseline">
          <span className="text-muted-foreground">Total</span>
          <span className="font-serif text-2xl text-primary">{formatBRL(order.total_cents)}</span>
        </div>
      </div>

      {/* ── Delivery info ────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3 text-sm">
        <h2 className="font-medium text-muted-foreground uppercase tracking-wide text-sm">Entrega</h2>
        {isPickup ? (
          <div>
            <p className="font-medium">Retirada na loja</p>
            {settings?.address && <p className="text-muted-foreground mt-0.5">{settings.address}</p>}
          </div>
        ) : (
          <div>
            <p className="font-medium">
              {isNational ? (order.shipping_service_name || "Envio nacional") : "Entrega local"}
            </p>
            {(order.address_street || order.address_neighborhood) && (
              <p className="text-muted-foreground mt-0.5">
                {[
                  [order.address_street, order.address_number].filter(Boolean).join(", "),
                  order.address_neighborhood,
                  order.address_complement,
                  order.address_city,
                ].filter(Boolean).join(" — ")}
              </p>
            )}
            {estimatedDelivery && (
              <p className="text-muted-foreground mt-1">
                Prazo estimado: <span className="font-medium text-foreground">{estimatedDelivery}</span>
              </p>
            )}
          </div>
        )}
        <div className="pt-1">
          <p className="text-muted-foreground">Cliente</p>
          <p className="font-medium">{order.customer_name}</p>
          {order.customer_phone && <p className="text-muted-foreground">{order.customer_phone}</p>}
        </div>
      </div>

      {/* ── Action buttons ───────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3">
        {settings?.whatsapp && (
          <WhatsAppButton phone={settings.whatsapp} message={whatsappMsg} label="Falar com a loja" className="flex-1 h-11" />
        )}
        {isAuthenticated ? (
          <Button asChild variant="outline" className="flex-1">
            <Link to={getStoreLink("minha-conta", store.slug)}>Meus pedidos</Link>
          </Button>
        ) : (
          <Button asChild variant="outline" className="flex-1">
            <Link to={getStoreLink("", store.slug)}>Voltar à loja</Link>
          </Button>
        )}
      </div>



      {/* Welcome card when already logged in */}
      {isAuthenticated && customer && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-800 p-4 flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <div className="flex-1 text-sm">
            <p className="font-medium text-emerald-800 dark:text-emerald-300">
              Olá, {customer.full_name?.split(" ")[0] || customer.email}!
            </p>
            <p className="text-emerald-700 dark:text-emerald-400 text-xs mt-0.5">
              Este pedido aparece em <strong>Minha Conta</strong>.
            </p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link to={getStoreLink("minha-conta", store.slug)}>Minha Conta</Link>
          </Button>
        </div>
      )}

      <CustomerAuthModal
        open={authOpen}
        onOpenChange={setAuthOpen}
        storeId={store.id}
        defaultEmail={order.customer_email ?? ""}
        defaultName={order.customer_name ?? ""}
        defaultTab="register"
        onSuccess={async () => {
          setAuthOpen(false);
          if (orderId) {
            await linkOrder(orderId);
            setJustLinked(true);
          }
        }}
      />
    </div>
  );
}
