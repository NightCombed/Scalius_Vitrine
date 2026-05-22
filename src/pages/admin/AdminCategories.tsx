import { useState } from "react";
import { Plus, Pencil, Trash2, ImageIcon } from "lucide-react";
import { useActiveStore } from "@/hooks/useActiveStore";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Category } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { ImageUpload } from "@/components/ui/image-upload";
import { toast } from "@/hooks/use-toast";

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export default function AdminCategories() {
  const store = useActiveStore();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Category | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);

  const { data: categories = [] } = useQuery({
    queryKey: ["categories", store?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("store_id", store!.id)
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []).map((c: any) => ({
        id: c.id,
        store_id: c.store_id,
        name: c.name,
        slug: c.slug,
        position: c.sort_order ?? 0,
        image_url: c.image_url ?? null,
      })) as Category[];
    },
    enabled: !!store?.id,
  });

  const { data: products = [] } = useQuery({
    queryKey: ["products", store?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, category_id")
        .eq("store_id", store!.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!store?.id,
  });

  const saveMutation = useMutation({
    mutationFn: async ({ id, name, imageUrl }: { id?: string; name: string; imageUrl: string }) => {
      const maxPos = categories.reduce((m, c) => Math.max(m, c.position ?? 0), 0);
      if (id) {
        const { error } = await supabase
          .from("categories")
          .update({ name, slug: slugify(name), image_url: imageUrl || null })
          .eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("categories")
          .insert({
            store_id: store!.id,
            name,
            slug: slugify(name),
            sort_order: maxPos + 1,
            is_active: true,
            image_url: imageUrl || null,
          });
        if (error) throw error;
      }
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["categories", store?.id] });
      toast({ title: id ? "Categoria atualizada" : "Categoria criada" });
      setFormOpen(false);
    },
    onError: () => toast({ title: "Erro ao salvar categoria", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories", store?.id] });
      toast({ title: "Categoria excluída" });
      setDeleteTarget(null);
    },
    onError: () => toast({ title: "Erro ao excluir", variant: "destructive" }),
  });

  if (!store) return null;

  const productCount = (id: string) => products.filter((p: any) => p.category_id === id).length;

  const openCreate = () => {
    setEditing(null);
    setName("");
    setImageUrl("");
    setFormOpen(true);
  };

  const openEdit = (c: Category) => {
    setEditing(c);
    setName(c.name);
    setImageUrl(c.image_url ?? "");
    setFormOpen(true);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { toast({ title: "Nome obrigatório", variant: "destructive" }); return; }
    saveMutation.mutate({ id: editing?.id, name: trimmed, imageUrl });
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl mb-1">Categorias</h1>
          <p className="text-muted-foreground">Organize seu catálogo em seções.</p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4" /> Nova categoria</Button>
      </header>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {categories.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground text-sm">Nenhuma categoria ainda. Crie a primeira!</div>
        ) : (
          <div className="divide-y divide-border">
            {categories.map((c) => (
              <div key={c.id} className="p-4 flex items-center gap-4">
                {/* Thumbnail */}
                <div className="shrink-0 w-10 h-10 rounded-lg overflow-hidden bg-secondary border border-border flex items-center justify-center">
                  {c.image_url ? (
                    <img
                      src={c.image_url}
                      alt={c.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="text-base font-bold text-muted-foreground">
                      {c.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{c.name}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    /{c.slug} · {productCount(c.id)} {productCount(c.id) === 1 ? "produto" : "produtos"}
                  </div>
                </div>
                <Button size="icon" variant="ghost" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => setDeleteTarget(c)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Form Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar categoria" : "Nova categoria"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="cat-name">Nome *</Label>
              <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cat-image">Imagem da categoria</Label>
              <ImageUpload
                id="cat-image"
                bucket="category-images"
                pathPrefix={`${store.id}/${slugify(name) || "categoria"}`}
                value={imageUrl}
                onChange={setImageUrl}
                placeholder="https://..."
                aspect={1}
              />
              <p className="text-xs text-muted-foreground">
                Imagem que aparecerá no site público (recomendado: 200×200px)
              </p>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saveMutation.isPending}>{editing ? "Salvar" : "Criar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir categoria?</AlertDialogTitle>
            <AlertDialogDescription>"{deleteTarget?.name}" será removida. Produtos vinculados ficarão sem categoria.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
