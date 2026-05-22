import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, MapPin, Loader2, AlertCircle } from "lucide-react";
import { useActiveStore } from "@/hooks/useActiveStore";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useStoreSettings } from "@/hooks/useStoreSettings";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/mockData";
import type { ShippingRule, DeliveryZone, DistancePricing } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

/* ───── helpers ───── */
const parseBRL = (s: string) => {
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  if (!isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
};
const slugify = (str: string) =>
  str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
const fmtKm = (n: number | null) => (n == null ? "∞" : `${n} km`);

/* ═══════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export default function AdminShipping() {
  const store = useActiveStore();
  const queryClient = useQueryClient();

  /* ─── shipping_mode from store_settings ─── */
  const { data: storeSettings, isLoading } = useStoreSettings(store?.id);

  const shippingMode = (storeSettings as any)?.shipping_mode ?? "regions";

  const toggleMode = useMutation({
    mutationFn: async (mode: "regions" | "distance") => {
      const { error } = await supabase.from("store_settings").update({ shipping_mode: mode } as any).eq("store_id", store!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["store-settings", store?.id] });
      toast({ title: "Modo de frete atualizado" });
    },
    onError: () => toast({ title: "Erro ao atualizar modo", variant: "destructive" }),
  });

  if (!store || isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <header>
        <h1 className="font-serif text-3xl mb-1">Entregas e frete</h1>
        <p className="text-muted-foreground">Configure como o frete é calculado para seus clientes.</p>
      </header>

      {/* Mode selector */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4 shadow-soft">
        <h2 className="font-medium">Modo de cálculo de frete ativo no checkout</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {(["regions", "distance"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => toggleMode.mutate(m)}
              className={`text-left rounded-lg border-2 p-4 transition-colors ${
                shippingMode === m ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
              }`}
            >
              <div className="font-medium">{m === "regions" ? "🏘️ Por bairro/região" : "📍 Por distância"}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {m === "regions"
                  ? "Valor fixo para cada bairro cadastrado."
                  : "Cálculo automático baseado na distância até o cliente."}
              </div>
            </button>
          ))}
        </div>
      </div>

      <Tabs defaultValue="regions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="regions">Regiões / Bairros</TabsTrigger>
          <TabsTrigger value="distance">Zonas de distância</TabsTrigger>
        </TabsList>

        <TabsContent value="regions">
          <RegionsTab storeId={store.id} />
        </TabsContent>
        <TabsContent value="distance">
          <DistanceTab storeId={store.id} hasCoords={!!(storeSettings as any)?.latitude && !!(storeSettings as any)?.longitude} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   REGIONS TAB (existing behaviour, extracted)
   ═══════════════════════════════════════════════════════════════ */
function RegionsTab({ storeId }: { storeId: string }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<ShippingRule | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [active, setActive] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<ShippingRule | null>(null);

  const { data: rules = [] } = useQuery<ShippingRule[]>({
    queryKey: ["shipping-regions", storeId],
    queryFn: async () => {
      const { data, error } = await supabase.from("shipping_regions").select("*").eq("store_id", storeId).order("name");
      if (error) throw error;
      return (data ?? []).map((row) => ({ id: row.id, store_id: row.store_id, name: row.name, price_cents: row.fee_cents, active: row.is_active }));
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("shipping_regions").update({ is_active: !active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shipping-regions", storeId] }),
    onError: () => toast({ title: "Erro ao atualizar região", variant: "destructive" }),
  });

  const createMutation = useMutation({
    mutationFn: async (vars: { name: string; price_cents: number; active: boolean }) => {
      const { error } = await supabase.from("shipping_regions").insert({ store_id: storeId, name: vars.name, slug: slugify(vars.name), fee_cents: vars.price_cents, is_active: vars.active });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["shipping-regions", storeId] }); toast({ title: "Região criada" }); setFormOpen(false); },
    onError: () => toast({ title: "Erro ao criar", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async (vars: { id: string; name: string; price_cents: number; active: boolean }) => {
      const { error } = await supabase.from("shipping_regions").update({ name: vars.name, slug: slugify(vars.name), fee_cents: vars.price_cents, is_active: vars.active }).eq("id", vars.id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["shipping-regions", storeId] }); toast({ title: "Região atualizada" }); setFormOpen(false); },
    onError: () => toast({ title: "Erro ao atualizar", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("shipping_regions").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["shipping-regions", storeId] }); toast({ title: "Região excluída" }); setDeleteTarget(null); },
    onError: () => toast({ title: "Erro ao excluir", variant: "destructive" }),
  });

  const openCreate = () => { setEditing(null); setName(""); setPrice(""); setActive(true); setFormOpen(true); };
  const openEdit = (r: ShippingRule) => { setEditing(r); setName(r.name); setPrice((r.price_cents / 100).toFixed(2).replace(".", ",")); setActive(r.active); setFormOpen(true); };
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { toast({ title: "Nome obrigatório", variant: "destructive" }); return; }
    const cents = parseBRL(price);
    editing ? updateMutation.mutate({ id: editing.id, name: trimmed, price_cents: cents, active }) : createMutation.mutate({ name: trimmed, price_cents: cents, active });
  };

  return (
    <>
      <div className="flex items-center justify-between gap-4 mb-4">
        <p className="text-sm text-muted-foreground">Configure bairros atendidos e o valor fixo do frete em cada um.</p>
        <Button onClick={openCreate} size="sm"><Plus className="h-4 w-4" /> Nova região</Button>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {rules.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">Nenhuma região cadastrada.</div>
        ) : (
          <div className="divide-y divide-border">
            {rules.map((r) => (
              <div key={r.id} className="p-4 flex items-center gap-4">
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{r.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Frete {formatBRL(r.price_cents)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={r.active} onCheckedChange={() => toggleMutation.mutate({ id: r.id, active: r.active })} aria-label="Ativar região" />
                  <span className="text-xs text-muted-foreground w-14">{r.active ? "Ativa" : "Inativa"}</span>
                </div>
                <Button size="icon" variant="ghost" onClick={() => openEdit(r)} aria-label="Editar"><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => setDeleteTarget(r)} aria-label="Excluir"><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Form Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Editar região" : "Nova região"}</DialogTitle></DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reg-name">Nome do bairro / região *</Label>
              <Input id="reg-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus placeholder="Ex: Centro" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-price">Valor do frete (R$) *</Label>
              <Input id="reg-price" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="15,00" />
            </div>
            <div className="flex items-center gap-3">
              <Switch id="reg-active" checked={active} onCheckedChange={setActive} />
              <Label htmlFor="reg-active" className="cursor-pointer">Região ativa</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
              <Button type="submit">{editing ? "Salvar" : "Criar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir região?</AlertDialogTitle>
            <AlertDialogDescription>"{deleteTarget?.name}" será removida. Pedidos antigos não serão afetados.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
   DISTANCE TAB
   ═══════════════════════════════════════════════════════════════ */
function DistanceTab({ storeId, hasCoords }: { storeId: string; hasCoords: boolean }) {
  const queryClient = useQueryClient();
  const [zoneForm, setZoneForm] = useState(false);
  const [editingZone, setEditingZone] = useState<DeliveryZone | null>(null);
  const [zoneName, setZoneName] = useState("");
  const [zoneMaxKm, setZoneMaxKm] = useState("");
  const [zoneActive, setZoneActive] = useState(true);
  
  // Advanced Pricing
  const [pricingType, setPricingType] = useState<"manual" | "auto">("manual");
  const [autoBase, setAutoBase] = useState("");
  const [autoPerKm, setAutoPerKm] = useState("");
  const [autoPerMin, setAutoPerMin] = useState("");
  const [autoMin, setAutoMin] = useState("");
  const [autoMult, setAutoMult] = useState("1.00");

  const [deleteZone, setDeleteZone] = useState<DeliveryZone | null>(null);

  // Pricing form (manual)
  const [pricingZoneId, setPricingZoneId] = useState<string | null>(null);
  const [pMin, setPMin] = useState(""); const [pMax, setPMax] = useState(""); const [pPrice, setPPrice] = useState("");

  const { data: zones = [] } = useQuery<DeliveryZone[]>({
    queryKey: ["delivery-zones", storeId],
    queryFn: async () => {
      const { data, error } = await supabase.from("delivery_zones").select("*").eq("store_id", storeId).order("created_at");
      if (error) throw error;
      return data as DeliveryZone[];
    },
  });

  const { data: allPricing = [] } = useQuery<DistancePricing[]>({
    queryKey: ["distance-pricing", storeId],
    queryFn: async () => {
      const zoneIds = zones.map((z) => z.id);
      if (zoneIds.length === 0) return [];
      const { data, error } = await supabase.from("distance_pricing").select("*").in("delivery_zone_id", zoneIds).order("min_distance_km");
      if (error) throw error;
      return data as DistancePricing[];
    },
    enabled: zones.length > 0,
  });

  const createZone = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("delivery_zones").insert({
        store_id: storeId, 
        name: zoneName.trim(), 
        max_distance_km: zoneMaxKm ? parseFloat(zoneMaxKm) : null, 
        is_active: zoneActive,
        pricing_type: pricingType,
        auto_base_fee_cents: pricingType === "auto" && autoBase ? parseBRL(autoBase) : null,
        auto_price_per_km_cents: pricingType === "auto" && autoPerKm ? parseBRL(autoPerKm) : null,
        auto_price_per_min_cents: pricingType === "auto" && autoPerMin ? parseBRL(autoPerMin) : null,
        auto_min_fee_cents: pricingType === "auto" && autoMin ? parseBRL(autoMin) : null,
        auto_multiplier: pricingType === "auto" && autoMult ? parseFloat(autoMult.replace(',', '.')) : 1.00,
      });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["delivery-zones", storeId] }); toast({ title: "Zona criada" }); setZoneForm(false); },
    onError: () => toast({ title: "Erro ao criar zona", variant: "destructive" }),
  });

  const updateZone = useMutation({
    mutationFn: async () => {
      if (!editingZone) return;
      const { error } = await supabase.from("delivery_zones").update({
        name: zoneName.trim(), 
        max_distance_km: zoneMaxKm ? parseFloat(zoneMaxKm) : null, 
        is_active: zoneActive,
        pricing_type: pricingType,
        auto_base_fee_cents: pricingType === "auto" && autoBase ? parseBRL(autoBase) : null,
        auto_price_per_km_cents: pricingType === "auto" && autoPerKm ? parseBRL(autoPerKm) : null,
        auto_price_per_min_cents: pricingType === "auto" && autoPerMin ? parseBRL(autoPerMin) : null,
        auto_min_fee_cents: pricingType === "auto" && autoMin ? parseBRL(autoMin) : null,
        auto_multiplier: pricingType === "auto" && autoMult ? parseFloat(autoMult.replace(',', '.')) : 1.00,
      }).eq("id", editingZone.id);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["delivery-zones", storeId] }); toast({ title: "Zona atualizada" }); setZoneForm(false); },
    onError: () => toast({ title: "Erro ao atualizar zona", variant: "destructive" }),
  });

  const removeZone = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("delivery_zones").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["delivery-zones", storeId] }); queryClient.invalidateQueries({ queryKey: ["distance-pricing", storeId] }); toast({ title: "Zona excluída" }); setDeleteZone(null); },
    onError: () => toast({ title: "Erro ao excluir zona", variant: "destructive" }),
  });

  const addPricing = useMutation({
    mutationFn: async () => {
      if (!pricingZoneId) return;
      const { error } = await supabase.from("distance_pricing").insert({
        delivery_zone_id: pricingZoneId, min_distance_km: parseFloat(pMin), max_distance_km: parseFloat(pMax), price_cents: parseBRL(pPrice),
      });
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["distance-pricing", storeId] }); toast({ title: "Faixa adicionada" }); setPMin(""); setPMax(""); setPPrice(""); setPricingZoneId(null); },
    onError: () => toast({ title: "Erro ao adicionar faixa", variant: "destructive" }),
  });

  const removePricing = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("distance_pricing").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["distance-pricing", storeId] }); toast({ title: "Faixa removida" }); },
    onError: () => toast({ title: "Erro ao remover faixa", variant: "destructive" }),
  });

  const openCreateZone = () => { 
    setEditingZone(null); setZoneName(""); setZoneMaxKm(""); setZoneActive(true); 
    setPricingType("manual"); setAutoBase(""); setAutoPerKm(""); setAutoPerMin(""); setAutoMin(""); setAutoMult("1.00");
    setZoneForm(true); 
  };
  const openEditZone = (z: DeliveryZone) => { 
    setEditingZone(z); setZoneName(z.name); setZoneMaxKm(z.max_distance_km?.toString() ?? ""); setZoneActive(z.is_active); 
    setPricingType(z.pricing_type ?? "manual");
    setAutoBase(z.auto_base_fee_cents ? (z.auto_base_fee_cents / 100).toFixed(2).replace(".", ",") : "");
    setAutoPerKm(z.auto_price_per_km_cents ? (z.auto_price_per_km_cents / 100).toFixed(2).replace(".", ",") : "");
    setAutoPerMin(z.auto_price_per_min_cents ? (z.auto_price_per_min_cents / 100).toFixed(2).replace(".", ",") : "");
    setAutoMin(z.auto_min_fee_cents ? (z.auto_min_fee_cents / 100).toFixed(2).replace(".", ",") : "");
    setAutoMult(z.auto_multiplier ? z.auto_multiplier.toFixed(2) : "1.00");
    setZoneForm(true); 
  };

  const submitZone = (e: React.FormEvent) => {
    e.preventDefault();
    if (!zoneName.trim()) { toast({ title: "Nome obrigatório", variant: "destructive" }); return; }
    editingZone ? updateZone.mutate() : createZone.mutate();
  };

  if (!hasCoords) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-center space-y-3">
        <AlertCircle className="h-8 w-8 text-amber-500 mx-auto" />
        <h3 className="font-medium">Coordenadas da loja não configuradas</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Para usar o cálculo de frete por distância, primeiro configure a latitude e longitude da loja em <strong>Configurações → Endereço da loja</strong>.
        </p>
        <Button variant="outline" size="sm" onClick={() => window.location.href = "/admin/configuracoes"}>
          <MapPin className="h-4 w-4" /> Ir para Configurações
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between gap-4 mb-4">
        <p className="text-sm text-muted-foreground">Crie zonas de entrega com faixas de preço por distância (em km).</p>
        <Button onClick={openCreateZone} size="sm"><Plus className="h-4 w-4" /> Nova zona</Button>
      </div>

      {zones.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center text-muted-foreground text-sm">
          Nenhuma zona de entrega cadastrada. Crie a primeira para definir faixas de preço por distância.
        </div>
      ) : (
        <div className="space-y-4">
          {zones.map((z) => {
            const tiers = allPricing.filter((p) => p.delivery_zone_id === z.id).sort((a, b) => a.min_distance_km - b.min_distance_km);
            return (
              <div key={z.id} className="rounded-xl border border-border bg-card overflow-hidden">
                {/* Zone header */}
                <div className="p-4 flex items-center gap-4 border-b border-border bg-muted/30">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{z.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Raio máximo: {fmtKm(z.max_distance_km)}</div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${z.is_active ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" : "bg-muted text-muted-foreground"}`}>
                    {z.is_active ? "Ativa" : "Inativa"}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                    {z.pricing_type === "auto" ? "App (OSRM)" : "Manual"}
                  </span>
                  <Button size="icon" variant="ghost" onClick={() => openEditZone(z)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => setDeleteZone(z)}><Trash2 className="h-4 w-4" /></Button>
                </div>

                {/* Pricing Display */}
                <div className="p-4 space-y-2">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Configuração de Preços</div>
                  
                  {z.pricing_type === "auto" ? (
                    <div className="text-sm space-y-1 mt-2 text-muted-foreground">
                      <p><strong>Cálculo Automático (Apps):</strong> Taxa Dinâmica = (Base + Km + Tempo) × Multiplicador</p>
                      <ul className="list-disc list-inside ml-2">
                        <li>Taxa Inicial (Bandeirada): {formatBRL(z.auto_base_fee_cents || 0)}</li>
                        <li>Preço por KM rodado: {formatBRL(z.auto_price_per_km_cents || 0)}</li>
                        <li>Preço por Minuto de trânsito: {formatBRL(z.auto_price_per_min_cents || 0)}</li>
                        <li>Multiplicador de Segurança: {z.auto_multiplier}x</li>
                        <li><strong>Taxa Mínima de Entrega:</strong> {formatBRL(z.auto_min_fee_cents || 0)}</li>
                      </ul>
                    </div>
                  ) : (
                    <>
                      {tiers.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Nenhuma faixa cadastrada — adicione abaixo.</p>
                      ) : (
                        <div className="space-y-1">
                          {tiers.map((t) => (
                            <div key={t.id} className="flex items-center justify-between text-sm rounded-md bg-muted/50 px-3 py-2">
                              <span>{t.min_distance_km} km — {t.max_distance_km} km</span>
                              <span className="flex items-center gap-3">
                                <span className="font-medium tabular-nums">{formatBRL(t.price_cents)}</span>
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removePricing.mutate(t.id)}><Trash2 className="h-3 w-3" /></Button>
                              </span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Add tier inline */}
                      {pricingZoneId === z.id ? (
                        <form onSubmit={(e) => { e.preventDefault(); addPricing.mutate(); }} className="flex items-end gap-2 mt-2">
                          <div className="space-y-1 flex-1"><Label className="text-xs">De (km)</Label><Input value={pMin} onChange={(e) => setPMin(e.target.value)} inputMode="decimal" placeholder="0" /></div>
                          <div className="space-y-1 flex-1"><Label className="text-xs">Até (km)</Label><Input value={pMax} onChange={(e) => setPMax(e.target.value)} inputMode="decimal" placeholder="5" /></div>
                          <div className="space-y-1 flex-1"><Label className="text-xs">Preço (R$)</Label><Input value={pPrice} onChange={(e) => setPPrice(e.target.value)} inputMode="decimal" placeholder="10,00" /></div>
                          <Button type="submit" size="sm">Adicionar</Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => setPricingZoneId(null)}>✕</Button>
                        </form>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => { setPricingZoneId(z.id); setPMin(""); setPMax(""); setPPrice(""); }}>
                          <Plus className="h-3 w-3" /> Adicionar faixa
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Zone Form Dialog */}
      <Dialog open={zoneForm} onOpenChange={setZoneForm}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingZone ? "Editar zona" : "Nova zona de entrega"}</DialogTitle></DialogHeader>
          <form onSubmit={submitZone} className="space-y-4">
            <div className="space-y-2">
              <Label>Nome da zona *</Label>
              <Input value={zoneName} onChange={(e) => setZoneName(e.target.value)} placeholder="Ex: Entrega Local" maxLength={60} autoFocus />
            </div>
            
            <div className="space-y-3 pt-2">
              <Label>Método de Precificação</Label>
              <RadioGroup value={pricingType} onValueChange={(v: "manual"|"auto") => setPricingType(v)} className="flex flex-col space-y-1">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="manual" id="manual" />
                  <Label htmlFor="manual" className="font-normal cursor-pointer">Manual (Faixas Fixas)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="auto" id="auto" />
                  <Label htmlFor="auto" className="font-normal cursor-pointer flex items-center gap-1">Automático <span className="text-xs text-muted-foreground">(Estilo Uber/99 c/ Rota OSRM)</span></Label>
                </div>
              </RadioGroup>
            </div>

            {pricingType === "auto" && (
              <div className="p-4 bg-muted/40 rounded-lg space-y-4 border border-border">
                <p className="text-xs text-muted-foreground">Preço = [Base + (Distância × Preço/Km) + (Tempo × Preço/Min)] × Multiplicador</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs">Taxa Mínima (R$)</Label>
                    <Input value={autoMin} onChange={e => setAutoMin(e.target.value)} placeholder="8,00" inputMode="decimal" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Base/Bandeirada (R$)</Label>
                    <Input value={autoBase} onChange={e => setAutoBase(e.target.value)} placeholder="5,00" inputMode="decimal" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Preço p/ Km (R$)</Label>
                    <Input value={autoPerKm} onChange={e => setAutoPerKm(e.target.value)} placeholder="1,50" inputMode="decimal" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Preço p/ Minuto (R$)</Label>
                    <Input value={autoPerMin} onChange={e => setAutoPerMin(e.target.value)} placeholder="0,30" inputMode="decimal" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Multiplicador de Segurança</Label>
                  <Input value={autoMult} onChange={e => setAutoMult(e.target.value)} placeholder="1.20" inputMode="decimal" />
                  <p className="text-[10px] text-muted-foreground">Margem para cobrir erros de rota ou trânsito (ex: 1.2 = 20% a mais)</p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Raio máximo de entrega (km)</Label>
              <Input value={zoneMaxKm} onChange={(e) => setZoneMaxKm(e.target.value)} inputMode="decimal" placeholder="15 (vazio = ilimitado)" />
              <p className="text-[10px] text-muted-foreground">Pedidos com distância (em linha reta) acima deste raio serão bloqueados na finalização.</p>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={zoneActive} onCheckedChange={setZoneActive} />
              <Label className="cursor-pointer">Zona ativa</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setZoneForm(false)}>Cancelar</Button>
              <Button type="submit">{editingZone ? "Salvar" : "Criar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Zone Dialog */}
      <AlertDialog open={!!deleteZone} onOpenChange={(v) => !v && setDeleteZone(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir zona?</AlertDialogTitle>
            <AlertDialogDescription>"{deleteZone?.name}" e todas as faixas de preço serão removidas.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteZone && removeZone.mutate(deleteZone.id)}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
