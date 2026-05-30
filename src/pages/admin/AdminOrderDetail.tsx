import { useState, useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveStore } from "@/hooks/useActiveStore";
import { formatBRL, ORDER_STATUS_LABEL, ORDER_STATUS_FLOW } from "@/lib/mockData";
import type { Order } from "@/types/database";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Phone, MapPin, Copy, MessageCircle, Truck, Store as StoreIcon, Package, Check, ExternalLink, ShoppingCart, Loader2, Bell, X, CheckCircle2, Clock, PartyPopper, Car } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

const STATUS_BADGE: Record<string, string> = {
  pending:          "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  preparing:        "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  ready:            "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
  out_for_delivery: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  delivered:        "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  picked_up:        "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  cancelled:        "bg-muted text-muted-foreground",
  // Fallbacks para orders antigas
  confirmed:        "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  canceled:         "bg-muted text-muted-foreground",
};

export default function AdminOrderDetail() {
  const store = useActiveStore();
  const { orderId = "" } = useParams<{ orderId: string }>();
  const queryClient = useQueryClient();
  const [trackingCode, setTrackingCode] = useState("");
  const [invoiceKey, setInvoiceKey]     = useState("");
  const [invoiceMode, setInvoiceMode]   = useState<"dce" | "nfe">("dce");

  const { data: order, isLoading } = useQuery({
    queryKey: ["admin-order", store?.id, orderId],
    queryFn: async () => {
      if (!orderId || !store) return null;
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(*)")
        .eq("id", orderId)
        .eq("store_id", store.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!orderId && !!store?.id,
  });

  const { data: settings } = useQuery({
    queryKey: ["admin-settings", store?.id],
    queryFn: async () => {
      if (!store?.id) return null;
      const { data, error } = await supabase
        .from("store_settings")
        .select("*")
        .eq("store_id", store.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!store?.id,
  });

  // Sync tracking code state
  useEffect(() => {
    if (order && (order as any).tracking_code) {
      setTrackingCode((order as any).tracking_code);
    }
    // Sync invoice_key state
    const savedKey = (order as any)?.invoice_key ?? "";
    setInvoiceKey(savedKey);
    setInvoiceMode(savedKey ? "nfe" : "dce");
  }, [order]);

  const updateStatus = useMutation({
    mutationFn: async (status: Order["status"]) => {
      const { error } = await supabase
        .from("orders")
        .update({ status })
        .eq("id", orderId);
      if (error) throw error;

      // Disparar notificação se aplicável
      const notifyEvents: Record<string, string> = {
        "ready": "order_ready",
        "out_for_delivery": "order_dispatched",
        "delivered": "order_delivered",
        "picked_up": "order_picked_up",
        "cancelled": "order_cancelled",
      };
      
      const event = notifyEvents[status];
      if (event) {
        supabase.functions.invoke("send-notification", {
          body: { event, order_id: orderId },
        }).catch(err => console.error("Notification trigger error:", err));
      }

      return status;
    },
    onSuccess: (status) => {
      queryClient.invalidateQueries({ queryKey: ["admin-order", store?.id, orderId] });
      queryClient.invalidateQueries({ queryKey: ["admin-orders", store?.id] });
      toast.success(`Status atualizado: ${ORDER_STATUS_LABEL[status as keyof typeof ORDER_STATUS_LABEL]}`);
    },
    onError: () => toast.error("Erro ao atualizar status"),
  });

  const confirmPayment = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("orders")
        .update({ payment_status: "paid" })
        .eq("id", orderId);
      if (error) throw error;

      // Disparar notificação
      supabase.functions.invoke("send-notification", {
        body: { event: "payment_confirmed", order_id: orderId },
      }).catch(err => console.error("Notification trigger error:", err));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-order", store?.id, orderId] });
      toast.success("Pagamento confirmado!");
    },
    onError: () => toast.error("Erro ao confirmar pagamento"),
  });

  const saveTrackingCode = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("orders")
        .update({ tracking_code: trackingCode })
        .eq("id", orderId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-order", store?.id, orderId] });
      toast.success("Código de rastreio salvo!");
      
      // Notificar cliente
      supabase.functions.invoke("send-notification", {
        body: { event: "tracking_added", order_id: orderId },
      }).catch(err => console.error("Notification trigger error:", err));
    },
    onError: () => toast.error("Erro ao salvar código de rastreio"),
  });

  const saveInvoiceKey = useMutation({
    mutationFn: async (key: string | null) => {
      const { error } = await supabase
        .from("orders")
        .update({ invoice_key: key })
        .eq("id", orderId);
      if (error) throw error;
      return key;
    },
    onSuccess: (key) => {
      queryClient.invalidateQueries({ queryKey: ["admin-order", store?.id, orderId] });
      toast.success(key ? "Chave NF-e salva! Etiqueta usará Nota Fiscal." : "Modo DC-e ativado. Melhor Envio gera a declaração automaticamente.");
    },
    onError: () => toast.error("Erro ao salvar chave NF-e"),
  });

  const sendToMelhorEnvioCart = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("calculate-shipping", {
        body: {
          action: "create-label",
          store_id: store?.id,
          order_id: orderId,
        },
      });
      if (error) {
        if (error.context?.json) {
          const body = await error.context.json();
          if (body.error) throw new Error(body.error);
        }
        throw error;
      }
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-order", store?.id, orderId] });
      // Log full payload for debugging — open DevTools Console to inspect
      console.group("✅ Melhor Envio — create-label debug");
      console.log("PAYLOAD ENVIADO:", data?.debug_payload);
      console.log("RESPOSTA DA API:", data?.debug_response);
      console.log("from.document:", data?.debug_payload?.from?.document);
      console.log("from.company_document:", data?.debug_payload?.from?.company_document);
      console.log("to.document:", data?.debug_payload?.to?.document);
      console.log("to.company_document:", data?.debug_payload?.to?.company_document);
      console.log("options.non_commercial:", data?.debug_payload?.options?.non_commercial);
      console.groupEnd();
      toast.success("Pedido enviado para o carrinho do Melhor Envio!", {
        description: `ID: ${data?.melhorenvio_order_id ?? "?"} — Abra o Console (F12) para ver o payload completo.`,
      });
    },
    onError: (error: any) => {
      console.error("Erro ao enviar para o carrinho:", error);
      toast.error("Erro ao enviar para o Melhor Envio", {
        description: error.message || "Verifique as configurações de remetente no Admin.",
      });
    },
  });

  if (!store) return null;

  if (isLoading) {
    return (
      <div className="max-w-3xl">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin/pedidos"><ArrowLeft className="h-4 w-4" /> Voltar</Link>
        </Button>
        <div className="rounded-xl border border-border p-12 text-center text-muted-foreground mt-6">
          Carregando pedido...
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="max-w-3xl">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin/pedidos"><ArrowLeft className="h-4 w-4" /> Voltar</Link>
        </Button>
        <div className="rounded-xl border border-border p-12 text-center text-muted-foreground mt-6">
          Pedido não encontrado.
        </div>
      </div>
    );
  }

  const items = order.order_items || [];
  const note = order.notes;
  const address = order.delivery_type === "pickup"
    ? "Retirada na loja"
    : [
      [order.address_street, order.address_number].filter(Boolean).join(", "),
      order.address_neighborhood,
      order.address_complement,
      (order as any).national_shipping_cep ? `CEP: ${(order as any).national_shipping_cep}` : null
    ].filter(Boolean).join(" — ") || "Sem endereço cadastrado";

  const isNationalShipping = !!(order as any).shipping_company || !!(order as any).shipping_service_name;

  const setStatus = (s: Order["status"]) => {
    updateStatus.mutate(s);
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback para contextos sem HTTPS (ex: http://localhost em alguns browsers)
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(textarea);
        if (!ok) throw new Error("execCommand falhou");
      }
      toast.success(`${label} copiado`);
    } catch (err) {
      console.error("[copyToClipboard] erro:", err);
      toast.error(`Erro ao copiar ${label.toLowerCase()}`);
    }
  };

  const whatsappHref = order.customer_phone
    ? `https://wa.me/${order.customer_phone.replace(/\D/g, "")}`
    : null;

  // Determine the primary action label/handler for sticky mobile bar
  const isOrderActive = order.status !== "delivered" && order.status !== "picked_up" && order.status !== "cancelled" && order.status !== "canceled";
  const primaryActionLabel = (() => {
    if (order.payment_status !== "paid") return <><Check className="h-4 w-4 mr-2" /> Confirmar pagamento</>;
    if (order.status === "pending") return <><Check className="h-4 w-4 mr-2" /> Iniciar preparação</>;
    if (order.status === "preparing" || order.status === "confirmed") return <><Check className="h-4 w-4 mr-2" /> Marcar como pronto</>;
    if (order.status === "ready") {
      if (order.delivery_type === "pickup") return <><Check className="h-4 w-4 mr-2" /> Cliente retirou</>;
      if (order.delivery_type === "national_shipping") return <><Package className="h-4 w-4 mr-2" /> Despachado</>;
      return <><Truck className="h-4 w-4 mr-2" /> Saiu para entrega</>;
    }
    if (order.status === "out_for_delivery") return <><Check className="h-4 w-4 mr-2" /> Confirmar entrega</>;
    return null;
  })();
  const primaryActionHandler = () => {
    if (order.payment_status !== "paid") { confirmPayment.mutate(); return; }
    if (order.status === "pending") { setStatus("preparing"); return; }
    if (order.status === "preparing" || order.status === "confirmed") { setStatus("ready"); return; }
    if (order.status === "ready") {
      setStatus(order.delivery_type === "pickup" ? "picked_up" : "out_for_delivery");
      return;
    }
    if (order.status === "out_for_delivery") { setStatus("delivered"); return; }
  };
  const isPrimaryPending = confirmPayment.isPending || updateStatus.isPending;

  return (
    <div className="max-w-5xl space-y-4 md:space-y-6 pb-24 md:pb-0">
      <Button asChild variant="ghost" size="sm" className="-ml-2 min-h-[44px]">
        <Link to="/admin/pedidos"><ArrowLeft className="h-4 w-4 mr-1.5" /> Pedidos</Link>
      </Button>

      {/* Mobile compact header */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-serif text-2xl md:text-3xl">#{order.order_number || order.id.slice(-6).toUpperCase()}</h1>
            <span className={cn("text-xs px-2.5 py-1 rounded-full font-medium", STATUS_BADGE[order.status])}>
              {order.status === "confirmed" ? "Em preparação" : ORDER_STATUS_LABEL[order.status as keyof typeof ORDER_STATUS_LABEL] || "Cancelado"}
            </span>
            <span className={cn(
              "text-xs px-2.5 py-1 rounded-full inline-flex items-center gap-1.5 font-medium",
              order.payment_status === "paid"
                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
                : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
            )}>
              {order.payment_status === "paid" ? (
                <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" /> <span>Pago</span></>
              ) : (
                <><Clock className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" /> <span>Aguardando</span></>
              )}
            </span>
          </div>
          <p className="text-muted-foreground text-xs mt-1">
            {new Date(order.created_at).toLocaleString("pt-BR")}
          </p>
        </div>
        <div className="font-serif text-xl md:text-2xl shrink-0">{formatBRL(order.total_cents)}</div>
      </header>

      {/* Order Flow / Actions */}
      <section className="rounded-xl border border-border bg-card p-5 lg:p-6 space-y-6 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="h-8 w-1.5 rounded-full bg-primary" />
          <h2 className="font-serif text-2xl">Gestão do Pedido</h2>
        </div>
        
        <div className="space-y-4">
          {/* Step 1: Pagamento */}
          <div className={`flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-xl border transition-colors ${
            order.payment_status !== "paid" 
              ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-900/20 dark:border-emerald-800" 
              : "border-border bg-muted/20 opacity-80"
          }`}>
            <div className="flex-1">
               <h3 className="font-medium text-sm flex items-center gap-2">
                 <span className="flex items-center justify-center h-6 w-6 rounded-full bg-muted text-xs font-bold">1</span>
                 Pagamento
               </h3>
               <p className="text-xs text-muted-foreground mt-1 pl-8 font-medium">
                 {order.payment_status === "paid"
                   ? "Pagamento aprovado e processado com sucesso."
                   : settings?.payment_provider !== "manual"
                   ? "Aguardando confirmação automática via gateway de pagamento."
                   : "Confirme se o comprovante ou valor já foi recebido."}
               </p>
            </div>
            <div className="w-full sm:w-[320px]">
              {order.payment_status !== "paid" ? (
                <Button
                  className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex items-center justify-center gap-2 font-medium"
                  onClick={() => confirmPayment.mutate()}
                  disabled={confirmPayment.isPending}
                >
                  {confirmPayment.isPending ? "Confirmando..." : <><Check className="h-4 w-4 shrink-0" /> <span>Confirmar pagamento</span></>}
                </Button>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-center gap-2 text-sm text-emerald-800 dark:text-emerald-300 font-medium py-3 px-4 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                    <Check className="h-4 w-4 shrink-0" /> <span>Pagamento confirmado</span>
                  </div>
                  
                  {settings?.payment_provider === "manual" && whatsappHref && (
                    <Button asChild variant="outline" size="sm" className="w-full bg-[#25D366]/10 text-[#1DA851] hover:bg-[#25D366]/20 border-[#25D366]/30 font-medium flex items-center justify-center gap-2">
                      <a href={`https://wa.me/${order.customer_phone.replace(/\D/g, "")}?text=${encodeURIComponent(
                        `Olá ${order.customer_name?.split(' ')[0] || ''}, confirmamos o pagamento do seu pedido #${order.order_number || order.id.slice(-6).toUpperCase()}. Vamos começar a prepará-lo em breve!`
                      )}`} target="_blank" rel="noopener noreferrer">
                        <MessageCircle className="h-4 w-4 shrink-0" /> <span>Avisar pagamento aprovado</span>
                      </a>
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Step 2: Status */}
          <div className={`flex flex-col sm:flex-row sm:items-start gap-4 p-4 rounded-xl border transition-colors ${
            (order.status !== "delivered" && order.status !== "picked_up" && order.status !== "cancelled" && order.status !== "canceled")
              ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-900/20 dark:border-emerald-800" 
              : "border-border bg-muted/20"
          }`}>
            <div className="flex-1 pt-1">
               <h3 className="font-medium text-sm flex items-center gap-2">
                 <span className="flex items-center justify-center h-6 w-6 rounded-full bg-muted text-xs font-bold">2</span>
                 Preparo e Entrega
               </h3>
               <p className="text-xs text-muted-foreground mt-1 pl-8">Atualize o status do pedido conforme avança.</p>
            </div>
            <div className="w-full sm:w-[320px]">
              {/* ── pending ── */}
              {order.status === "pending" && (
                <div className="space-y-2">
                  <Button
                    className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-2 font-medium"
                    onClick={() => setStatus("preparing")}
                    disabled={updateStatus.isPending}
                  >
                    <Check className="h-4 w-4 shrink-0" /> <span>Iniciar preparação</span>
                  </Button>
                  <Button
                    size="sm" variant="destructive" className="w-full flex items-center justify-center gap-1.5 font-medium"
                    onClick={() => setStatus("cancelled")}
                    disabled={updateStatus.isPending}
                  >
                    <X className="h-4 w-4 shrink-0" /> <span>Cancelar pedido</span>
                  </Button>
                </div>
              )}

              {/* ── preparing ── */}
              {(order.status === "preparing" || order.status === "confirmed") && (
                <div className="space-y-2">
                  <Button
                    className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-2 font-medium"
                    onClick={() => setStatus("ready")}
                    disabled={updateStatus.isPending}
                  >
                    <Check className="h-4 w-4 shrink-0" /> <span>Marcar como pronto</span>
                  </Button>
                  <div className="flex gap-2">
                    <Button
                      size="sm" variant="outline" className="flex-1 flex items-center justify-center gap-1.5"
                      onClick={() => setStatus("pending")}
                      disabled={updateStatus.isPending}
                    >
                      <ArrowLeft className="h-3.5 w-3.5 shrink-0" /> <span>Pendente</span>
                    </Button>
                    <Button
                      size="sm" variant="destructive" className="flex-1 flex items-center justify-center gap-1.5"
                      onClick={() => setStatus("cancelled")}
                      disabled={updateStatus.isPending}
                    >
                      <X className="h-3.5 w-3.5 shrink-0" /> <span>Cancelar</span>
                    </Button>
                  </div>
                </div>
              )}

              {/* ── ready ── */}
              {order.status === "ready" && (
                <div className="space-y-3">
                  <div className="rounded-lg bg-emerald-100 dark:bg-emerald-900/40 border border-emerald-200 dark:border-emerald-800 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-300 font-medium flex items-center gap-2">
                    <Check className="h-4 w-4 shrink-0" />
                    <span>
                      Pedido pronto!{" "}
                      {order.delivery_type === "pickup"
                        ? "Aguardando retirada."
                        : order.delivery_type === "national_shipping"
                        ? "Pronto para despachar."
                        : "Pronto para sair para entrega."}
                    </span>
                  </div>
                  
                  {whatsappHref && (
                    <Button asChild variant="outline" className="w-full bg-[#25D366]/10 text-[#1DA851] hover:bg-[#25D366]/20 border-[#25D366]/30 flex items-center justify-center gap-2 font-medium">
                      <a href={`https://wa.me/${order.customer_phone.replace(/\D/g, "")}?text=${encodeURIComponent(
                        order.delivery_type === "national_shipping"
                          ? `Olá ${order.customer_name?.split(' ')[0] || ''}, tudo bem? O seu pedido #${order.order_number || order.id.slice(-6).toUpperCase()} já está embalado e pronto para ser despachado na transportadora!`
                          : `Olá ${order.customer_name?.split(' ')[0] || ''}, tudo bem? Seu pedido #${order.order_number || order.id.slice(-6).toUpperCase()} teve uma atualização de status: ${ORDER_STATUS_LABEL[order.status as keyof typeof ORDER_STATUS_LABEL] || order.status}.`
                      )}`} target="_blank" rel="noopener noreferrer">
                        <Bell className="h-4 w-4 shrink-0" /> 
                        <span>{order.delivery_type === "national_shipping" ? "Avisar que está pronto para envio" : "Avisar cliente que está pronto"}</span>
                      </a>
                    </Button>
                  )}

                  <Button
                    className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-2 font-medium"
                    onClick={() =>
                      setStatus(
                        order.delivery_type === "pickup"
                          ? "picked_up"
                          : "out_for_delivery"
                      )
                    }
                    disabled={updateStatus.isPending}
                  >
                    {order.delivery_type === "pickup" ? (
                      <><Check className="h-4 w-4 shrink-0" /> <span>Cliente retirou</span></>
                    ) : order.delivery_type === "national_shipping" ? (
                      <><Package className="h-4 w-4 shrink-0" /> <span>Despachado (Transportadora)</span></>
                    ) : (
                      <><Truck className="h-4 w-4 shrink-0" /> <span>Saiu para entrega</span></>
                    )}
                  </Button>
                  <div className="flex gap-2">
                    <Button
                      size="sm" variant="outline" className="flex-1 flex items-center justify-center gap-1.5"
                      onClick={() => setStatus("preparing")}
                      disabled={updateStatus.isPending}
                    >
                      <ArrowLeft className="h-3.5 w-3.5 shrink-0" /> <span>Preparação</span>
                    </Button>
                    <Button
                      size="sm" variant="destructive" className="flex-1 flex items-center justify-center gap-1.5"
                      onClick={() => setStatus("cancelled")}
                      disabled={updateStatus.isPending}
                    >
                      <X className="h-3.5 w-3.5 shrink-0" /> <span>Cancelar</span>
                    </Button>
                  </div>
                </div>
              )}

              {/* ── out_for_delivery ── */}
              {order.status === "out_for_delivery" && (
                <div className="space-y-3">
                  <div className="rounded-lg bg-blue-50 dark:bg-blue-900/40 border border-blue-200 dark:border-blue-800 px-4 py-3 text-sm text-blue-800 dark:text-blue-300 font-medium flex items-center gap-2">
                    {order.delivery_type === "national_shipping" ? (
                      <Package className="h-4 w-4 shrink-0" />
                    ) : (
                      <Truck className="h-4 w-4 shrink-0" />
                    )}
                    <span>
                      {order.delivery_type === "national_shipping"
                        ? "Pedido despachado na transportadora."
                        : "Pedido saiu para entrega!"}
                    </span>
                  </div>

                  {whatsappHref && (
                    <Button asChild variant="outline" className="w-full bg-[#25D366]/10 text-[#1DA851] hover:bg-[#25D366]/20 border-[#25D366]/30 flex items-center justify-center gap-2 font-medium">
                      <a href={`https://wa.me/${order.customer_phone.replace(/\D/g, "")}?text=${encodeURIComponent(
                        order.delivery_type === "national_shipping"
                          ? `Olá ${order.customer_name?.split(' ')[0] || ''}, ótima notícia! Seu pedido #${order.order_number || order.id.slice(-6).toUpperCase()} acabou de ser despachado na transportadora. Em breve você poderá acompanhar o rastreio!`
                          : `Olá ${order.customer_name?.split(' ')[0] || ''}, tudo bem? Seu pedido #${order.order_number || order.id.slice(-6).toUpperCase()} teve uma atualização de status: ${ORDER_STATUS_LABEL[order.status as keyof typeof ORDER_STATUS_LABEL] || order.status}.`
                      )}`} target="_blank" rel="noopener noreferrer">
                        <Bell className="h-4 w-4 shrink-0" /> 
                        <span>{order.delivery_type === "national_shipping" ? "Avisar que foi despachado" : "Avisar que saiu para entrega"}</span>
                      </a>
                    </Button>
                  )}

                  <Button
                    className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-2 font-medium"
                    onClick={() => setStatus("delivered")}
                    disabled={updateStatus.isPending}
                  >
                    <Check className="h-4 w-4 shrink-0" /> <span>Confirmar entrega</span>
                  </Button>
                  <div className="flex gap-2">
                    <Button
                      size="sm" variant="outline" className="flex-1 flex items-center justify-center gap-1.5"
                      onClick={() => setStatus("ready")}
                      disabled={updateStatus.isPending}
                    >
                      <ArrowLeft className="h-3.5 w-3.5 shrink-0" /> <span>Pronto</span>
                    </Button>
                    <Button
                      size="sm" variant="destructive" className="flex-1 flex items-center justify-center gap-1.5"
                      onClick={() => setStatus("cancelled")}
                      disabled={updateStatus.isPending}
                    >
                      <X className="h-3.5 w-3.5 shrink-0" /> <span>Cancelar</span>
                    </Button>
                  </div>
                </div>
              )}

              {/* ── delivered / picked_up ── */}
              {(order.status === "delivered" || order.status === "picked_up") && (
                <div className="space-y-3">
                  <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-300 font-medium flex items-center justify-center gap-2 text-center">
                    <PartyPopper className="h-4 w-4 shrink-0" />
                    <span>{order.status === "picked_up" ? "Retirado com sucesso!" : "Entregue com sucesso!"}</span>
                  </div>
                  
                  {whatsappHref && (
                    <Button asChild variant="outline" size="sm" className="w-full text-muted-foreground border-border/50 hover:bg-muted/50 flex items-center justify-center gap-2 font-medium">
                      <a href={`https://wa.me/${order.customer_phone.replace(/\D/g, "")}?text=${encodeURIComponent(
                        `Olá ${order.customer_name?.split(' ')[0] || ''}, agradecemos a preferência! Seu pedido #${order.order_number || order.id.slice(-6).toUpperCase()} foi finalizado com sucesso.`
                      )}`} target="_blank" rel="noopener noreferrer">
                        <MessageCircle className="h-4 w-4 shrink-0" /> <span>Enviar agradecimento no WhatsApp</span>
                      </a>
                    </Button>
                  )}
                </div>
              )}

              {/* ── cancelled ── */}
              {(order.status === "cancelled" || order.status === "canceled") && (
                <div className="space-y-2">
                  <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-700 dark:text-red-400 font-medium flex items-center justify-center gap-2 text-center">
                    <X className="h-4 w-4 shrink-0" /> <span>Pedido cancelado</span>
                  </div>
                  <Button
                    size="sm" variant="outline" className="w-full"
                    onClick={() => setStatus("pending")}
                    disabled={updateStatus.isPending}
                  >
                    Reabrir pedido
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* End Order Flow */}
        </div>
      </section>

      {/* Sticky bottom action bar — mobile only */}
      {primaryActionLabel && (
        <div className="fixed bottom-16 left-0 right-0 z-20 px-4 pb-3 pt-2 bg-background/95 backdrop-blur border-t border-border md:hidden">
          <Button
            className="w-full h-12 text-base font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg"
            onClick={primaryActionHandler}
            disabled={isPrimaryPending}
          >
            {isPrimaryPending ? "Aguarde..." : primaryActionLabel}
          </Button>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4 md:gap-6">
        {/* Customer */}
        <section className="rounded-xl border border-border bg-card p-5 space-y-3 lg:col-span-1 shadow-sm">
          <h2 className="font-medium flex items-center gap-2">
            Cliente
          </h2>
          <div className="pt-2 space-y-4">
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Nome</div>
              <div className="font-medium">{order.customer_name ?? "—"}</div>
            </div>
            {/* pix_name */}
            {order.pix_name && (
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Nome no Pix</div>
                <div className="font-medium">{order.pix_name}</div>
              </div>
            )}
            {order.customer_phone && (
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Telefone</div>
                <div className="flex items-center justify-between gap-2 text-sm bg-muted/30 px-3 py-2 rounded-md">
                  <span className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" />{order.customer_phone}</span>
                  <div className="flex gap-1">
                    {whatsappHref && (
                      <Button asChild variant="ghost" size="icon" className="h-7 w-7 text-[#1DA851] hover:bg-[#25D366]/10" title="Abrir WhatsApp">
                        <a href={whatsappHref} target="_blank" rel="noopener noreferrer">
                          <MessageCircle className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => copyToClipboard(order.customer_phone ?? "", "Telefone")}
                      title="Copiar"
                    >
                      <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
            {order.customer_email && (
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">E-mail</div>
                <div className="flex items-center justify-between gap-2 text-sm bg-muted/30 px-3 py-2 rounded-md">
                  <span className="truncate flex items-center gap-2" title={order.customer_email}>
                    <span className="text-muted-foreground text-xs font-semibold">@</span>
                    {order.customer_email}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => copyToClipboard(order.customer_email ?? "", "E-mail")}
                    title="Copiar E-mail"
                  >
                    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Address / Delivery */}
        <section className="rounded-xl border border-border bg-card p-5 space-y-3 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-medium flex items-center gap-2">
              {order.delivery_type === "pickup" ? (
                <><StoreIcon className="h-4 w-4" /> Retirada na loja</>
              ) : order.delivery_type === "national_shipping" ? (
                <><Package className="h-4 w-4" /> Entrega Nacional</>
              ) : (
                <><Truck className="h-4 w-4" /> Entrega</>
              )}
            </h2>
            {order.delivery_type === "delivery" && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => copyToClipboard(address, "Endereço")}
              >
                <Copy className="h-4 w-4" />
              </Button>
            )}
          </div>
          {(order.delivery_type === "delivery" || order.delivery_type === "national_shipping") ? (
            <>
              <p className="text-sm flex items-start gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <span>{address}</span>
              </p>
              {order.shipping_region_name && !isNationalShipping && (
                <div className="text-xs text-muted-foreground">
                  Região: <span className="font-medium text-foreground">{order.shipping_region_name}</span>
                </div>
              )}
              {(order as any).delivery_distance_km != null && !isNationalShipping && (
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3 w-3 text-primary shrink-0" />
                  <span>Distância: <span className="font-medium text-foreground">{Number((order as any).delivery_distance_km).toFixed(1)} km</span></span>
                  {(order as any).delivery_zone_name && (
                    <span> · Zona: <span className="font-medium text-foreground">{(order as any).delivery_zone_name}</span></span>
                  )}
                </div>
              )}
              
              {isNationalShipping ? (
                <div className="pt-2 space-y-3 border-t border-border mt-2">
                  <div className="bg-primary/5 border border-primary/20 rounded-md p-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-primary mb-1">
                      <Package className="h-4 w-4" /> Frete Nacional
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">Transportadora:</span> <span className="font-medium">{(order as any).shipping_company} - {(order as any).shipping_service_name}</span>
                    </div>
                    {(order as any).shipping_delivery_time_days && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">Prazo estimado:</span> <span className="font-medium">{(order as any).shipping_delivery_time_days} dias úteis</span>
                      </div>
                    )}
                  </div>
                  
                  {/* ── Documento Fiscal ──────────────────────────────── */}
                  <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Documento Fiscal</div>
                      {(order as any).invoice_key && (
                        <span className="text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-0.5 rounded-full">NF-e</span>
                      )}
                      {!(order as any).invoice_key && (
                        <span className="text-[10px] font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 px-2 py-0.5 rounded-full">DC-e automática</span>
                      )}
                    </div>

                    {/* Mode toggle */}
                    <div className="flex gap-1 p-0.5 rounded-md bg-muted border border-border text-xs">
                      <button
                        onClick={() => {
                          setInvoiceMode("dce");
                          if ((order as any).invoice_key) {
                            setInvoiceKey("");
                            saveInvoiceKey.mutate(null);
                          }
                        }}
                        className={`flex-1 py-1 rounded text-center font-medium transition-colors ${
                          invoiceMode === "dce"
                            ? "bg-background shadow-sm text-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        DC-e (automática)
                      </button>
                      <button
                        onClick={() => setInvoiceMode("nfe")}
                        className={`flex-1 py-1 rounded text-center font-medium transition-colors ${
                          invoiceMode === "nfe"
                            ? "bg-background shadow-sm text-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        NF-e (nota fiscal)
                      </button>
                    </div>

                    {invoiceMode === "dce" && (
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        O <strong>Melhor Envio emite a DC-e automaticamente</strong> com os dados do pedido.<br/>
                        Indicado para CPF ou CNPJ isento de ICMS (não contribuinte).
                      </p>
                    )}

                    {invoiceMode === "nfe" && (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Informe a chave de acesso da NF-e emitida (44 dígitos).<br/>
                          <span className="text-amber-600 dark:text-amber-500 font-medium">Obrigatório</span> para CNPJ contribuinte de ICMS.
                        </p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={44}
                            placeholder="00000000000000000000000000000000000000000000"
                            value={invoiceKey}
                            onChange={(e) => setInvoiceKey(e.target.value.replace(/\D/g, "").slice(0, 44))}
                            className="flex-1 h-8 text-xs rounded-md border border-input bg-background px-3 font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                          <Button
                            size="sm"
                            className="h-8 text-xs"
                            disabled={invoiceKey.length !== 44 || saveInvoiceKey.isPending || invoiceKey === ((order as any).invoice_key ?? "")}
                            onClick={() => saveInvoiceKey.mutate(invoiceKey)}
                          >
                            {saveInvoiceKey.isPending ? "..." : invoiceKey === ((order as any).invoice_key ?? "") && invoiceKey ? <Check className="h-3.5 w-3.5" /> : "Salvar"}
                          </Button>
                        </div>
                        {invoiceKey.length > 0 && invoiceKey.length < 44 && (
                          <p className="text-[11px] text-destructive">{invoiceKey.length}/44 dígitos — informe a chave completa.</p>
                        )}
                        {invoiceKey.length === 44 && (
                          <p className="text-[11px] text-emerald-600 dark:text-emerald-400">✓ Chave completa — pronta para uso na etiqueta.</p>
                        )}
                      </div>
                    )}
                  </div>

                  {!(order as any).melhorenvio_order_id ? (
                    <Button 
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2 font-medium"
                      onClick={() => sendToMelhorEnvioCart.mutate()}
                      disabled={sendToMelhorEnvioCart.isPending}
                    >
                      {sendToMelhorEnvioCart.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ShoppingCart className="h-4 w-4" />
                      )}
                      Enviar para Melhor Envio (Carrinho)
                    </Button>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2 text-xs text-emerald-600 font-medium bg-emerald-50 p-2 rounded-md border border-emerald-100">
                        <Check className="h-3 w-3" /> Já enviado ao carrinho do Melhor Envio
                      </div>
                      <Button asChild variant="outline" size="sm" className="text-xs h-8">
                        <a href="https://melhorenvio.com.br/carrinho" target="_blank" rel="noreferrer">
                          <ExternalLink className="h-3 w-3 mr-1" /> Ir para o site do Melhor Envio
                        </a>
                      </Button>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Código de Rastreio (Melhor Envio)</label>
                    <div className="flex gap-2">
                      <Input 
                        placeholder="Ex: BR123456789BR" 
                        value={trackingCode}
                        onChange={(e) => setTrackingCode(e.target.value)}
                        className="h-8 text-sm"
                      />
                      <Button 
                        size="sm" 
                        onClick={() => saveTrackingCode.mutate()} 
                        disabled={saveTrackingCode.isPending || trackingCode === (order as any).tracking_code}
                      >
                        {saveTrackingCode.isPending ? "Salvando..." : trackingCode === (order as any).tracking_code && trackingCode ? <Check className="h-4 w-4" /> : "Salvar"}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 pt-1 mt-2 border-t border-border">
                  <a
                    href="https://m.uber.com/go/connect/home"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border hover:bg-accent transition-colors font-medium"
                  >
                    <Car className="h-3.5 w-3.5 text-foreground shrink-0" />
                    <span>Pedir Uber</span>
                  </a>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              O cliente irá retirar o pedido diretamente na loja.
            </p>
          )}
          {note && (
            <div className="rounded-md bg-muted/50 p-3 text-sm">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Observações</div>
              {note}
            </div>
          )}
        </section>
      </div>

      {/* Items */}
      <section className="rounded-xl border border-border bg-card overflow-hidden">
        <header className="p-5 border-b border-border">
          <h2 className="font-medium">Itens do pedido</h2>
        </header>
        <div className="divide-y divide-border">
          {items.map((it: any) => {
            return (
              <div key={it.id} className="p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-medium truncate">{it.product_name ?? "Produto"}</div>
                  {it.variant_label && (
                    <div className="text-xs text-muted-foreground mt-0.5">{it.variant_label}</div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    {it.quantity} × {formatBRL(it.unit_price_cents)}
                  </div>
                </div>
                <div className="font-medium shrink-0">{formatBRL(it.quantity * it.unit_price_cents)}</div>
              </div>
            );
          })}
        </div>
        <div className="p-4 space-y-1.5 border-t border-border bg-muted/30">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums">{formatBRL(order.subtotal_cents)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              Frete{isNationalShipping ? ` · ${(order as any).shipping_company}` : order.shipping_region_name ? ` · ${order.shipping_region_name}` : order.delivery_type === "pickup" ? " · Retirada" : ""}
            </span>
            <span className="tabular-nums">
              {order.delivery_type === "pickup" || order.shipping_fee_cents === 0
                ? "—"
                : formatBRL(order.shipping_fee_cents)}
            </span>
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-border">
            <span className="font-medium">Total</span>
            <span className="font-serif text-xl">{formatBRL(order.total_cents)}</span>
          </div>
        </div>
      </section>
    </div>
  );
}