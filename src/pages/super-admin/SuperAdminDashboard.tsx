import { useAuth } from "@/contexts/AuthContext";
import { stores, byStore } from "@/lib/mockData";

export default function SuperAdminDashboard() {
  const { user } = useAuth();
  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-serif text-3xl mb-1">Plataforma Scalius Vitrine</h1>
        <p className="text-muted-foreground">Olá, {user?.full_name}. Gerencie todas as floriculturas da plataforma.</p>
      </header>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <header className="p-5 border-b border-border flex items-center justify-between">
          <h2 className="font-serif text-xl">Lojas</h2>
          <span className="text-sm text-muted-foreground">{stores.length} ativas</span>
        </header>
        <div className="divide-y divide-border">
          {stores.map((s) => {
            const products = byStore.products(s.id).length;
            const orders = byStore.orders(s.id).length;
            return (
              <div key={s.id} className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4 items-center">
                <div>
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-muted-foreground">{s.slug}.scalius.com.br</div>
                </div>
                <div className="text-sm"><span className="text-muted-foreground">Status:</span> {s.status}</div>
                <div className="text-sm"><span className="text-muted-foreground">Produtos:</span> {products}</div>
                <div className="text-sm"><span className="text-muted-foreground">Pedidos:</span> {orders}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
