import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus, Search, Pencil, Trash2, GripVertical, ListOrdered, Star, AlertTriangle } from "lucide-react";
import { useActiveStore } from "@/hooks/useActiveStore";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Product, Category, ProductVariantGroup, ProductVariantOption } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ProductFormDialog } from "@/components/admin/ProductFormDialog";
import { toast } from "@/hooks/use-toast";
import { getProductImage, cn } from "@/lib/utils";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const formatBRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ─── Extended Product type with sort_order ───────────────────────────────────
type ProductWithOrder = Product & {
  sort_order?: number | null;
  featured?: boolean;
  product_variant_groups?: (ProductVariantGroup & {
    options?: ProductVariantOption[];
  })[];
};

// ─── Draggable row component ─────────────────────────────────────────────────
function SortableProductRow({
  p,
  categoryName,
  onEdit,
  onDelete,
  onToggleActive,
  onToggleFeatured,
  isDragMode,
  filterMode,
}: {
  p: ProductWithOrder;
  categoryName: (id?: string | null) => string;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
  onToggleFeatured: () => void;
  isDragMode: boolean;
  filterMode?: "all" | "active" | "inactive" | "low-stock" | "out-of-stock" | "problem-variants";
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: p.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const filteredGroups = (p.product_variant_groups ?? [])
    .map((group) => {
      const opts = group.options ?? [];
      const filteredOpts = opts.filter((opt) => {
        if (filterMode === "low-stock")
          return opt.stock_qty !== null && opt.stock_qty > 0 && opt.stock_qty < 5;
        if (filterMode === "out-of-stock") return opt.stock_qty === 0;
        if (filterMode === "problem-variants")
          return opt.stock_qty !== null && opt.stock_qty < 5;
        return true;
      });
      return { ...group, options: filteredOpts };
    })
    .filter((group) => group.options.length > 0);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "p-3 md:p-4 flex items-start gap-3 bg-card transition-shadow",
        isDragging && "shadow-2xl ring-2 ring-primary rounded-xl z-50 opacity-90"
      )}
    >
      {/* Drag handle */}
      {isDragMode ? (
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground hover:text-foreground transition-colors p-2 rounded min-w-[44px] min-h-[44px] flex items-center justify-center mt-0.5"
          title="Arrastar para reordenar"
        >
          <GripVertical className="h-5 w-5" />
        </button>
      ) : (
        <div className="h-11 w-11 md:h-12 md:w-12 rounded-md bg-muted shrink-0 overflow-hidden mt-0.5">
          {getProductImage(p.image_url) && (
            <img
              src={getProductImage(p.image_url)!}
              alt={p.name}
              className="h-full w-full object-cover"
            />
          )}
        </div>
      )}

      {/* Thumbnail alongside grip in sort mode */}
      {isDragMode && (
        <div className="h-10 w-10 rounded-md bg-muted shrink-0 overflow-hidden mt-0.5">
          {getProductImage(p.image_url) && (
            <img
              src={getProductImage(p.image_url)!}
              alt={p.name}
              className="h-full w-full object-cover"
            />
          )}
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap pt-0.5 md:pt-1">
          <span className="font-medium truncate">{p.name}</span>
          {!p.active && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Inativo</Badge>}
          {p.featured && (
            <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-400 border-0 text-[10px] px-1.5 py-0.5 gap-1 font-medium flex items-center">
              <Star className="h-2.5 w-2.5 fill-current" />
              Destaque
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-1 flex flex-col gap-1.5">
          {filteredGroups.length > 0 ? (
            <>
              <div className="flex items-center gap-1.5">
                <span className="truncate hidden sm:inline">{categoryName(p.category_id)}</span>
                <span className="opacity-40 hidden sm:inline">·</span>
                <span>Estoque:</span>
              </div>
              <div className="flex flex-col gap-1.5 pt-0.5">
                {filteredGroups.map((group, gIdx) => {
                  const opts = group.options;
                  const isLastGroup = gIdx === filteredGroups.length - 1;
                  return (
                    <div key={group.id} className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-foreground/90 shrink-0">{group.group_name}:</span>
                        {opts.map((opt) => {
                          const isOut = opt.stock_qty === 0;
                          const isLow = opt.stock_qty !== null && opt.stock_qty > 0 && opt.stock_qty < 5;
                          return (
                            <span
                              key={opt.id}
                              className={cn(
                                "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px]",
                                isOut
                                  ? "border-destructive/30 bg-destructive/5"
                                  : isLow
                                  ? "border-amber-500/40 bg-amber-500/5"
                                  : "border-border/60 bg-muted/30"
                              )}
                            >
                              <span className="text-foreground/70">{opt.value}:</span>
                              <span className={cn(
                                "font-medium",
                                isOut ? "text-destructive" : isLow ? "text-amber-600 dark:text-amber-400" : "text-foreground"
                              )}>
                                {opt.stock_qty ?? "∞"}
                              </span>
                              {isOut && (
                                <Badge variant="destructive" className="h-3.5 px-1 text-[9px] font-normal leading-none shrink-0">Esgotado</Badge>
                              )}
                              {isLow && (
                                <Badge className="h-3.5 px-1 text-[9px] font-normal bg-amber-500 hover:bg-amber-600 leading-none shrink-0 gap-1 flex items-center">
                                  <AlertTriangle className="h-2.5 w-2.5" />
                                  Baixo
                                </Badge>
                              )}
                            </span>
                          );
                        })}
                      </div>
                      {!isLastGroup && <hr className="border-border my-1 w-full" />}
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="truncate hidden sm:inline">{categoryName(p.category_id)}</span>
              <span className="opacity-40 hidden sm:inline">·</span>
              <span>Estoque:</span>
              <span className={cn(
                "text-foreground",
                p.stock === 0 ? "text-destructive font-semibold" : p.stock !== null && p.stock > 0 && p.stock < 5 ? "text-amber-600 dark:text-amber-400 font-semibold" : ""
              )}>
                {p.stock ?? "—"}
              </span>
              {p.stock === 0 && (
                <Badge variant="destructive" className="h-4 px-1 text-[10px]">Esgotado</Badge>
              )}
              {p.stock !== null && p.stock > 0 && p.stock < 5 && (
                <Badge className="h-4 px-1.5 text-[10px] bg-amber-500 hover:bg-amber-600 gap-1 flex items-center">
                  <AlertTriangle className="h-3 w-3" />
                  Baixo
                </Badge>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="font-medium shrink-0 text-sm md:w-24 md:text-right pt-2 md:pt-2.5">
        {formatBRL(p.price_cents)}
      </div>

      {!isDragMode && (
        <div className="flex items-center gap-1.5 shrink-0 pt-1 md:pt-1.5">
          <div className="hidden md:flex items-center gap-1.5 mr-1" title="Em destaque">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
              Destaque
            </span>
            <Switch
              checked={!!p.featured}
              onCheckedChange={onToggleFeatured}
            />
          </div>
          <div className="flex items-center gap-1" title="Ativo/Inativo">
            <span className="text-xs text-muted-foreground hidden md:inline">{p.active ? "Ativo" : "Inativo"}</span>
            <Switch checked={p.active} onCheckedChange={onToggleActive} />
          </div>
          <Button size="icon" variant="ghost" onClick={onEdit} className="min-w-[40px] min-h-[40px]">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={onDelete} className="min-w-[40px] min-h-[40px]">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function AdminProducts() {
  const store = useActiveStore();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [searchParams] = useSearchParams();
  const urlFilter = searchParams.get("filter") as any;
  const [filter, setFilter] = useState<
    "all" | "active" | "inactive" | "low-stock" | "out-of-stock" | "problem-variants"
  >(urlFilter || "all");
  const [tab, setTab] = useState<"catalog" | "featured">("catalog");
  const [isDragMode, setIsDragMode] = useState(false);
  const [localOrder, setLocalOrder] = useState<ProductWithOrder[]>([]);
  const [localFeaturedOrder, setLocalFeaturedOrder] = useState<ProductWithOrder[]>([]);

  useEffect(() => {
    if (urlFilter) setFilter(urlFilter);
  }, [urlFilter]);

  const [editing, setEditing] = useState<Product | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    })
  );

  const { data: products = [] } = useQuery({
    queryKey: ["products", store?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*, product_variant_groups(*, product_variant_options(*))")
        .eq("store_id", store!.id)
        .order("sort_order", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []).map((p: any) => ({
        id: p.id,
        store_id: p.store_id,
        category_id: p.category_id,
        name: p.name,
        description: p.description,
        price_cents: p.price_cents,
        image_url: p.image_url,
        active: p.is_active,
        featured: p.is_featured ?? false,
        stock: p.stock_qty,
        sort_order: p.sort_order,
        weight_kg: p.weight_kg,
        width_cm: p.width_cm,
        height_cm: p.height_cm,
        length_cm: p.length_cm,
        created_at: p.created_at,
        product_variant_groups: (p.product_variant_groups ?? [])
          .sort((a: any, b: any) => a.sort_order - b.sort_order)
          .map((g: any) => ({
            id: g.id,
            product_id: g.product_id,
            store_id: g.store_id,
            group_name: g.group_name,
            sort_order: g.sort_order,
            created_at: g.created_at,
            options: (g.product_variant_options ?? [])
              .sort((a: any, b: any) => a.sort_order - b.sort_order)
              .map((o: any) => ({
                id: o.id,
                group_id: o.group_id,
                store_id: o.store_id,
                value: o.value,
                stock_qty: o.stock_qty,
                sort_order: o.sort_order,
                created_at: o.created_at,
              })),
          })),
      })) as ProductWithOrder[];
    },
    enabled: !!store?.id,
  });

  // Sync local order from server data (only when not in drag mode)
  useEffect(() => {
    if (!isDragMode) {
      setLocalOrder(products);
      setLocalFeaturedOrder(products.filter((p) => p.featured));
    }
  }, [products, isDragMode]);

  const { data: categories = [] } = useQuery({
    queryKey: ["categories", store?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("store_id", store!.id)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []).map((c: any) => ({
        id: c.id,
        store_id: c.store_id,
        name: c.name,
        slug: c.slug,
        position: c.sort_order ?? 0,
      })) as Category[];
    },
    enabled: !!store?.id,
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from("products")
        .update({ is_active: !active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { active }) => {
      queryClient.invalidateQueries({ queryKey: ["products", store?.id] });
      toast({
        title: active
          ? "Produto desativado com sucesso"
          : "Produto ativado com sucesso",
      });
    },
    onError: () =>
      toast({ title: "Erro ao atualizar status", variant: "destructive" }),
  });

  const featuredMutation = useMutation({
    mutationFn: async ({
      id,
      featured,
    }: {
      id: string;
      featured: boolean;
    }) => {
      const { error } = await supabase
        .from("products")
        .update({ is_featured: !featured })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, { featured }) => {
      queryClient.invalidateQueries({ queryKey: ["products", store?.id] });
      toast({
        title: !featured
          ? "Produto marcado como destaque"
          : "Produto removido dos destaques",
      });
    },
    onError: () =>
      toast({ title: "Erro ao atualizar destaque", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products", store?.id] });
      toast({ title: "Produto excluído" });
      setDeleteTarget(null);
    },
    onError: () =>
      toast({ title: "Erro ao excluir", variant: "destructive" }),
  });

  const saveOrderMutation = useMutation({
    mutationFn: async (ordered: ProductWithOrder[]) => {
      const updates = ordered.map((p, i) =>
        supabase
          .from("products")
          .update({ sort_order: i + 1 })
          .eq("id", p.id)
      );
      await Promise.all(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products", store?.id] });
      toast({ title: "Ordem salva com sucesso!" });
    },
    onError: () =>
      toast({ title: "Erro ao salvar ordem", variant: "destructive" }),
  });

  if (!store) return null;

  const categoryName = (id?: string | null) =>
    id ? categories.find((c) => c.id === id)?.name ?? "—" : "—";

  // ── Drag handlers ────────────────────────────────────────────────────────
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    if (tab === "catalog") {
      const oldIdx = localOrder.findIndex((p) => p.id === active.id);
      const newIdx = localOrder.findIndex((p) => p.id === over.id);
      setLocalOrder(arrayMove(localOrder, oldIdx, newIdx));
    } else {
      const oldIdx = localFeaturedOrder.findIndex((p) => p.id === active.id);
      const newIdx = localFeaturedOrder.findIndex((p) => p.id === over.id);
      const reordered = arrayMove(localFeaturedOrder, oldIdx, newIdx);
      setLocalFeaturedOrder(reordered);
      // Mirror the featured order back into localOrder
      const featuredIds = reordered.map((p) => p.id);
      const nonFeatured = localOrder.filter((p) => !p.featured);
      setLocalOrder([...reordered, ...nonFeatured]);
    }
  }

  function handleSaveOrder() {
    const toSave = tab === "catalog" ? localOrder : localOrder; // localOrder already mirrors featured changes
    saveOrderMutation.mutate(toSave);
    setIsDragMode(false);
  }

  function handleCancelOrder() {
    setLocalOrder(products);
    setLocalFeaturedOrder(products.filter((p) => p.featured));
    setIsDragMode(false);
  }

  // ── Filtered rows (only in non-drag mode) ───────────────────────────────
  const displayList =
    tab === "featured" ? localFeaturedOrder : localOrder;

  const hasLowStock = (p: ProductWithOrder) => {
    const hasVariants = p.product_variant_groups && p.product_variant_groups.some(g => g.options && g.options.length > 0);
    if (hasVariants) {
      return p.product_variant_groups!.some(g => (g.options ?? []).some(o => o.stock_qty !== null && o.stock_qty > 0 && o.stock_qty < 5));
    }
    return p.stock !== null && p.stock > 0 && p.stock < 5;
  };

  const hasOutOfStock = (p: ProductWithOrder) => {
    const hasVariants = p.product_variant_groups && p.product_variant_groups.some(g => g.options && g.options.length > 0);
    if (hasVariants) {
      return p.product_variant_groups!.some(g => (g.options ?? []).some(o => o.stock_qty === 0));
    }
    return p.stock === 0;
  };

  const hasProblemVariants = (p: ProductWithOrder) => {
    const hasVariants = p.product_variant_groups && p.product_variant_groups.some(g => g.options && g.options.length > 0);
    if (!hasVariants) return false;
    return p.product_variant_groups!.some(g => (g.options ?? []).some(o => o.stock_qty !== null && o.stock_qty < 5));
  };

  const filteredRows = isDragMode
    ? displayList
    : displayList
        .filter((p) => {
          if (filter === "all") return true;
          if (filter === "active") return p.active;
          if (filter === "inactive") return !p.active;
          if (filter === "low-stock") return hasLowStock(p);
          if (filter === "out-of-stock") return hasOutOfStock(p);
          if (filter === "problem-variants") return hasProblemVariants(p);
          return true;
        })
        .filter(
          (p) =>
            !search.trim() ||
            p.name.toLowerCase().includes(search.toLowerCase())
        );

  const counts = {
    all: products.length,
    active: products.filter((p) => p.active).length,
    inactive: products.filter((p) => !p.active).length,
    "low-stock": products.filter(hasLowStock).length,
    "out-of-stock": products.filter(hasOutOfStock).length,
    "problem-variants": products.filter(hasProblemVariants).length,
  };

  return (
    <div className="space-y-4 md:space-y-6 max-w-6xl">
      {/* ── Header ── */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl md:text-3xl mb-0.5">Produtos</h1>
          <p className="text-muted-foreground text-sm">Catálogo da sua loja.</p>
        </div>
        <div className="flex gap-2">
          {isDragMode ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancelOrder}
                disabled={saveOrderMutation.isPending}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleSaveOrder}
                disabled={saveOrderMutation.isPending}
              >
                {saveOrderMutation.isPending ? "Salvando..." : "Salvar ordem"}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setIsDragMode(true)}
                title="Reordenar produtos arrastando"
              >
                <ListOrdered className="h-4 w-4" />
                <span className="hidden sm:inline">Reordenar</span>
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline ml-1">Novo produto</span>
                <span className="sm:hidden ml-1">Novo</span>
              </Button>
            </>
          )}
        </div>
      </header>

      {/* ── Tabs: Catálogo / Destaques ── */}
      <div className="flex gap-1 bg-muted/50 p-1 rounded-lg w-fit">
        <button
          onClick={() => setTab("catalog")}
          className={cn(
            "px-3 md:px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
            tab === "catalog"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Catálogo geral
          <span className="ml-1.5 text-xs opacity-60">({products.length})</span>
        </button>
        <button
          onClick={() => setTab("featured")}
          className={cn(
            "px-3 md:px-4 py-1.5 rounded-md text-sm font-medium transition-colors inline-flex items-center gap-1.5",
            tab === "featured"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
          <span>Destaques</span>
          <span className="text-xs opacity-60">
            ({products.filter((p) => p.featured).length})
          </span>
        </button>
      </div>

      {/* Drag mode banner */}
      {isDragMode && (
        <div className="bg-primary/10 border border-primary/30 rounded-xl px-4 py-3 text-sm text-primary flex items-center gap-2">
          <GripVertical className="h-4 w-4" />
          <span>
            Arraste os produtos para reordenar. Clique em{" "}
            <strong>Salvar ordem</strong> para confirmar.
          </span>
        </div>
      )}

      {/* ── Filters & search — hidden in drag mode ── */}
      {!isDragMode && (
        <div className="space-y-3">
          {/* Filter chips — scrollable on mobile */}
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap scrollbar-none">
            {(
              [
                "all",
                "active",
                "inactive",
                "low-stock",
                "out-of-stock",
                "problem-variants",
              ] as const
            ).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors shrink-0 min-h-[36px] flex items-center gap-1.5 ${
                  filter === f
                    ? "bg-primary text-primary-foreground border-primary font-medium shadow-sm"
                    : f === "problem-variants"
                    ? "border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-500/5 hover:bg-amber-500/10"
                    : "border-border hover:bg-muted bg-background"
                }`}
              >
                {f === "all"
                  ? "Todos"
                  : f === "active"
                  ? "Ativos"
                  : f === "inactive"
                  ? "Inativos"
                  : f === "low-stock"
                  ? "Estoque baixo"
                  : f === "out-of-stock"
                  ? "Esgotados"
                  : (
                    <>
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                      <span>Variações c/ alerta</span>
                    </>
                  )}{" "}
                <span className="opacity-70">({counts[f]})</span>
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar produto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-11"
            />
          </div>
        </div>
      )}

      {/* ── Product list (sortable in drag mode) ── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {filteredRows.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">
            {tab === "featured"
              ? "Nenhum produto marcado como destaque ainda."
              : products.length === 0
              ? "Nenhum produto cadastrado. Crie o primeiro!"
              : "Nenhum produto encontrado."}
          </div>
        ) : isDragMode ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={filteredRows.map((p) => p.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="divide-y divide-border">
                {filteredRows.map((p) => (
                  <SortableProductRow
                    key={p.id}
                    p={p}
                    categoryName={categoryName}
                    onEdit={() => {
                      setEditing(p);
                      setFormOpen(true);
                    }}
                    onDelete={() => setDeleteTarget(p)}
                    onToggleActive={() =>
                      toggleMutation.mutate({ id: p.id, active: p.active })
                    }
                    onToggleFeatured={() =>
                      featuredMutation.mutate({
                        id: p.id,
                        featured: !!p.featured,
                      })
                    }
                    isDragMode={isDragMode}
                    filterMode={filter}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="divide-y divide-border">
            {filteredRows.map((p) => (
              <SortableProductRow
                key={p.id}
                p={p}
                categoryName={categoryName}
                onEdit={() => {
                  setEditing(p);
                  setFormOpen(true);
                }}
                onDelete={() => setDeleteTarget(p)}
                onToggleActive={() =>
                  toggleMutation.mutate({ id: p.id, active: p.active })
                }
                onToggleFeatured={() =>
                  featuredMutation.mutate({
                    id: p.id,
                    featured: !!p.featured,
                  })
                }
                isDragMode={isDragMode}
                filterMode={filter}
              />
            ))}
          </div>
        )}
      </div>

      <ProductFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        storeId={store.id}
        product={editing}
        categories={categories}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.name}" será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleteTarget && deleteMutation.mutate(deleteTarget.id)
              }
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
