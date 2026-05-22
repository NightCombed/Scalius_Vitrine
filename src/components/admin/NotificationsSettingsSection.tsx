import { useEffect, useState } from "react";
import { Bell, BellOff, ExternalLink, Loader2, RefreshCw, Send, Webhook, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFormContext } from "react-hook-form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// ─── Types ────────────────────────────────────────────────────────────────────



// ─── Toggle Row ───────────────────────────────────────────────────────────────

function ToggleRow({
  id, label, description, checked, onCheckedChange, disabled = false,
}: {
  id: string; label: string; description?: string;
  checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="space-y-0.5 flex-1 min-w-0">
        <Label htmlFor={id} className="font-medium cursor-pointer">{label}</Label>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  );
}

// ─── Log status badge ─────────────────────────────────────────────────────────

const LOG_STATUS: Record<string, string> = {
  sent:    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  failed:  "bg-red-100    text-red-700    dark:bg-red-900/30    dark:text-red-300",
  pending: "bg-amber-100  text-amber-700  dark:bg-amber-900/30  dark:text-amber-300",
};

const EVENT_LABELS: Record<string, string> = {
  new_order:          "Novo pedido",
  payment_confirmed:  "Pagamento confirmado",
  order_ready:        "Pedido pronto",
  order_delivered:    "Pedido entregue",
  status_change:      "Mudança de status",
};

const CHANNEL_LABELS: Record<string, string> = {
  email:   "Email",
  push:    "Push",
  webhook: "Webhook",
};

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  storeId: string;
}

export function NotificationsSettingsSection({ storeId }: Props) {
  const queryClient = useQueryClient();
  const form = useFormContext();
  const prefs = form.watch();
  
  const [testingWebhook, setTestingWebhook] = useState(false);

  const set = (key: string, val: any) =>
    form.setValue(key, val, { shouldDirty: true, shouldValidate: true });

  // ── Notification logs ──────────────────────────────────────────────────────

  const { data: logs = [], isLoading: logsLoading, refetch: refetchLogs } = useQuery({
    queryKey: ["notification-logs", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_logs")
        .select("*")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30_000,
  });


  // ── Test Webhook ───────────────────────────────────────────────────────────

  const handleTestWebhook = async () => {
    if (!prefs.notif_webhook_url) {
      toast.error("Informe a URL do Webhook primeiro.");
      return;
    }
    setTestingWebhook(true);
    try {
      const res = await fetch(prefs.notif_webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "test",
          store_id: storeId,
          timestamp: new Date().toISOString(),
          message: "Teste de Webhook da sua loja 🎉",
        }),
      });
      if (res.ok) {
        toast.success("Webhook enviado com sucesso!");
      } else {
        toast.error(`Webhook retornou status ${res.status}`);
      }
    } catch {
      toast.error("Não foi possível alcançar a URL informada.");
    } finally {
      setTestingWebhook(false);
    }
  };

  // ── Push notification helper ───────────────────────────────────────────────

  const requestPushPermission = async () => {
    if (!("Notification" in window)) {
      toast.error("Seu navegador não suporta notificações push.");
      return;
    }
    const result = await Notification.requestPermission();
    if (result === "granted") {
      toast.success("Notificações push ativadas! 🔔");
      new Notification("Notificações ativas!", {
        body: "Você vai receber avisos de novos pedidos por aqui.",
        icon: "/favicon.ico",
      });
    } else {
      toast.error("Permissão negada pelo navegador.");
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Remetente ─────────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-card p-6 space-y-5 shadow-soft">
        <div>
          <h2 className="font-serif text-xl">Notificações</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Configure como você e seus clientes são avisados dos eventos da loja.
          </p>
        </div>



        {/* ── Notificações para a LOJA ──────────────────────────────────────── */}
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Bell className="h-4 w-4" /> Para você (loja)
          </h3>

          <div className="rounded-lg border border-border bg-background p-4 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="notification-email" className="font-semibold text-sm">E-mail para receber avisos</Label>
              <Input
                id="notification-email"
                placeholder="pedidos@sualoja.com.br"
                value={prefs.notification_email}
                onChange={(e) => set("notification_email", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Onde você receberá e-mails sobre vendas e cancelamentos.</p>
            </div>
            <Separator />
            <div className="divide-y divide-border">
              <ToggleRow
                id="store-new-order"
                label="Novo pedido recebido"
                checked={prefs.store_new_order}
                onCheckedChange={(v) => set("store_new_order", v)}
              />
              <ToggleRow
                id="store-payment-confirmed"
                label="Pagamento confirmado"
                checked={prefs.store_payment_confirmed}
                onCheckedChange={(v) => set("store_payment_confirmed", v)}
              />
              <ToggleRow
                id="store-order-cancelled"
                label="Pedido cancelado"
                checked={prefs.store_order_cancelled}
                onCheckedChange={(v) => set("store_order_cancelled", v)}
              />
            </div>
          </div>


          {/* Push */}
          <div className="rounded-lg border border-border bg-background p-4 space-y-1 divide-y divide-border">
            <div className="flex items-center justify-between pb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Push (Navegador)</p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-xs gap-1.5"
                onClick={requestPushPermission}
              >
                <Bell className="h-3.5 w-3.5" /> Ativar permissão
              </Button>
            </div>
            <ToggleRow
              id="notif-push-new-order"
              label="Novo pedido criado"
              description="Alerta instantâneo quando o painel estiver aberto."
              checked={prefs.notif_push_new_order}
              onCheckedChange={(v) => set("notif_push_new_order", v)}
            />
            <ToggleRow
              id="notif-push-payment-confirmed"
              label="Pagamento confirmado"
              description="Alarme quando o dinheiro cair via Mercado Pago."
              checked={prefs.notif_push_payment_confirmed}
              onCheckedChange={(v) => set("notif_push_payment_confirmed", v)}
            />
            <ToggleRow
              id="notif-push-status-change"
              label="Mudança de status"
              checked={prefs.notif_push_status_change}
              onCheckedChange={(v) => set("notif_push_status_change", v)}
            />
            <p className="text-xs text-muted-foreground pt-2">
              ⓘ Funciona apenas enquanto o painel do admin estiver aberto no navegador.
            </p>
          </div>

          {/* Alertas Sonoros */}
          <div className="rounded-lg border border-border bg-background p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="sound-enabled" className="font-semibold text-sm flex items-center gap-2">
                  <Volume2 className="h-4 w-4 text-muted-foreground" /> Alertas sonoros de novos pedidos
                </Label>
                <p className="text-xs text-muted-foreground">Toca um sinal sonoro ao receber um novo pedido.</p>
              </div>
              <Switch
                id="sound-enabled"
                checked={prefs.sound_enabled}
                onCheckedChange={(v) => set("sound_enabled", v)}
              />
            </div>

            {prefs.sound_enabled && (
              <div className="space-y-4 pt-3 border-t border-border animate-in fade-in slide-in-from-top-2">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="sound-volume" className="text-sm font-medium">Volume do som</Label>
                    <Select
                      value={prefs.sound_volume}
                      onValueChange={(v) => set("sound_volume", v)}
                    >
                      <SelectTrigger id="sound-volume" className="w-full">
                        <SelectValue placeholder="Selecione o volume" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="baixo">Baixo</SelectItem>
                        <SelectItem value="normal">Normal</SelectItem>
                        <SelectItem value="alto">Alto</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between gap-4 self-end h-10 border border-transparent">
                    <div className="space-y-0.5">
                      <Label htmlFor="silent-hours-enabled" className="font-medium text-sm">Horário de silêncio</Label>
                      <p className="text-xs text-muted-foreground">Desativa sons durante o período definido.</p>
                    </div>
                    <Switch
                      id="silent-hours-enabled"
                      checked={prefs.silent_hours_enabled}
                      onCheckedChange={(v) => set("silent_hours_enabled", v)}
                    />
                  </div>
                </div>

                {prefs.silent_hours_enabled && (
                  <div className="grid grid-cols-2 gap-4 pt-2 animate-in fade-in slide-in-from-top-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="silent-hours-start" className="text-sm font-medium">Início do silêncio</Label>
                      <Input
                        id="silent-hours-start"
                        type="time"
                        value={prefs.silent_hours_start}
                        onChange={(e) => set("silent_hours_start", e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="silent-hours-end" className="text-sm font-medium">Fim do silêncio</Label>
                      <Input
                        id="silent-hours-end"
                        type="time"
                        value={prefs.silent_hours_end}
                        onChange={(e) => set("silent_hours_end", e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Webhook */}
          <div className="rounded-lg border border-border bg-background p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Webhook className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Webhook (API)</p>
              </div>
              <Switch
                id="notif-webhook-enabled"
                checked={prefs.notif_webhook_enabled}
                onCheckedChange={(v) => set("notif_webhook_enabled", v)}
              />
            </div>
            {prefs.notif_webhook_enabled && (
              <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                <div className="space-y-1.5">
                  <Label htmlFor="notif-webhook-url">URL do Webhook</Label>
                  <Input
                    id="notif-webhook-url"
                    placeholder="https://meuapp.com/api/webhook"
                    value={prefs.notif_webhook_url}
                    onChange={(e) => set("notif_webhook_url", e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={handleTestWebhook}
                    disabled={testingWebhook}
                  >
                    {testingWebhook ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Enviar teste
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Receba um JSON com todos os eventos. Útil para integração com seu próprio sistema ou N8N/Zapier.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Notificações para o CLIENTE ───────────────────────────────────── */}
        <div className="space-y-4 pt-2">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Send className="h-4 w-4" /> Para o cliente (E-mail transacional)
          </h3>

          <div className="rounded-lg border border-border bg-background p-4 divide-y divide-border">
            <div className="pb-3 flex justify-between items-center">
              <p className="text-xs text-muted-foreground">
                Seu cliente recebe e-mails automáticos acompanhando o fluxo do pedido.
              </p>
            </div>
            
            <ToggleRow
              id="customer-new-order"
              label="Pedido recebido"
              description="Confirmação de recebimento (aguardando pagamento). Disponível no Plano Pro."
              checked={prefs.customer_new_order}
              onCheckedChange={(v) => set("customer_new_order", v)}
            />
            <ToggleRow
              id="customer-payment-confirmed"
              label="Pagamento confirmado"
              checked={prefs.customer_payment_confirmed}
              onCheckedChange={(v) => set("customer_payment_confirmed", v)}
            />
            <ToggleRow
              id="customer-order-ready"
              label="Pedido pronto / aguardando retirada"
              checked={prefs.customer_order_ready}
              onCheckedChange={(v) => set("customer_order_ready", v)}
            />
            <ToggleRow
              id="customer-order-dispatched"
              label="Saiu para entrega"
              checked={prefs.customer_order_dispatched}
              onCheckedChange={(v) => set("customer_order_dispatched", v)}
            />
            <ToggleRow
              id="customer-tracking-added"
              label="Código de rastreio adicionado (Correios)"
              checked={prefs.customer_tracking_added}
              onCheckedChange={(v) => set("customer_tracking_added", v)}
            />
            <ToggleRow
              id="customer-order-delivered"
              label="Pedido entregue"
              description="Agradecimento após a entrega. Disponível no Plano Pro."
              checked={prefs.customer_order_delivered}
              onCheckedChange={(v) => set("customer_order_delivered", v)}
            />
            <ToggleRow
              id="customer-order-picked-up"
              label="Pedido retirado na loja"
              description="Agradecimento após a retirada. Disponível no Plano Pro."
              checked={prefs.customer_order_picked_up}
              onCheckedChange={(v) => set("customer_order_picked_up", v)}
            />
            <ToggleRow
              id="customer-order-cancelled"
              label="Pedido cancelado"
              checked={prefs.customer_order_cancelled}
              onCheckedChange={(v) => set("customer_order_cancelled", v)}
            />
          </div>
        </div>



      </section>

      {/* ── Notification Logs ─────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-card p-6 space-y-4 shadow-soft">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-serif text-xl">Histórico de Webhooks (API)</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Últimos 20 eventos enviados para sua URL de integração.</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={() => refetchLogs()}
          >
            <RefreshCw className="h-4 w-4" /> Atualizar
          </Button>
        </div>

        {logsLoading ? (
          <div className="py-8 grid place-items-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : logs.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground text-sm">
            Nenhuma notificação enviada ainda.
          </div>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="text-left text-xs text-muted-foreground uppercase tracking-wide border-b border-border">
                  <th className="px-2 pb-2 font-medium">Evento</th>
                  <th className="px-2 pb-2 font-medium">Canal</th>
                  <th className="px-2 pb-2 font-medium">Destinatário</th>
                  <th className="px-2 pb-2 font-medium">Status</th>
                  <th className="px-2 pb-2 font-medium text-right">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.map((log: any) => (
                  <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-2 py-2.5 font-medium">
                      {EVENT_LABELS[log.event_type] ?? log.event_type}
                    </td>
                    <td className="px-2 py-2.5 text-muted-foreground">
                      {CHANNEL_LABELS[log.channel] ?? log.channel}
                    </td>
                    <td className="px-2 py-2.5 text-muted-foreground capitalize">
                      {log.recipient_type === "store" ? "Loja" : "Cliente"}
                    </td>
                    <td className="px-2 py-2.5">
                      <span className={`inline-flex text-xs px-2 py-0.5 rounded-full font-medium ${LOG_STATUS[log.status] ?? ""}`}>
                        {log.status}
                      </span>
                      {log.error_message && (
                        <p className="text-xs text-red-500 mt-0.5 truncate max-w-[200px]" title={log.error_message}>
                          {log.error_message}
                        </p>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-muted-foreground text-right whitespace-nowrap">
                      {format(new Date(log.created_at), "d MMM, HH:mm", { locale: ptBR })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
