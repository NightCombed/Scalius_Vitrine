import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ShoppingBag, User, LogOut, ChevronRight, Package,
  Clock, CheckCircle2, Truck, XCircle, RefreshCw, Loader2, Edit2, Save, X
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { useTenant } from "@/contexts/TenantContext";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { getStoredToken } from "@/types/customer";
import { formatBRL } from "@/lib/mockData";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { getStoreLink } from "@/lib/tenant";

// ─── Status helpers ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  pending:          { label: "Pendente",        icon: Clock,         color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  preparing:        { label: "Preparando",      icon: Package,       color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  ready:            { label: "Pronto",          icon: CheckCircle2,  color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  out_for_delivery: { label: "Saiu p/ entrega", icon: Truck,         color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" },
  delivered:        { label: "Entregue",        icon: CheckCircle2,  color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  picked_up:        { label: "Retirado",        icon: CheckCircle2,  color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  cancelled:        { label: "Cancelado",       icon: XCircle,       color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
};

const PAYMENT_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: "Aguard. pagamento", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  paid:    { label: "Pago",              color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  unpaid:  { label: "Não pago",         color: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" },
};

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, icon: Package, color: "bg-muted text-muted-foreground" };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>
      <Icon className="h-3 w-3" /> {cfg.label}
    </span>
  );
}

function PaymentBadge({ status }: { status: string }) {
  const cfg = PAYMENT_CONFIG[status] ?? { label: status, color: "bg-muted text-muted-foreground" };
  return (
    <span className={`inline-flex items-center text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = "orders" | "profile";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "orders",  label: "Meus Pedidos", icon: ShoppingBag },
  { id: "profile", label: "Perfil",       icon: User },
];

const STATUS_FILTERS = [
  { value: "all",             label: "Todos" },
  { value: "pending",         label: "Pendentes" },
  { value: "preparing",       label: "Preparando" },
  { value: "out_for_delivery",label: "Em entrega" },
  { value: "delivered",       label: "Entregues" },
  { value: "cancelled",       label: "Cancelados" },
];

// ─── Orders Tab ───────────────────────────────────────────────────────────────

function OrdersTab({ storeSlug }: { storeSlug: string }) {
  const [statusFilter, setStatusFilter] = useState("all");

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["my-orders", statusFilter],
    queryFn: async () => {
      const token = getStoredToken();
      const { data, error } = await supabase.functions.invoke("customer-auth", {
        body: { action: "my_orders", token, status: statusFilter },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data.orders as any[];
    },
    retry: false,
    staleTime: 30_000,
  });

  return (
    <div className="space-y-4">
      {/* Status filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`shrink-0 text-xs px-3 py-1.5 rounded-full border transition-colors font-medium ${
              statusFilter === f.value
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
        <button
          onClick={() => refetch()}
          className="shrink-0 ml-auto text-muted-foreground hover:text-foreground transition-colors"
          title="Atualizar"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="py-16 grid place-items-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="py-12 text-center text-muted-foreground text-sm">
          Erro ao carregar pedidos.{" "}
          <button onClick={() => refetch()} className="underline text-foreground">Tentar novamente</button>
        </div>
      ) : !data || data.length === 0 ? (
        <div className="py-16 text-center space-y-3">
          <ShoppingBag className="h-12 w-12 text-muted-foreground/30 mx-auto" />
          <p className="font-medium text-muted-foreground">Nenhum pedido encontrado</p>
          <Button asChild size="sm" variant="outline">
            <Link to={getStoreLink("", storeSlug)}>Explorar a loja</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {data.map((order: any) => {
            const orderNum = order.order_number || order.id.slice(-6).toUpperCase();
            const date = format(new Date(order.created_at), "d MMM yyyy", { locale: ptBR });
            const cfg = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending;
            return (
              <div
                key={order.id}
                className="rounded-xl border border-border bg-card p-4 hover:border-primary/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">#{orderNum}</span>
                      <StatusBadge status={order.status} />
                      <PaymentBadge status={order.payment_status} />
                    </div>
                    <p className="text-xs text-muted-foreground">{date}</p>
                    {order.delivery_type && (
                      <p className="text-xs text-muted-foreground capitalize">
                        {order.delivery_type === "pickup" ? "Retirada" : order.shipping_region_name || "Entrega"}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold text-primary">{formatBRL(order.total_cents)}</p>
                  </div>
                </div>
                <Separator className="my-3" />
                <div className="flex justify-end">
                  <Button asChild size="sm" variant="ghost" className="gap-1 h-7 text-xs">
                    <Link to={getStoreLink(`pedido/${order.id}`, storeSlug)}>
                      Ver detalhes <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Profile Tab ──────────────────────────────────────────────────────────────

function ProfileTab({ customer }: { customer: any }) {
  const { logout } = useCustomerAuth();
  const navigate = useNavigate();
  const { store } = useTenant();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(customer.full_name ?? "");
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("customer-auth", {
        body: { action: "update_profile", token: getStoredToken(), full_name: name, phone },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      // Update cached profile
      localStorage.setItem("customer_profile", JSON.stringify({ ...customer, full_name: name, phone }));
      toast.success("Perfil atualizado!");
      setEditing(false);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    toast.success("Até logo!");
    navigate(getStoreLink("", store?.slug || ""));
  };

  const memberSince = customer.created_at
    ? format(new Date(customer.created_at), "MMMM yyyy", { locale: ptBR })
    : "";

  return (
    <div className="space-y-6 max-w-sm">
      {/* Avatar */}
      <div className="flex items-center gap-4">
        <div className="h-16 w-16 rounded-full bg-primary text-primary-foreground grid place-items-center text-2xl font-bold">
          {(customer.full_name || customer.email)[0].toUpperCase()}
        </div>
        <div>
          <p className="font-semibold text-lg">{customer.full_name || "Cliente"}</p>
          <p className="text-sm text-muted-foreground">{customer.email}</p>
          {memberSince && <p className="text-xs text-muted-foreground mt-0.5">Membro desde {memberSince}</p>}
        </div>
      </div>

      <Separator />

      {/* Edit form */}
      {editing ? (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-name">Nome completo</Label>
            <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-phone">Telefone</Label>
            <Input id="edit-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999" type="tel" />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={saving} className="gap-1.5" size="sm">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Salvar
            </Button>
            <Button onClick={() => setEditing(false)} variant="ghost" size="sm" className="gap-1.5">
              <X className="h-3.5 w-3.5" /> Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <div>
            <p className="text-muted-foreground">Email</p>
            <p className="font-medium">{customer.email}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Nome</p>
            <p className="font-medium">{customer.full_name || "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Telefone</p>
            <p className="font-medium">{customer.phone || "—"}</p>
          </div>
          <Button onClick={() => setEditing(true)} variant="outline" size="sm" className="gap-1.5 mt-2">
            <Edit2 className="h-3.5 w-3.5" /> Editar perfil
          </Button>
        </div>
      )}

      <Separator />

      <Button onClick={handleLogout} variant="destructive" size="sm" className="gap-2">
        <LogOut className="h-4 w-4" /> Sair da conta
      </Button>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function PublicMyAccount() {
  const { store } = useTenant();
  const { customer, isAuthenticated, isLoading } = useCustomerAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("orders");

  // Redirect if not authenticated
  if (!isLoading && !isAuthenticated) {
    const returnTo = encodeURIComponent(window.location.pathname);
    navigate(getStoreLink(`conta?returnTo=${returnTo}`, store?.slug || ""), { replace: true });
    return null;
  }

  if (isLoading || !store || !customer) {
    return (
      <div className="container py-16 grid place-items-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container py-8 md:py-12 max-w-3xl">
      {/* Page title */}
      <div className="mb-6">
        <h1 className="font-serif text-2xl md:text-3xl">Minha Conta</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Olá, <span className="text-foreground font-medium">{customer.full_name?.split(" ")[0] || customer.email}</span>!
        </p>
      </div>

      {/* Tab navigation */}
      <div className="flex border-b border-border mb-6 gap-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {tab === "orders" && <OrdersTab storeSlug={store.slug} />}
      {tab === "profile" && <ProfileTab customer={customer} />}
    </div>
  );
}
