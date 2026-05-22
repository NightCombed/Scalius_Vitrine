import { useEffect, useState } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { AdminSidebar } from "./AdminSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { LogOut, ExternalLink, LayoutDashboard, Package, ShoppingBag, Truck, Settings, Menu, X, Tag, Users, Flower2 } from "lucide-react";
import { useStoreSettings } from "@/hooks/useStoreSettings";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { NavLink } from "@/components/NavLink";

const NAV_ITEMS = [
  { title: "Dashboard", url: "/admin", icon: LayoutDashboard, end: true },
  { title: "Produtos", url: "/admin/produtos", icon: Package },
  { title: "Pedidos", url: "/admin/pedidos", icon: ShoppingBag },
  { title: "Entregas", url: "/admin/entregas", icon: Truck },
  { title: "Config.", url: "/admin/configuracoes", icon: Settings },
];
// ─── Alerts System ────────────────────────────────────────────────────────
let flashInterval: NodeJS.Timeout | null = null;

function playSaleAlertSound(volume: "baixo" | "normal" | "alto" = "normal") {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    osc.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    // Uma onda mais aguda e "vibrante" para chamar atenção
    osc.type = "square";
    
    const now = ctx.currentTime;
    const gainLevels = {
      baixo: 0.03,
      normal: 0.15,
      alto: 0.35,
    };
    const maxGain = gainLevels[volume] ?? 0.15;

    // Tocar 4 notas rápidas e vibrantes
    [0, 0.15, 0.3, 0.45].forEach((delay, i) => {
      osc.frequency.setValueAtTime(880 + (i * 110), now + delay);
      gainNode.gain.setValueAtTime(0, now + delay);
      gainNode.gain.linearRampToValueAtTime(maxGain, now + delay + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + delay + 0.12);
    });
    
    osc.start(now);
    osc.stop(now + 0.6);
  } catch (err) {
    console.error("Audio play failed:", err);
  }
}

function isCurrentTimeInSilentHours(start: string, end: string): boolean {
  if (!start || !end) return false;
  
  const now = new Date();
  const currentHours = now.getHours();
  const currentMinutes = now.getMinutes();
  const currentTimeInMinutes = currentHours * 60 + currentMinutes;

  const [startH, startM] = start.split(":").map(Number);
  const [endH, endM] = end.split(":").map(Number);
  
  if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) {
    return false;
  }
  
  const startTimeInMinutes = startH * 60 + startM;
  const endTimeInMinutes = endH * 60 + endM;

  if (startTimeInMinutes === endTimeInMinutes) {
    return false;
  }

  if (startTimeInMinutes < endTimeInMinutes) {
    return currentTimeInMinutes >= startTimeInMinutes && currentTimeInMinutes < endTimeInMinutes;
  } else {
    return currentTimeInMinutes >= startTimeInMinutes || currentTimeInMinutes < endTimeInMinutes;
  }
}

function triggerVisualAlert(storeName: string) {
  if (flashInterval) clearInterval(flashInterval);
  
  let toggle = false;
  const originalTitle = document.title;
  
  // Criar uma div overlay para piscar a tela inteira
  let overlay = document.getElementById("sale-flash-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "sale-flash-overlay";
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.zIndex = "999999";
    overlay.style.pointerEvents = "none";
    overlay.style.transition = "background-color 0.1s ease-in-out";
    document.body.appendChild(overlay);
  }
  
  flashInterval = setInterval(() => {
    // Piscar a aba
    document.title = toggle ? "💰 NOVA VENDA! 💰" : originalTitle;
    
    // Piscar a tela de preto e transparente
    if (overlay) {
      overlay.style.backgroundColor = toggle ? "rgba(0, 0, 0, 0.85)" : "transparent";
    }
    
    toggle = !toggle;
  }, 400); // 400ms para piscar rápido

  const stopFlashing = () => {
    if (flashInterval) {
      clearInterval(flashInterval);
      flashInterval = null;
      document.title = `${storeName} | Painel Admin | FlorFlow`;
    }
    const existingOverlay = document.getElementById("sale-flash-overlay");
    if (existingOverlay) {
      existingOverlay.style.backgroundColor = "transparent";
      setTimeout(() => existingOverlay.remove(), 200);
    }
    // Remove os eventos depois de limpar
    window.removeEventListener("click", stopFlashing);
    window.removeEventListener("keydown", stopFlashing);
  };

  // Forçar o usuário a dar um clique ou apertar alguma tecla para parar o alerta (foco ou mousemove não para mais)
  window.addEventListener("click", stopFlashing);
  window.addEventListener("keydown", stopFlashing);
}

export default function AdminLayout() {
  const { user, memberships, signOut, isSuperAdmin } = useAuth();
  const activeStore = memberships[0]?.store;
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: settings } = useStoreSettings(activeStore?.id);

  useEffect(() => {
    const storeName = settings?.display_name || activeStore?.name || "Admin";
    document.title = `${storeName} | Painel Admin | FlorFlow`;
  }, [settings?.display_name, activeStore?.name]);

  useEffect(() => {
    if (!settings) return;
    const primary = settings.brand_color;
    const secondary = settings.secondary_color;
    const root = document.documentElement;
    if (primary) {
      root.style.setProperty("--primary", primary);
      root.style.setProperty("--ring", primary);
      root.style.setProperty("--sidebar-primary", primary);
    }
    if (secondary) {
      root.style.setProperty("--accent", secondary);
    }
  }, [settings]);

  // Close drawer on navigation
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // ── Real-time Push Notifications ──────────────────────────────────────────
  useEffect(() => {
    if (!activeStore?.id || !settings) return;
    const hasPushActive =
      settings.notif_push_new_order ||
      settings.notif_push_payment_confirmed ||
      settings.notif_push_status_change;

    const channel = supabase
      .channel(`admin-notifications-${activeStore.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `store_id=eq.${activeStore.id}`,
        },
        (payload) => {
          const order = payload.new as any;
          const oldOrder = payload.old as any;
          const orderNum = order.order_number || order.id.slice(-6).toUpperCase();
          const isMercadoPago = settings.payment_provider === "mercadopago";
          const notify = (title: string, body: string) => {
            if (Notification.permission !== "granted") return;
            const n = new Notification(title, { body, icon: "/favicon.ico" });
            n.onclick = () => {
              window.focus();
              window.location.href = `/admin/pedidos/${order.id}`;
            };
          };
          if (payload.eventType === "INSERT" && settings.notif_push_new_order && !isMercadoPago) {
            notify("Novo Pedido! 🛍️", `O pedido #${orderNum} acaba de chegar!`);
          }
          if (
            payload.eventType === "UPDATE" &&
            order.payment_status === "paid" &&
            oldOrder?.payment_status !== "paid" &&
            settings.notif_push_payment_confirmed
          ) {
            notify(
              isMercadoPago ? "Pagamento confirmado! Novo pedido 🛍️💰" : "Pagamento Confirmado! 💰",
              isMercadoPago
                ? `O pedido #${orderNum} foi pago via Mercado Pago. Já pode preparar!`
                : `O pagamento do pedido #${orderNum} foi confirmado.`,
            );
          }
          if (payload.eventType === "UPDATE" && order.status !== oldOrder?.status && settings.notif_push_status_change) {
            notify("Status Atualizado! 📋", `O pedido #${orderNum} agora está: ${order.status}`);
          }

          // ── Alerts Logic (Sound and Tab Flash) ──
          const isManual = settings.payment_provider === "manual";
          const isNewManualOrder = isManual && payload.eventType === "INSERT";
          const isAutomaticUpdatePaid = !isManual && payload.eventType === "UPDATE" && order.payment_status === "paid" && oldOrder?.payment_status !== "paid";
          const isAutomaticInsertPaid = !isManual && payload.eventType === "INSERT" && order.payment_status === "paid";
          
          if (isNewManualOrder || isAutomaticUpdatePaid || isAutomaticInsertPaid) {
            const isSilent = settings.silent_hours_enabled &&
              settings.silent_hours_start &&
              settings.silent_hours_end &&
              isCurrentTimeInSilentHours(settings.silent_hours_start, settings.silent_hours_end);

            if (settings.sound_enabled !== false && !isSilent) {
              playSaleAlertSound(settings.sound_volume);
            }
            triggerVisualAlert(settings.display_name || activeStore?.name || "Admin");
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeStore?.id, settings]);

  return (
    <div className="min-h-screen flex w-full bg-background text-foreground">
      {/* ── Desktop Sidebar (hidden on mobile) ── */}
      <div className="hidden md:block">
        <SidebarProvider>
          <AdminSidebar />
        </SidebarProvider>
      </div>

      {/* ── Mobile Drawer Overlay ── */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* ── Mobile Drawer Panel ── */}
      <aside
        className={cn(
          "fixed top-0 left-0 h-full w-72 z-50 bg-card border-r border-border shadow-2xl transition-transform duration-300 ease-in-out md:hidden flex flex-col",
          drawerOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground shrink-0">
              <Flower2 className="h-4 w-4" />
            </span>
            <span className="font-serif text-lg font-semibold">FlorFlow</span>
          </div>
          <button
            onClick={() => setDrawerOpen(false)}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Store info */}
        {activeStore && (
          <div className="px-4 py-3 border-b border-border bg-muted/30">
            <div className="text-sm font-semibold truncate">{activeStore.name}</div>
            <div className="text-xs text-muted-foreground">/{activeStore.slug}</div>
          </div>
        )}

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {[
            { title: "Visão geral", url: "/admin", icon: LayoutDashboard, end: true },
            { title: "Produtos", url: "/admin/produtos", icon: Package },
            { title: "Categorias", url: "/admin/categorias", icon: Tag },
            { title: "Pedidos", url: "/admin/pedidos", icon: ShoppingBag },
            { title: "Clientes", url: "/admin/clientes", icon: Users },
            { title: "Entregas e frete", url: "/admin/entregas", icon: Truck },
            { title: "Configurações", url: "/admin/configuracoes", icon: Settings },
          ].map((item) => (
            <NavLink
              key={item.url}
              to={item.url}
              end={item.end}
              className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors min-h-[44px]"
              activeClassName="bg-primary/10 text-primary"
            >
              <item.icon className="h-5 w-5 shrink-0" />
              <span>{item.title}</span>
            </NavLink>
          ))}
        </nav>

        {/* Drawer Footer */}
        <div className="p-4 border-t border-border space-y-2">
          {activeStore && (
            <Button asChild variant="outline" size="sm" className="w-full gap-2">
              <Link to={`/loja/${activeStore.slug}`} target="_blank">
                <ExternalLink className="h-4 w-4" /> Ver loja
              </Link>
            </Button>
          )}
          {isSuperAdmin && (
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link to="/super-admin">Super admin</Link>
            </Button>
          )}
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="text-xs text-muted-foreground truncate">{user?.full_name ?? user?.email}</span>
            <Button variant="ghost" size="icon" onClick={() => void signOut()} aria-label="Sair">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* ── Main content area ── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* ── Top Header ── */}
        <header className="h-14 bg-background/80 backdrop-blur sticky top-0 z-30 flex items-center gap-3 px-4 border-b border-border/50">
          {/* Mobile: hamburger */}
          <button
            className="md:hidden p-2 rounded-lg hover:bg-muted transition-colors -ml-1 min-w-[44px] min-h-[44px] flex items-center justify-center"
            onClick={() => setDrawerOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Logo — mobile only, centered */}
          <div className="md:hidden flex-1 flex justify-center">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground shrink-0">
                <Flower2 className="h-4 w-4" />
              </span>
              <span className="font-serif text-lg font-semibold">FlorFlow</span>
            </div>
          </div>

          {/* Desktop: store name */}
          <div className="hidden md:flex flex-1 min-w-0 flex-col">
            <div className="text-sm font-medium truncate">{activeStore?.name ?? "Painel"}</div>
            {activeStore && (
              <div className="text-xs text-muted-foreground truncate">/{activeStore.slug}</div>
            )}
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-1">
            {activeStore && (
              <Button asChild variant="ghost" size="sm" className="hidden sm:flex gap-1.5">
                <Link to={`/loja/${activeStore.slug}`} target="_blank">
                  <ExternalLink className="h-4 w-4" />
                  <span className="hidden lg:inline">Ver loja</span>
                </Link>
              </Button>
            )}
            {isSuperAdmin && (
              <Button asChild variant="outline" size="sm" className="hidden sm:flex">
                <Link to="/super-admin">Super admin</Link>
              </Button>
            )}
            <span className="hidden lg:block text-sm text-muted-foreground px-2">{user?.full_name}</span>
            <Button variant="ghost" size="icon" onClick={() => void signOut()} aria-label="Sair" className="min-w-[44px] min-h-[44px]">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* ── Page content ── */}
        <main className="flex-1 p-4 md:p-6 animate-fade-in pb-20 md:pb-6">
          <Outlet />
        </main>

        {/* ── Mobile Bottom Navigation ── */}
        <nav className="fixed bottom-0 left-0 right-0 z-30 bg-background/95 backdrop-blur border-t border-border md:hidden">
          <div className="flex items-stretch h-16">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.url}
                to={item.url}
                end={item.end}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] px-1"
                activeClassName="text-primary"
              >
                <item.icon className="h-5 w-5 shrink-0" />
                <span className="text-[10px] font-medium leading-tight">{item.title}</span>
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
