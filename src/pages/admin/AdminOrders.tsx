import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveStore } from "@/hooks/useActiveStore";
import { formatBRL, ORDER_STATUS_LABEL } from "@/lib/mockData";
import type { Order } from "@/types/database";
import { Input } from "@/components/ui/input";
import { Search, ChevronRight, Package } from "lucide-react";
import { cn } from "@/lib/utils";

const FILTERS = [
  "all", "pending", "preparing", "ready", "out_for_delivery", "delivered", "picked_up", "cancelled",
] as const;

type FilterValue = (typeof FILTERS)[number];

const FILTER_LABEL: Record<string, string> = {
  all:              "Todos",
  pending:          "Pendentes",
  preparing:        "Em prep.",
  ready:            "Prontos",
  out_for_delivery: "Em entrega",
  delivered:        "Entregues",
  picked_up:        "Retirados",
  cancelled:        "Cancelados",
};

const STATUS_BADGE: Record<string, string> = {
  pending:          "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  preparing:        "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  ready:            "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
  out_for_delivery: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  delivered:        "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  picked_up:        "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  cancelled:        "bg-muted text-muted-foreground",
  confirmed:        "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  canceled:         "bg-muted text-muted-foreground",
};

const PAYMENT_BADGE: Record<string, string> = {
  paid:    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
};

function getStatusLabel(status: string) {
  if (status === "confirmed") return "Em preparação";
  return ORDER_STATUS_LABEL[status as keyof typeof ORDER_STATUS_LABEL] || "Cancelado";
}

function getPaymentLabel(paymentStatus: string) {
  return paymentStatus === "paid" ? "Pago" : "Aguardando";
}

export default function AdminOrders() {
  const store = useActiveStore();
  const [filter, setFilter] = useState<FilterValue>("all");
  const [search, setSearch] = useState("");

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["admin-orders", store?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("store_id", store!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!store?.id,
  });

  const rows = useMemo(() => {
    return orders
      .filter((o) => filter === "all" || o.status === filter)
      .filter((o) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          o.customer_name?.toLowerCase().includes(q) ||
          o.customer_phone?.toLowerCase().includes(q) ||
          o.id.toLowerCase().includes(q) ||
          o.order_number?.toString().includes(q)
        );
      });
  }, [orders, filter, search]);

  if (!store) return null;

  return (
    <div className="space-y-4 max-w-6xl">
      {/* Header */}
      <header>
        <h1 className="font-serif text-2xl md:text-3xl mb-0.5">Pedidos</h1>
        <p className="text-muted-foreground text-sm">Gerencie todos os pedidos da loja.</p>
      </header>

      {/* Filter chips — horizontally scrollable on mobile */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap scrollbar-none">
        {FILTERS.map((f) => {
          const count = f === "all"
            ? orders.length
            : orders.filter((o) => o.status === f).length;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-3 py-1.5 rounded-full text-sm border transition-colors shrink-0 min-h-[36px]",
                filter === f
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:bg-muted bg-background"
              )}
            >
              {FILTER_LABEL[f]} <span className="opacity-70">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por cliente, telefone ou ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 h-11"
        />
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4 animate-pulse">
              <div className="flex gap-3">
                <div className="h-4 w-32 bg-muted rounded" />
                <div className="h-4 w-16 bg-muted rounded" />
              </div>
              <div className="h-3 w-48 bg-muted rounded mt-2" />
            </div>
          ))}
        </div>
      )}

      {/* Orders list */}
      {!isLoading && (
        <>
          {rows.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-12 text-center">
              <Package className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">Nenhum pedido encontrado.</p>
            </div>
          ) : (
            /* Mobile: cards stacked. Desktop: more compact list */
            <div className="space-y-2 md:space-y-0 md:rounded-xl md:border md:border-border md:bg-card md:overflow-hidden md:divide-y md:divide-border">
              {rows.map((order) => (
                <Link
                  key={order.id}
                  to={`/admin/pedidos/${order.id}`}
                  className={cn(
                    /* Mobile card style */
                    "block rounded-xl border border-border bg-card p-4 active:bg-muted/60 transition-colors",
                    /* Desktop row style */
                    "md:rounded-none md:border-0 md:flex md:items-center md:justify-between md:gap-4 md:px-4 md:py-3.5 md:hover:bg-muted/40"
                  )}
                >
                  {/* Mobile layout */}
                  <div className="md:hidden space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold truncate max-w-[180px]">
                        {order.customer_name ?? "Cliente"}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="font-semibold">{formatBRL(order.total_cents)}</span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      <span className={cn("text-xs px-2 py-0.5 rounded-full", STATUS_BADGE[order.status])}>
                        {getStatusLabel(order.status)}
                      </span>
                      <span className={cn("text-xs px-2 py-0.5 rounded-full", PAYMENT_BADGE[order.payment_status ?? "pending"])}>
                        {getPaymentLabel(order.payment_status ?? "pending")}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {order.delivery_type === "pickup" ? "Retirada" : "Entrega"}
                      </span>
                    </div>

                    <div className="text-xs text-muted-foreground">
                      #{order.order_number || order.id.slice(-6).toUpperCase()}
                      {order.customer_phone && <span> · {order.customer_phone}</span>}
                      <span> · {new Date(order.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  </div>

                  {/* Desktop layout */}
                  <div className="hidden md:flex md:items-center md:justify-between md:gap-4 md:w-full">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{order.customer_name ?? "Cliente"}</span>
                        <span className={cn("text-xs px-2 py-0.5 rounded-full", STATUS_BADGE[order.status])}>
                          {getStatusLabel(order.status)}
                        </span>
                        <span className={cn("text-xs px-2 py-0.5 rounded-full", PAYMENT_BADGE[order.payment_status ?? "pending"])}>
                          {getPaymentLabel(order.payment_status ?? "pending")}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                          {order.delivery_type === "pickup" ? "Retirada" : "Entrega"}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 truncate">
                        #{order.order_number || order.id.slice(-6).toUpperCase()} · {order.customer_phone ?? "Sem telefone"} · {new Date(order.created_at).toLocaleString("pt-BR")}
                      </div>
                    </div>
                    <div className="font-medium shrink-0">{formatBRL(order.total_cents)}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
