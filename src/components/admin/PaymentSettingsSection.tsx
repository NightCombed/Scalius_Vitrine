import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  ExternalLink,
  Unplug,
  Zap,
  Banknote,
  Activity,
  RefreshCw,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { supabase } from "@/integrations/supabase/client";
import type { UseFormReturn } from "react-hook-form";
import type { PaymentProvider, PaymentIntegrationStatus } from "@/types/database";

// ─── Types ──────────────────────────────────────────────────────────────────

interface MpStatus {
  status: PaymentIntegrationStatus;
  mp_user_id: string | null;
  mp_token_expires_at: string | null;
}

interface PaymentSettingsSectionProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<any>;
  storeId: string;
  /** Current provider persisted in DB (to detect uncommitted changes) */
  savedProvider: PaymentProvider | undefined;
}

// ─── MP App config (public values only) ─────────────────────────────────────

const MP_APP_ID = import.meta.env.VITE_MP_APP_ID ?? "";
const APP_URL = window.location.origin;
const MP_REDIRECT_URI = encodeURIComponent(`${APP_URL}/admin/oauth/mercadopago/callback`);

function buildMpOAuthUrl(state: string) {
  return (
    `https://auth.mercadopago.com.br/authorization` +
    `?client_id=${MP_APP_ID}` +
    `&response_type=code` +
    `&redirect_uri=${MP_REDIRECT_URI}` +
    `&state=${state}`
  );
}

// ─── Status badge ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: PaymentIntegrationStatus }) {
  if (status === "connected")
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="h-4 w-4" /> Conectado
      </span>
    );
  if (status === "expired")
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-600 dark:text-amber-400">
        <AlertTriangle className="h-4 w-4" /> Token expirado
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      <XCircle className="h-4 w-4" /> Desconectado
    </span>
  );
}

// ─── Provider selection card ─────────────────────────────────────────────────

interface ProviderCardProps {
  selected: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: string;
  badgeVariant?: "green" | "blue" | "amber";
}

function ProviderCard({
  selected,
  onSelect,
  icon,
  title,
  description,
  badge,
  badgeVariant = "blue",
}: ProviderCardProps) {
  const badgeColor = {
    green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    blue: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
    amber: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  }[badgeVariant];

  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        "relative flex flex-col gap-3 rounded-xl border-2 p-5 text-left transition-all duration-200 w-full",
        selected
          ? "border-primary bg-primary/5 shadow-md"
          : "border-border bg-card hover:border-primary/40 hover:bg-accent/30",
      ].join(" ")}
    >
      {selected && (
        <span className="absolute right-4 top-4 h-3 w-3 rounded-full bg-primary ring-2 ring-primary/30" />
      )}
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${selected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">{title}</span>
            {badge && (
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${badgeColor}`}>
                {badge}
              </span>
            )}
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
    </button>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function PaymentSettingsSection({
  form,
  storeId,
  savedProvider,
}: PaymentSettingsSectionProps) {
  const selectedProvider: PaymentProvider = form.watch("payment_provider") ?? "manual";

  const [mpStatus, setMpStatus] = useState<MpStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // ── Fetch MP connection status ──────────────────────────────────────────
  const fetchMpStatus = useCallback(async () => {
    if (!storeId) return;
    setLoadingStatus(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        `mercadopago-oauth?store_id=${storeId}`,
        {
          method: "GET",
        }
      );
      
      if (!error && data) {
        const parsedData = typeof data === "string" ? JSON.parse(data) : data;
        setMpStatus(parsedData as MpStatus);
      } else if (error) {
        console.error("MP Status Check Error:", error);
      }
    } catch (err) {
      console.error("MP Status Fetch Exception:", err);
    } finally {
      setLoadingStatus(false);
    }
  }, [storeId]);

  useEffect(() => {
    if (selectedProvider === "mercadopago") {
      fetchMpStatus();
    }
  }, [selectedProvider, fetchMpStatus]);

  // ── Start OAuth flow ────────────────────────────────────────────────────
  function startOAuth() {
    if (!MP_APP_ID) {
      toast.error("App ID do Mercado Pago não configurado", {
        description: "Adicione VITE_MP_APP_ID ao seu .env.",
      });
      return;
    }
    // CSRF protection: store state + store_id in sessionStorage
    const state = crypto.randomUUID();
    sessionStorage.setItem("mp_oauth_state", state);
    sessionStorage.setItem("mp_oauth_store_id", storeId);
    window.location.href = buildMpOAuthUrl(state);
  }

  // ── Disconnect ──────────────────────────────────────────────────────────
  async function handleDisconnect() {
    if (!confirm("Desconectar o Mercado Pago? Pedidos futuros voltarão a usar Pix Manual.")) return;
    setDisconnecting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mercadopago-oauth`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({ action: "disconnect", store_id: storeId }),
        }
      );
      if (!res.ok) throw new Error();
      form.setValue("payment_provider", "manual", { shouldDirty: true });
      setMpStatus({ status: "disconnected", mp_user_id: null, mp_token_expires_at: null });
      toast.success("Mercado Pago desconectado", {
        description: "Os tokens foram excluídos com segurança.",
      });
    } catch {
      toast.error("Erro ao desconectar. Tente novamente.");
    } finally {
      setDisconnecting(false);
    }
  }

  // ── Provider change warning ─────────────────────────────────────────────
  function handleProviderChange(next: PaymentProvider) {
    if (savedProvider && next !== savedProvider) {
      toast.info("Método de pagamento alterado", {
        description:
          "Pedidos futuros usarão o novo método. O histórico existente permanece intacto.",
        duration: 5000,
      });
    }
    form.setValue("payment_provider", next, { shouldDirty: true });
  }

  // ── Format expiry date ──────────────────────────────────────────────────
  function formatExpiry(isoDate: string | null) {
    if (!isoDate) return null;
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(isoDate));
  }

  return (
    <section className="rounded-xl border border-border bg-card p-6 space-y-6 shadow-soft">
      <div>
        <h2 className="font-serif text-xl">Pagamentos</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Escolha como seus clientes pagarão os pedidos.
        </p>
      </div>

      {/* ── Provider selector ─────────────────────────────────────────── */}
      <div className="grid sm:grid-cols-2 gap-3">
        <ProviderCard
          selected={selectedProvider === "manual"}
          onSelect={() => handleProviderChange("manual")}
          icon={<Banknote className="h-5 w-5" />}
          title="Pix Manual"
          description="Você informa a chave Pix e o cliente faz a transferência. Confirme o pagamento manualmente no painel."
          badge="Sem taxa"
          badgeVariant="green"
        />
        <ProviderCard
          selected={selectedProvider === "mercadopago"}
          onSelect={() => handleProviderChange("mercadopago")}
          icon={<Zap className="h-5 w-5" />}
          title="Pix Automático"
          description="QR Code gerado automaticamente via Mercado Pago. Confirmação instantânea de pagamento."
          badge="0,99% por Pix"
          badgeVariant="blue"
        />
      </div>

      {/* ── Pix Manual fields ─────────────────────────────────────────── */}
      {selectedProvider === "manual" && (
        <div className="space-y-5 pt-2 border-t border-border animate-in fade-in slide-in-from-top-2">
          <FormField
            control={form.control}
            name="pix_key"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Chave Pix *</FormLabel>
                <FormControl>
                  <Input
                    placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória"
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Exibida para o cliente na tela de confirmação do pedido.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="requires_payment_proof"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
                <div>
                  <FormLabel className="font-medium">
                    Exigir comprovante de pagamento
                  </FormLabel>
                  <FormDescription className="text-xs mt-0.5">
                    Se ativo, o cliente é instruído a enviar o comprovante via WhatsApp.
                  </FormDescription>
                </div>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
      )}

      {/* ── Mercado Pago fields ───────────────────────────────────────── */}
      {selectedProvider === "mercadopago" && (
        <div className="space-y-5 pt-2 border-t border-border animate-in fade-in slide-in-from-top-2">

          {/* Status card */}
          <div
            className={[
              "rounded-xl border p-5 flex flex-col sm:flex-row sm:items-center gap-4",
              mpStatus?.status === "connected"
                ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20"
                : mpStatus?.status === "expired"
                ? "border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20"
                : "border-border bg-muted/30",
            ].join(" ")}
          >
            <div className="flex-1 space-y-1.5">
              {loadingStatus ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <StatusBadge status={mpStatus?.status ?? "disconnected"} />
              )}

              {mpStatus?.status === "connected" && (
                <div className="space-y-0.5">
                  <p className="text-xs text-muted-foreground">
                    ID do vendedor:{" "}
                    <code className="font-mono bg-background/60 px-1.5 py-0.5 rounded text-[11px]">
                      {mpStatus.mp_user_id}
                    </code>
                  </p>
                  {mpStatus.mp_token_expires_at && (
                    <p className="text-xs text-muted-foreground">
                      Próxima renovação automática:{" "}
                      <span className="font-medium text-foreground">
                        {formatExpiry(mpStatus.mp_token_expires_at)}
                      </span>
                    </p>
                  )}
                </div>
              )}

              {mpStatus?.status === "expired" && (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  O token expirou. Reconecte para continuar recebendo pagamentos automáticos.
                </p>
              )}

              {(!mpStatus || mpStatus.status === "disconnected") && !loadingStatus && (
                <p className="text-xs text-muted-foreground">
                  Conecte sua conta Mercado Pago para ativar Pix automático com QR Code dinâmico.
                </p>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-2 min-w-[160px]">
              {mpStatus?.status === "connected" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                  className="text-destructive border-destructive/30 hover:bg-destructive/5"
                >
                  {disconnecting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Unplug className="h-3.5 w-3.5" />
                  )}
                  Desconectar
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  onClick={startOAuth}
                  className="bg-[#009ee3] hover:bg-[#007ec7] text-white gap-2"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {mpStatus?.status === "expired"
                    ? "Reconectar com Mercado Pago"
                    : "Conectar com Mercado Pago"}
                </Button>
              )}
              {mpStatus?.status === "connected" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={startOAuth}
                  className="text-xs text-muted-foreground"
                >
                  Reconectar conta
                </Button>
              )}
            </div>
          </div>

          {/* Info box */}
          <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-sm text-blue-800 dark:text-blue-300 space-y-1.5">
            <p className="font-semibold text-blue-900 dark:text-blue-200">Como funciona</p>
            <ul className="space-y-1 text-xs list-disc pl-4 text-blue-700 dark:text-blue-400">
              <li>Ao finalizar o pedido, o cliente vê um QR Code Pix exclusivo gerado pelo Mercado Pago.</li>
              <li>O pagamento é confirmado <strong>automaticamente</strong> em segundos — sem confirmação manual.</li>
              <li>Taxa de <strong>0,99% por transação</strong>, sem mensalidade.</li>
              <li>Os tokens OAuth são armazenados <strong>criptografados</strong> — nunca expostos ao frontend.</li>
            </ul>
          </div>

          {/* Webhook Logs Monitor */}
          {mpStatus?.status === "connected" && (
            <WebhookLogsPanel storeId={storeId} />
          )}

          {/* Warning if provider is changed but not yet connected */}
          {(!mpStatus || mpStatus.status !== "connected") && (
            <div className="flex items-start gap-3 p-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <p>
                <strong>Atenção:</strong> Salvar com "Pix Automático" sem conectar o Mercado Pago causará erros no checkout. Conecte primeiro.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ─── Webhook Logs Panel ───────────────────────────────────────────────────────

function WebhookLogsPanel({ storeId }: { storeId: string }) {
  const { data: logs, isLoading, refetch, isFetching, isError } = useQuery({
    queryKey: ["webhook-logs", storeId],
    queryFn: async () => {
      // Fetch logs for this store OR logs with no store (test/failed webhooks)
      const { data, error } = await supabase
        .from("webhook_logs")
        .select("id, order_id, external_id, event_type, raw_status, processed, error, created_at, store_id")
        .or(`store_id.eq.${storeId},store_id.is.null`)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
    retry: 1,
    retryDelay: 2000,
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });



  const statusBadge = (log: any) => {
    if (log.raw_status === "already_paid") return <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">já pago</span>;
    if (log.processed && log.raw_status === "approved") return <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">✓ aprovado</span>;
    if (log.raw_status === "rejected" || log.raw_status === "cancelled") return <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600">recusado</span>;
    if (log.raw_status === "pending" || log.raw_status === "in_process") return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700">pendente</span>;
    if (log.error) return <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600">erro</span>;
    return <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{log.raw_status ?? "—"}</span>;
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-muted/50">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Activity className="h-4 w-4 text-primary" />
          Webhooks recebidos
        </div>
        <button
          onClick={() => refetch()}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="Atualizar"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      {isError ? (
        <div className="p-4 text-center text-xs text-muted-foreground">
          Não foi possível carregar os logs. Verifique as permissões.
        </div>
      ) : isLoading ? (

        <div className="p-4 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : logs && logs.length > 0 ? (
        <div className="divide-y divide-border">
          {logs.map((log: any) => (
            <div key={log.id} className="flex items-center justify-between px-4 py-2.5 text-xs">
              <div className="space-y-0.5">
                <div className="font-mono text-muted-foreground">
                  {log.external_id ? `ID: ${log.external_id}` : log.order_id ? `Pedido: ${log.order_id.slice(-8)}` : "—"}
                </div>
                {log.error && <div className="text-red-500">{log.error}</div>}
              </div>
              <div className="flex items-center gap-3">
                {statusBadge(log)}
                <span className="text-muted-foreground">
                  {format(new Date(log.created_at), "HH:mm:ss", { locale: ptBR })}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-4 text-center text-xs text-muted-foreground">
          Nenhum webhook recebido ainda. Os webhooks aparecerão aqui quando o Mercado Pago enviar notificações de pagamento.
        </div>
      )}
    </div>
  );
}
