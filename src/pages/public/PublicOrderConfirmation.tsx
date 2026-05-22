import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CheckCircle2, Copy, ShoppingBag, Store, QrCode, UserPlus, X } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import QRCode from "qrcode";

import { useTenant } from "@/contexts/TenantContext";
import { formatBRL } from "@/lib/mockData";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { WhatsAppButton } from "@/components/store/WhatsAppButton";
import { EmptyState } from "@/components/store/EmptyState";
import { CustomerAuthModal } from "@/components/store/CustomerAuthModal";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";

function pixKeyType(key: string): "phone" | "email" | "cpf" | "cnpj" | "random" | null {
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
  const encode = (id: string, value: string) => {
    const len = value.length.toString().padStart(2, "0");
    return `${id}${len}${value}`;
  };
  const merchantAccountInfo = encode("00", "BR.GOV.BCB.PIX") + encode("01", key.trim());
  const payload =
    encode("00", "01") +
    encode("26", merchantAccountInfo) +
    encode("52", "0000") +
    encode("53", "986") +
    encode("59", merchantName.slice(0, 25)) +
    encode("60", city.slice(0, 15)) +
    encode("62", encode("05", "***"));

  const data = payload + "6304";
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
    }
    crc &= 0xffff;
  }
  return payload + "6304" + crc.toString(16).toUpperCase().padStart(4, "0");
}

export default function PublicOrderConfirmation() {
  const { store, settings } = useTenant();
  const { orderId } = useParams<{ orderId: string }>();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const { isAuthenticated, linkOrder } = useCustomerAuth();

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
  });

  const pixKey = settings?.pix_key;
  const requiresProof = settings?.requires_payment_proof ?? false;
  const hasPixKey = !!pixKey && !!pixKeyType(pixKey);

  useEffect(() => {
    if (!hasPixKey || !pixKey || !store) return;
    const payload = buildPixPayload(
      pixKey,
      settings?.display_name ?? store.name,
      settings?.address_city ?? "Brasil"
    );
    QRCode.toDataURL(payload, { width: 200, margin: 1 })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, [hasPixKey, pixKey, store, settings]);

  const copyPixKey = async () => {
    if (!pixKey) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(pixKey);
      } else {
        const ta = document.createElement("textarea");
        ta.value = pixKey;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      toast.success("Chave Pix copiada!");
    } catch {
      toast.error("Não foi possível copiar. Copie manualmente.");
    }
  };

  if (!store) return null;

  if (isLoading) {
    return (
      <div className="container py-16 grid place-items-center min-h-[50vh]">
        <Store className="h-10 w-10 text-primary animate-spin" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="container py-16">
        <EmptyState
          title="Pedido não encontrado"
          action={
            <Button asChild>
              <Link to={`/loja/${store.slug}`}>Voltar à loja</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const items = order.order_items || [];
  const orderNumber = order.order_number || order.id.slice(-6).toUpperCase();

  const buildWhatsAppMsg = () => {
    const lines: string[] = [];
    lines.push(`Olá! Acabei de fazer o pedido *#${orderNumber}* na ${settings?.display_name ?? store.name}.`);
    lines.push("");
    lines.push(`*Cliente:* ${order.customer_name}`);
    lines.push("");
    lines.push("*Itens:*");

    // Fallback safe mapping to prevent any weird parsing issues on Android/iOS WhatsApp
    for (const it of items) {
      const name = it.product_name ? String(it.product_name).trim() : "Produto";
      const priceStr = formatBRL(it.unit_price_cents * it.quantity).replace(/\u00A0/g, " ");
      lines.push(`- ${it.quantity}x ${name} (${priceStr})`);
    }

    lines.push("");
    const totalStr = formatBRL(order.total_cents).replace(/\u00A0/g, " ");
    lines.push(`*Total:* ${totalStr}`);

    if (order.pix_name) {
      lines.push(`*Nome no Pix:* ${order.pix_name}`);
    }

    if (requiresProof) {
      lines.push("");
      lines.push("📎 Vou enviar o comprovante do pagamento em seguida.");
    }
    return lines.join("\n");
  };

  const whatsappMsg = buildWhatsAppMsg();

  return (
    <div className="container py-10 md:py-16 max-w-3xl">
      {/* Header */}
      <div className="text-center space-y-3 mb-8">
        <div className="mx-auto h-16 w-16 grid place-items-center rounded-full bg-primary/10">
          <CheckCircle2 className="h-8 w-8 text-primary" />
        </div>
        <h1 className="font-serif text-3xl md:text-4xl">Pedido recebido!</h1>
        <p className="text-muted-foreground">
          Pedido <span className="font-medium text-foreground">#{orderNumber}</span>
          {pixKey ? " — agora faça o pagamento via Pix 👇" : " — em breve a loja entrará em contato."}
        </p>
      </div>

      {/* Pix Payment Block */}
      {pixKey && (
        <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-6 space-y-5 mb-6">
          <h2 className="font-serif text-xl flex items-center gap-2">
            <QrCode className="h-5 w-5 text-primary" /> Pagar via Pix
          </h2>

          <ol className="space-y-6 text-sm">
            {/* Step 1: Copy/QR */}
            <li className="flex items-start gap-3">
              <span className="shrink-0 h-6 w-6 rounded-full bg-primary text-primary-foreground grid place-items-center text-xs font-bold">1</span>
              <div className="flex-1 space-y-3">
                <p>Copie a chave Pix abaixo (ou escaneie o QR Code)</p>
                <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-3">
                  <span className="flex-1 font-mono text-sm break-all select-all">{pixKey}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={copyPixKey}
                    className="shrink-0 gap-1.5"
                  >
                    <Copy className="h-3.5 w-3.5" /> Copiar
                  </Button>
                </div>
              </div>
            </li>

            {/* Step 2: Notify Store */}
            <li className="flex items-start gap-3">
              <span className="shrink-0 h-6 w-6 rounded-full bg-primary text-primary-foreground grid place-items-center text-xs font-bold">2</span>
              <div className="flex-1">
                <p>Avise a loja que você irá fazer o pagamento clicando no botão abaixo para abrir a conversa</p>
                {settings?.whatsapp && (
                  <WhatsAppButton
                    phone={settings.whatsapp}
                    message={whatsappMsg}
                    label="Abrir conversa no WhatsApp"
                    className="mt-3 w-full sm:w-auto h-11 shadow-sm"
                  />
                )}
              </div>
            </li>

            {/* Step 3: Pay */}
            <li className="flex items-start gap-3">
              <span className="shrink-0 h-6 w-6 rounded-full bg-primary text-primary-foreground grid place-items-center text-xs font-bold">3</span>
              <div className="flex-1 space-y-3">
                <p>
                  Pague <strong>{formatBRL(order.total_cents)}</strong>
                  {order.pix_name && <> usando o nome <strong>{order.pix_name}</strong></>}
                </p>
                {order.pix_name && (
                  <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 p-3 text-sm">
                    <p className="font-medium text-amber-800 dark:text-amber-300">
                      Importante: Use o nome <span className="font-bold">{order.pix_name}</span>
                    </p>
                    <p className="text-amber-700 dark:text-amber-400 text-xs mt-0.5">
                      A loja precisa deste nome para identificar seu pagamento no extrato.
                    </p>
                  </div>
                )}
              </div>
            </li>

            {/* Step 4: Proof */}
            <li className="flex items-start gap-3">
              <span className="shrink-0 h-6 w-6 rounded-full bg-primary text-primary-foreground grid place-items-center text-xs font-bold">4</span>
              <span>
                {requiresProof
                  ? "Envie o comprovante na conversa para confirmar o pedido"
                  : "Pronto! Agora é só aguardar a confirmação da loja"}
              </span>
            </li>
          </ol>

          {qrDataUrl && (
            <div className="flex flex-col items-center gap-2">
              <p className="text-xs text-muted-foreground">QR Code</p>
              <img
                src={qrDataUrl}
                alt="QR Code Pix"
                className="rounded-lg border border-border shadow-sm"
                width={180}
                height={180}
              />
            </div>
          )}

          {requiresProof && (
            <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 p-3 text-sm text-blue-800 dark:text-blue-300">
              📎 Esta loja pede o <strong>comprovante de pagamento</strong>. Envie pelo WhatsApp após pagar.
            </div>
          )}

          {requiresProof && (
            <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 p-3 text-sm text-blue-800 dark:text-blue-300">
              📎 Esta loja pede o <strong>comprovante de pagamento</strong>. Envie pelo WhatsApp após pagar.
            </div>
          )}
        </div>
      )}

      {/* Order Summary */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-5 shadow-soft">
        <div>
          <h2 className="font-serif text-xl mb-3">Resumo do pedido</h2>
          <div className="space-y-2">
            {items.map((it: any) => (
              <div key={it.id} className="flex gap-3 text-sm">
                <div className="h-10 w-10 rounded-md bg-primary/5 grid place-items-center flex-shrink-0">
                  <ShoppingBag className="h-4 w-4 text-primary/40" />
                </div>
                <div className="flex-1">
                  <p className="font-medium">{it.product_name ?? "Produto"}</p>
                  <p className="text-muted-foreground">
                    {it.quantity}× {formatBRL(it.unit_price_cents)}
                  </p>
                </div>
                <span className="font-medium tabular-nums">
                  {formatBRL(it.unit_price_cents * it.quantity)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <Separator />

        <div className="space-y-2 text-sm text-muted-foreground">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{formatBRL(order.subtotal_cents)}</span>
          </div>
          <div className="flex justify-between">
            <span>
              Frete ({order.shipping_region_name || (order.delivery_type === "pickup" ? "Retirada" : "Entrega")})
            </span>
            <span>{order.shipping_fee_cents > 0 ? formatBRL(order.shipping_fee_cents) : "Grátis"}</span>
          </div>
        </div>

        <Separator />

        <div className="flex justify-between items-baseline">
          <span className="text-muted-foreground">Total</span>
          <span className="font-serif text-2xl text-primary">{formatBRL(order.total_cents)}</span>
        </div>

        <Separator />

        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground mb-1">Cliente</p>
            <p className="font-medium">{order.customer_name}</p>
            {order.customer_phone && <p className="text-muted-foreground">{order.customer_phone}</p>}
            {order.pix_name && order.pix_name !== order.customer_name && (
              <p className="text-xs text-muted-foreground mt-1">
                Nome no Pix: <span className="font-medium text-foreground">{order.pix_name}</span>
              </p>
            )}
          </div>
          {order.delivery_type === "delivery" && (order.address_street || order.address_neighborhood) ? (
            <div>
              <p className="text-muted-foreground mb-1">Entrega</p>
              <p className="font-medium">
                {[
                  [order.address_street, order.address_number].filter(Boolean).join(", "),
                  order.address_neighborhood,
                  order.address_complement,
                ]
                  .filter(Boolean)
                  .join(" — ")}
              </p>
            </div>
          ) : order.delivery_type === "pickup" ? (
            <div>
              <p className="text-muted-foreground mb-1">Retirada na loja</p>
              <p className="font-medium">{settings?.address ?? "Endereço da loja"}</p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-8 flex flex-col sm:flex-row gap-3">
        {settings?.whatsapp && (
          <WhatsAppButton
            phone={settings.whatsapp}
            message={whatsappMsg}
            label={pixKey ? (requiresProof ? "Enviar comprovante" : "Avisar que paguei") : "Falar no WhatsApp"}
            className="flex-1 h-11"
          />
        )}
        <Button asChild variant="outline" className="flex-1">
          <Link to={`/loja/${store.slug}`}>Voltar à loja</Link>
        </Button>
      </div>

      {/* ── Post-payment account banner ───────────────────── */}
      {!isAuthenticated && !bannerDismissed && store && (
        <div className="mt-6 rounded-xl border border-primary/30 bg-primary/5 p-4 flex items-start gap-4">
          <div className="h-10 w-10 rounded-full bg-primary/10 grid place-items-center shrink-0">
            <UserPlus className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">Quer acompanhar seus pedidos?</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Crie uma conta grátis e veja todo seu histórico em um lugar só.
            </p>
            <Button
              size="sm"
              className="mt-3 gap-1.5"
              onClick={() => setAuthModalOpen(true)}
            >
              <UserPlus className="h-3.5 w-3.5" /> Criar conta grátis
            </Button>
          </div>
          <button
            onClick={() => setBannerDismissed(true)}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <CustomerAuthModal
        open={authModalOpen}
        onOpenChange={setAuthModalOpen}
        storeId={store.id}
        defaultEmail={order.customer_email ?? ""}
        defaultName={order.customer_name ?? ""}
        defaultTab="register"
        onSuccess={async () => {
          setBannerDismissed(true);
          // Link the order they just created anonymously to their newly created account
          try {
            await linkOrder(orderId!);
          } catch (e) {
            console.error("Error linking order:", e);
          }
        }}
      />
    </div>
  );
}