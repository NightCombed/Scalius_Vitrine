import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useActiveStore } from "@/hooks/useActiveStore";
import { formatBRL, ORDER_STATUS_LABEL } from "@/lib/mockData";
import { Clock, Package, ShoppingBag, Truck, CheckCircle2, TrendingUp, ArrowRight, AlertTriangle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AdminDashboard() {
  const store = useActiveStore();

  const { data: dashboardStats = { todayRevenue: 0, yesterdayRevenue: 0, todayOrders: 0, pending: 0 } } = useQuery({
    queryKey: ["admin-dashboard-stats", store?.id],
    queryFn: async () => {
      const now = new Date();
      const startOfToday = new Date(now);
      startOfToday.setHours(0, 0, 0, 0);
      
      const startOfYesterday = new Date(startOfToday);
      startOfYesterday.setDate(startOfYesterday.getDate() - 1);

      // Fetch today and yesterday's data
      const { data: ordersData, error: ordersError } = await supabase
        .from("orders")
        .select("status, total_cents, created_at")
        .eq("store_id", store!.id)
        .gte("created_at", startOfYesterday.toISOString());

      if (ordersError) throw ordersError;

      // Fetch ALL-TIME pending orders (ignoring date filter)
      const { count: totalPending, error: pendingError } = await supabase
        .from("orders")
        .select("id", { count: 'exact', head: true })
        .eq("store_id", store!.id)
        .eq("status", "pending");

      if (pendingError) throw pendingError;

      const today = ordersData.filter(o => new Date(o.created_at) >= startOfToday);
      const yesterday = ordersData.filter(o => {
        const d = new Date(o.created_at);
        return d >= startOfYesterday && d < startOfToday;
      });

      return {
        todayRevenue: today.reduce((sum, o) => sum + o.total_cents, 0),
        yesterdayRevenue: yesterday.reduce((sum, o) => sum + o.total_cents, 0),
        todayOrders: today.length,
        pending: totalPending || 0,
      };
    },
    enabled: !!store?.id,
  });

  const { data: recent = [] } = useQuery({
    queryKey: ["admin-dashboard-recent", store?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, customer_name, status, total_cents, created_at")
        .eq("store_id", store!.id)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
    enabled: !!store?.id,
  });

  const { data: top = [] } = useQuery({
    queryKey: ["admin-dashboard-top-weekly", store?.id],
    queryFn: async () => {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data, error } = await supabase
        .from("order_items")
        .select("product_id, product_name, quantity, line_total_cents")
        .eq("store_id", store!.id)
        .gte("created_at", sevenDaysAgo.toISOString());

      if (error) throw error;
      
      const map = new Map<string, { product_id: string; product_name: string; quantity: number; revenue_cents: number }>();
      data.forEach(item => {
        const id = item.product_id || item.product_name;
        if (!map.has(id)) {
          map.set(id, { product_id: id, product_name: item.product_name, quantity: 0, revenue_cents: 0 });
        }
        const prod = map.get(id)!;
        prod.quantity += item.quantity;
        prod.revenue_cents += item.line_total_cents;
      });

      return Array.from(map.values())
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 5);
    },
    enabled: !!store?.id,
  });

  const { data: stockInfo = { lowStock: 0, outOfStock: 0 } } = useQuery({
    queryKey: ["admin-dashboard-stock", store?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("stock_qty")
        .eq("store_id", store!.id);
      if (error) throw error;
      
      const lowStock = data.filter(p => p.stock_qty !== null && p.stock_qty > 0 && p.stock_qty < 5).length;
      const outOfStock = data.filter(p => p.stock_qty === 0).length;
      
      return { lowStock, outOfStock };
    },
    enabled: !!store?.id,
  });

  if (!store) {
    return (
      <div className="rounded-lg border border-border p-8 text-center">
        <p className="text-muted-foreground">Você ainda não está vinculado a nenhuma loja.</p>
      </div>
    );
  }

  const { todayRevenue, yesterdayRevenue, todayOrders, pending } = dashboardStats;
  
  const ticketMedio = todayOrders > 0 ? todayRevenue / todayOrders : 0;
  
  const growth = yesterdayRevenue > 0 
    ? ((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100 
    : todayRevenue > 0 ? null : 0;

  const kpis = [
    { 
      label: "Vendas hoje", 
      value: formatBRL(todayRevenue), 
      icon: TrendingUp, 
      accent: "text-primary",
      comparison: growth !== null ? {
        value: `${growth > 0 ? "+" : ""}${growth.toFixed(0)}%`,
        trend: growth >= 0 ? "up" : "down"
      } : { value: "—", trend: "neutral" }
    },
    { label: "Pedidos hoje", value: todayOrders, icon: ShoppingBag, accent: "text-primary" },
    { label: "Ticket médio", value: formatBRL(ticketMedio), icon: TrendingUp, accent: "text-primary" },
    { label: "Pendentes", value: pending, icon: Clock, accent: "text-amber-600" },
  ];

  const stockKpis = [
    { label: "Estoque baixo", value: stockInfo.lowStock, icon: AlertTriangle, accent: "text-amber-600", filter: "low-stock" },
    { label: "Esgotados", value: stockInfo.outOfStock, icon: XCircle, accent: "text-red-600", filter: "out-of-stock" },
  ];

  return (
    <div className="space-y-5 md:space-y-8 max-w-6xl">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-serif text-2xl md:text-3xl mb-0.5">Visão geral</h1>
          <p className="text-muted-foreground text-sm">Acompanhe o desempenho de {store.name}.</p>
        </div>
        <Button asChild size="sm">
          <Link to="/admin/pedidos">
            Ver pedidos <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4 shadow-soft">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">{s.label}</span>
              <s.icon className={`h-4 w-4 ${s.accent}`} />
            </div>
            <div className="font-serif text-xl">{s.value}</div>
            {s.comparison && (
              <div className={`text-[10px] mt-1 flex items-center gap-0.5 ${
                s.comparison.trend === "up" ? "text-emerald-600" : 
                s.comparison.trend === "down" ? "text-red-600" : 
                "text-muted-foreground"
              }`}>
                {s.comparison.value} {s.comparison.trend === "up" ? "↑" : s.comparison.trend === "down" ? "↓" : ""}
              </div>
            )}
          </div>
        ))}
      </div>

      {stockKpis.some(s => s.value > 0) && (
        <div className={`grid gap-4 ${stockKpis.filter(s => s.value > 0).length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {stockKpis.filter(s => s.value > 0).map((s) => (
            <Link 
              key={s.label} 
              to={`/admin/produtos?filter=${s.filter}`}
              className="rounded-xl border border-border bg-card p-5 shadow-soft hover:shadow-elegant transition-all flex items-center gap-4 group"
            >
              <div className={`p-3 rounded-full bg-muted group-hover:scale-110 transition-transform`}>
                <s.icon className={`h-6 w-6 ${s.accent}`} />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">{s.label}</div>
                <div className="font-serif text-2xl">{s.value}</div>
              </div>
              <ArrowRight className="h-4 w-4 ml-auto text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
          ))}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <section className="rounded-xl border border-border bg-card lg:col-span-2">
          <header className="p-5 border-b border-border flex items-center justify-between">
            <h2 className="font-serif text-xl">Pedidos recentes</h2>
            <Link to="/admin/pedidos" className="text-sm text-primary hover:underline">Ver todos</Link>
          </header>
          <div className="divide-y divide-border">
            {recent.length === 0 && (
              <div className="p-8 text-center text-muted-foreground text-sm">Nenhum pedido ainda.</div>
            )}
            {recent.map((o) => {
              return (
                <Link
                  key={o.id}
                  to={`/admin/pedidos/${o.id}`}
                  className="p-4 flex items-center justify-between hover:bg-muted/40 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{o.customer_name ?? "Cliente"}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      #{o.order_number || o.id.slice(-6).toUpperCase()} · {ORDER_STATUS_LABEL[o.status as keyof typeof ORDER_STATUS_LABEL]} · {new Date(o.created_at).toLocaleString("pt-BR")}
                    </div>
                  </div>
                  <div className="font-medium shrink-0 ml-4">{formatBRL(o.total_cents)}</div>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card">
          <header className="p-5 border-b border-border">
            <h2 className="font-serif text-xl">Mais vendidos esta semana</h2>
          </header>
          <div className="divide-y divide-border">
            {top.length === 0 && (
              <div className="p-8 text-center text-muted-foreground text-sm">Sem vendas ainda.</div>
            )}
            {top.map((row) => (
              <div key={row.product_id} className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{row.product_name ?? "Produto"}</div>
                  <div className="text-xs text-muted-foreground">{row.quantity} vendidos esta semana</div>
                </div>
                <div className="text-sm font-medium shrink-0 text-right">
                  <div>{formatBRL(row.revenue_cents)}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
