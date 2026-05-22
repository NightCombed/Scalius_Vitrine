import { useEffect, useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ImageUpload } from "@/components/ui/image-upload";
import { Plus, Trash2, X, Layers } from "lucide-react";
import type { Product, Category, ProductVariantGroup, ProductVariantOption } from "@/types/database";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  storeId: string;
  product: Product | null;
  categories: Category[];
}

const NO_CATEGORY = "__none__";

// ── Local types for the in-form variant state ─────────────────────────────────

interface LocalOption {
  /** null = new (not yet saved) */
  id: string | null;
  value: string;
  stock_qty: string; // string input, converted on save
}

interface LocalGroup {
  /** null = new group */
  id: string | null;
  group_name: string;
  options: LocalOption[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const tempId = () => `_tmp_${Math.random().toString(36).slice(2)}`;

function dbGroupsToLocal(groups: ProductVariantGroup[]): LocalGroup[] {
  return groups.map((g) => ({
    id: g.id,
    group_name: g.group_name,
    options: (g.options ?? []).map((o) => ({
      id: o.id,
      value: o.value,
      stock_qty: o.stock_qty === null ? "" : String(o.stock_qty),
    })),
  }));
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ProductFormDialog({ open, onOpenChange, storeId, product, categories }: Props) {
  const queryClient = useQueryClient();

  // — Product fields —
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priceReais, setPriceReais] = useState("");
  const [categoryId, setCategoryId] = useState<string>(NO_CATEGORY);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [stock, setStock] = useState("");
  const [weight, setWeight] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [length, setLength] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);

  // — Variant state —
  const [localGroups, setLocalGroups] = useState<LocalGroup[]>([]);
  const [newGroupName, setNewGroupName] = useState("");
  const [addingGroup, setAddingGroup] = useState(false);
  const [newOptionInput, setNewOptionInput] = useState<Record<string, string>>({});
  const newGroupInputRef = useRef<HTMLInputElement>(null);

  const hasVariants = localGroups.length > 0;

  // — Load product + variants on open —
  useEffect(() => {
    if (!open) return;
    setName(product?.name ?? "");
    setDescription(product?.description ?? "");
    setPriceReais(product ? (product.price_cents / 100).toFixed(2).replace(".", ",") : "");
    setCategoryId(product?.category_id ?? NO_CATEGORY);
    setImageUrls(product?.image_url ? product.image_url.split(',').filter(Boolean) : []);
    setStock(product?.stock != null ? String(product.stock) : "");
    setWeight(product?.weight_kg != null ? String(product.weight_kg) : "");
    setWidth(product?.width_cm != null ? String(product.width_cm) : "");
    setHeight(product?.height_cm != null ? String(product.height_cm) : "");
    setLength(product?.length_cm != null ? String(product.length_cm) : "");
    setActive(product?.active ?? true);
    setNewGroupName("");
    setAddingGroup(false);
    setNewOptionInput({});

    // Fetch existing variant groups for this product
    if (product?.id) {
      supabase
        .from("product_variant_groups")
        .select("*, product_variant_options(*)")
        .eq("product_id", product.id)
        .order("sort_order")
        .then(({ data, error }) => {
          if (error || !data) { setLocalGroups([]); return; }
          const groups: ProductVariantGroup[] = data.map((g: any) => ({
            id: g.id,
            product_id: g.product_id,
            store_id: g.store_id,
            group_name: g.group_name,
            sort_order: g.sort_order,
            created_at: g.created_at,
            options: (g.product_variant_options ?? [])
              .sort((a: any, b: any) => a.sort_order - b.sort_order)
              .map((o: any) => ({
                id: o.id, group_id: o.group_id, store_id: o.store_id,
                value: o.value, stock_qty: o.stock_qty ?? null,
                sort_order: o.sort_order, created_at: o.created_at,
              } satisfies ProductVariantOption)),
          }));
          setLocalGroups(dbGroupsToLocal(groups));
        });
    } else {
      setLocalGroups([]);
    }
  }, [open, product]);

  // — Variant mutation helpers —

  const addGroup = () => {
    const trimmed = newGroupName.trim();
    if (!trimmed) return;
    setLocalGroups((prev) => [
      ...prev,
      { id: null, group_name: trimmed, options: [] },
    ]);
    setNewGroupName("");
    setAddingGroup(false);
  };

  const removeGroup = (idx: number) => {
    setLocalGroups((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateGroupName = (idx: number, value: string) => {
    setLocalGroups((prev) =>
      prev.map((g, i) => (i === idx ? { ...g, group_name: value } : g))
    );
  };

  const addOption = (groupIdx: number) => {
    const key = String(groupIdx);
    const val = (newOptionInput[key] ?? "").trim();
    if (!val) return;
    setLocalGroups((prev) =>
      prev.map((g, i) =>
        i !== groupIdx
          ? g
          : {
              ...g,
              options: [...g.options, { id: null, value: val, stock_qty: "" }],
            }
      )
    );
    setNewOptionInput((prev) => ({ ...prev, [key]: "" }));
  };

  const removeOption = (groupIdx: number, optIdx: number) => {
    setLocalGroups((prev) =>
      prev.map((g, i) =>
        i !== groupIdx ? g : { ...g, options: g.options.filter((_, j) => j !== optIdx) }
      )
    );
  };

  const updateOptionStock = (groupIdx: number, optIdx: number, val: string) => {
    setLocalGroups((prev) =>
      prev.map((g, i) =>
        i !== groupIdx
          ? g
          : {
              ...g,
              options: g.options.map((o, j) =>
                j !== optIdx ? o : { ...o, stock_qty: val }
              ),
            }
      )
    );
  };

  // ── Submit ────────────────────────────────────────────────────────────────────
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    const cents = Math.round(parseFloat(priceReais.replace(",", ".")) * 100);
    if (!Number.isFinite(cents) || cents < 0) {
      toast({ title: "Preço inválido", variant: "destructive" });
      return;
    }

    const slugify = (s: string) =>
      s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    const payload = {
      store_id: storeId,
      name: trimmedName,
      slug: slugify(trimmedName),
      description: description.trim() || null,
      price_cents: cents,
      category_id: categoryId === NO_CATEGORY ? null : categoryId,
      image_url: imageUrls.filter(Boolean).join(',') || null,
      // Only save global stock if product has NO variants
      stock_qty: hasVariants ? null : (stock.trim() === "" ? null : Number(stock)),
      weight_kg: weight.trim() === "" ? null : Number(weight.replace(",", ".")),
      width_cm: width.trim() === "" ? null : Number(width),
      height_cm: height.trim() === "" ? null : Number(height),
      length_cm: length.trim() === "" ? null : Number(length),
      is_active: active,
    };

    setSaving(true);
    try {
      let productId: string;

      if (product) {
        const { error } = await supabase.from("products").update(payload).eq("id", product.id);
        if (error) throw error;
        productId = product.id;
        toast({ title: "Produto atualizado" });
      } else {
        const { data, error } = await supabase.from("products").insert([payload]).select("id").single();
        if (error) throw error;
        productId = data.id;
        toast({ title: "Produto criado" });
      }

      // ── Sync variant groups ────────────────────────────────────────────────
      // Delete all existing groups (cascade deletes options too)
      if (product?.id) {
        await supabase.from("product_variant_groups").delete().eq("product_id", product.id);
      }

      // Re-insert groups + options in order
      for (let gi = 0; gi < localGroups.length; gi++) {
        const g = localGroups[gi];
        const { data: gRow, error: gErr } = await supabase
          .from("product_variant_groups")
          .insert({ product_id: productId, store_id: storeId, group_name: g.group_name, sort_order: gi })
          .select("id")
          .single();
        if (gErr) throw gErr;

        const optRows = g.options.map((o, oi) => ({
          group_id: gRow.id,
          store_id: storeId,
          value: o.value,
          stock_qty: o.stock_qty.trim() === "" ? null : Number(o.stock_qty),
          sort_order: oi,
        }));

        if (optRows.length > 0) {
          const { error: oErr } = await supabase.from("product_variant_options").insert(optRows);
          if (oErr) throw oErr;
        }
      }
      // ─────────────────────────────────────────────────────────────────────

      queryClient.invalidateQueries({ queryKey: ["products", storeId] });
      queryClient.invalidateQueries({ queryKey: ["product-variants"] });
      onOpenChange(false);
    } catch (err: any) {
      console.error(err);
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product ? "Editar produto" : "Novo produto"}</DialogTitle>
          <DialogDescription>Preencha os dados do produto da sua loja.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">

          {/* ── Name ── */}
          <div className="space-y-2">
            <Label htmlFor="p-name">Nome *</Label>
            <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </div>

          {/* ── Description ── */}
          <div className="space-y-2">
            <Label htmlFor="p-desc">Descrição</Label>
            <Textarea id="p-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={500} />
          </div>

          {/* ── Price + Stock ── */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="p-price">Preço (R$) *</Label>
              <Input id="p-price" inputMode="decimal" placeholder="0,00" value={priceReais} onChange={(e) => setPriceReais(e.target.value)} />
            </div>
            {/* Global stock only shown when no variants */}
            {!hasVariants && (
              <div className="space-y-2">
                <Label htmlFor="p-stock">Estoque</Label>
                <Input id="p-stock" type="number" min={0} placeholder="—" value={stock} onChange={(e) => setStock(e.target.value)} />
              </div>
            )}
            {hasVariants && (
              <div className="space-y-2">
                <Label className="text-muted-foreground">Estoque</Label>
                <div className="h-10 px-3 rounded-md border border-border bg-muted/40 flex items-center text-sm text-muted-foreground">
                  Definido por variante
                </div>
              </div>
            )}
          </div>

          {/* ── Shipping dimensions ── */}
          <div className="grid grid-cols-4 gap-2 py-2 border-y border-border/50">
            <div className="space-y-2 col-span-1">
              <Label htmlFor="p-weight" className="text-[10px] uppercase text-muted-foreground">Peso (kg)</Label>
              <Input id="p-weight" placeholder="0.3" value={weight} onChange={(e) => setWeight(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-2 col-span-1">
              <Label htmlFor="p-width" className="text-[10px] uppercase text-muted-foreground">Larg. (cm)</Label>
              <Input id="p-width" type="number" placeholder="11" value={width} onChange={(e) => setWidth(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-2 col-span-1">
              <Label htmlFor="p-height" className="text-[10px] uppercase text-muted-foreground">Alt. (cm)</Label>
              <Input id="p-height" type="number" placeholder="2" value={height} onChange={(e) => setHeight(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-2 col-span-1">
              <Label htmlFor="p-length" className="text-[10px] uppercase text-muted-foreground">Comp. (cm)</Label>
              <Input id="p-length" type="number" placeholder="16" value={length} onChange={(e) => setLength(e.target.value)} className="h-8 text-xs" />
            </div>
            <p className="col-span-4 text-[10px] text-muted-foreground italic">Se vazio, usa os valores padrão da loja.</p>
          </div>

          {/* ── Category ── */}
          <div className="space-y-2">
            <Label>Categoria</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger><SelectValue placeholder="Sem categoria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CATEGORY}>Sem categoria</SelectItem>
                {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* ── Images ── */}
          <div className="space-y-3">
            <div>
              <Label>Imagens do produto</Label>
              <p className="text-xs text-muted-foreground mt-1 mb-2">
                Dica: É preferível colar URLs de imagens externas da internet em vez de fazer upload, para economizar espaço no banco de dados.
              </p>
            </div>
            <div className="space-y-3">
              {imageUrls.map((url, index) => (
                <div key={index} className="flex gap-2 items-start relative border p-3 rounded-md bg-muted/10">
                  <div className="flex-1">
                    <ImageUpload
                      bucket="product-images"
                      pathPrefix={`${storeId}/${product?.id || 'new'}-${index}`}
                      value={url}
                      onChange={(newUrl) => {
                        const newUrls = [...imageUrls];
                        newUrls[index] = newUrl;
                        setImageUrls(newUrls);
                      }}
                      placeholder="https://..."
                      aspect={4/3}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive h-10 w-10 absolute -top-2 -right-2 bg-background border shadow-sm rounded-full"
                    onClick={() => setImageUrls(imageUrls.filter((_, i) => i !== index))}
                    title="Remover imagem"
                  >
                    ×
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={() => setImageUrls([...imageUrls, ""])} className="w-full border-dashed">
                + Adicionar imagem
              </Button>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* ── Variants ── */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          <div className="space-y-3 rounded-md border border-border p-4 bg-muted/10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-sm">Variantes</span>
                {hasVariants && (
                  <span className="text-xs text-muted-foreground">({localGroups.length} grupo{localGroups.length !== 1 ? "s" : ""})</span>
                )}
              </div>
              {!addingGroup && (
                <Button type="button" variant="ghost" size="sm" className="gap-1 h-7 text-xs" onClick={() => { setAddingGroup(true); setTimeout(() => newGroupInputRef.current?.focus(), 50); }}>
                  <Plus className="h-3.5 w-3.5" /> Adicionar grupo
                </Button>
              )}
            </div>

            {/* New group input */}
            {addingGroup && (
              <div className="flex gap-2">
                <Input
                  ref={newGroupInputRef}
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder='Ex: "Tamanho", "Cor"'
                  className="h-8 text-sm"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); addGroup(); }
                    if (e.key === "Escape") { setAddingGroup(false); setNewGroupName(""); }
                  }}
                />
                <Button type="button" size="sm" className="h-8" onClick={addGroup}>OK</Button>
                <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => { setAddingGroup(false); setNewGroupName(""); }}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Existing groups */}
            {localGroups.length === 0 && !addingGroup && (
              <p className="text-xs text-muted-foreground">
                Sem variantes. Clique em "Adicionar grupo" para criar opções como Tamanho, Cor, etc.
              </p>
            )}

            {localGroups.map((group, gi) => {
              const inputKey = String(gi);
              return (
                <div key={gi} className="rounded-md border border-border bg-background p-3 space-y-3">
                  {/* Group header */}
                  <div className="flex items-center gap-2">
                    <Input
                      value={group.group_name}
                      onChange={(e) => updateGroupName(gi, e.target.value)}
                      className="h-7 text-sm font-medium flex-1"
                      placeholder="Nome do grupo"
                    />
                    <button
                      type="button"
                      onClick={() => removeGroup(gi)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      title="Remover grupo"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Options */}
                  <div className="space-y-2">
                    {group.options.map((opt, oi) => (
                      <div key={oi} className="flex items-center gap-2">
                        {/* Option chip */}
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-secondary text-secondary-foreground text-sm font-medium min-w-[60px]">
                          {opt.value}
                          <button type="button" onClick={() => removeOption(gi, oi)} className="hover:text-destructive transition-colors">
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                        {/* Stock for this option */}
                        <div className="flex items-center gap-1.5 flex-1">
                          <Input
                            type="number"
                            min={0}
                            placeholder="Estoque (vazio = ilimitado)"
                            value={opt.stock_qty}
                            onChange={(e) => updateOptionStock(gi, oi, e.target.value)}
                            className="h-7 text-xs"
                          />
                        </div>
                      </div>
                    ))}

                    {/* Add option input */}
                    <div className="flex gap-2">
                      <Input
                        value={newOptionInput[inputKey] ?? ""}
                        onChange={(e) =>
                          setNewOptionInput((prev) => ({ ...prev, [inputKey]: e.target.value }))
                        }
                        placeholder='Digitar opção (ex: "M") e pressionar Enter'
                        className="h-7 text-xs flex-1"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); addOption(gi); }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs px-2"
                        onClick={() => addOption(gi)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {group.options.length === 0 && (
                      <p className="text-[11px] text-muted-foreground">Nenhuma opção adicionada ainda.</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Active toggle ── */}
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <Label htmlFor="p-active" className="cursor-pointer">Produto ativo</Label>
              <p className="text-xs text-muted-foreground">Visível na loja pública</p>
            </div>
            <Switch id="p-active" checked={active} onCheckedChange={setActive} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Salvando…" : (product ? "Salvar" : "Criar")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
