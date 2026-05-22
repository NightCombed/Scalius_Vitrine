import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useTenant } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { ProductCard } from "@/components/store/ProductCard";
import { CategoryPills } from "@/components/store/CategoryPills";
import { EmptyState } from "@/components/store/EmptyState";
import type { Product, Category } from "@/types/database";

interface Props {
    byCategory?: boolean;
}

export default function PublicCatalog({ byCategory = false }: Props) {
    const { store, settings } = useTenant();
    const params = useParams<{ catSlug?: string }>();
    const [query, setQuery] = useState("");

    const storeId = store?.id ?? null;
    const catSlug = byCategory ? (params.catSlug ?? null) : null;

    // ── Query: categories (sidebar / pills) ─────────────────────────────────────
    const { data: categories = [] } = useQuery<Category[]>({
        queryKey: ["categories", storeId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("categories")
                .select("*")
                .eq("store_id", storeId!)
                .eq("is_active", true)
                .order("sort_order");
            if (error) throw error;
            return (data ?? []).map((row) => ({
                id: row.id,
                store_id: row.store_id,
                name: row.name,
                slug: row.slug,
                position: row.sort_order,
            }));
        },
        enabled: !!storeId,
    });

    // ── Resolve active category from the fetched list ───────────────────────────
    const activeCategory: Category | null = catSlug
        ? (categories.find((c) => c.slug === catSlug) ?? null)
        : null;

    // ── Query: products ──────────────────────────────────────────────────────────
    const { data: rawProducts = [] } = useQuery<Product[]>({
        queryKey: ["products", storeId, catSlug],
        queryFn: async () => {
            // When filtering by category slug we need a join; use the FK relation.
            // Supabase supports: .eq("categories.slug", catSlug) on a join select.
            let qb = supabase
                .from("products")
                .select(catSlug
                    ? "*, categories!inner(slug), product_variant_groups(id)"
                    : "*, product_variant_groups(id)"
                )
                .eq("store_id", storeId!)
                .eq("is_active", true)
                .order("sort_order", { ascending: true, nullsFirst: false });

            if (catSlug) {
                qb = (qb as typeof qb).eq("categories.slug", catSlug);
            }

            const { data, error } = await qb;
            if (error) throw error;
            return (data ?? []).map((row) => ({
                id: row.id,
                store_id: row.store_id,
                category_id: row.category_id ?? null,
                name: row.name,
                description: row.description ?? undefined,
                price_cents: row.price_cents,
                image_url: row.image_url ?? null,
                active: row.is_active,
                featured: row.is_featured ?? false,
                stock: row.stock_qty ?? null,
                created_at: row.created_at,
                hasVariants: Array.isArray((row as any).product_variant_groups)
                    && (row as any).product_variant_groups.length > 0,
            }));
        },
        enabled: !!storeId,
    });

    // ── Client-side text search + featured split ────────────────────────────────
    const { featuredProducts, regularProducts } = useMemo(() => {
        const showOutOfStock = settings?.show_out_of_stock ?? true;
        const q = query.trim().toLowerCase();
        
        const filteredByStock = rawProducts.filter(p => {
            if (p.stock === 0 && !showOutOfStock) return false;
            return true;
        });

        const filtered = q
            ? filteredByStock.filter(
                (p) =>
                    p.name.toLowerCase().includes(q) ||
                    (p.description ?? "").toLowerCase().includes(q),
            )
            : filteredByStock;
        return {
            featuredProducts: filtered.filter((p) => (p as typeof p & { featured?: boolean }).featured),
            regularProducts: filtered.filter((p) => !(p as typeof p & { featured?: boolean }).featured),
        };
    }, [rawProducts, query]);

    if (!store) return null;

    return (
        <div className="container py-10 md:py-14 space-y-8">
            <div className="space-y-3">
                <h1 className="font-serif text-3xl md:text-4xl">
                    {activeCategory ? activeCategory.name : "Todos os produtos"}
                </h1>
                <p className="text-muted-foreground">
                    Escolha sua flor favorita e adicione ao carrinho.
                </p>
            </div>

            <div className="space-y-4">
                <CategoryPills
                    storeSlug={store.slug}
                    categories={categories}
                    activeSlug={activeCategory?.slug}
                />
                <div className="relative max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value.slice(0, 100))}
                        placeholder="Buscar produtos..."
                        className="pl-9"
                    />
                </div>
            </div>

            {/* ── Destaques ───────────────────────────────────────────────── */}
            {featuredProducts.length > 0 && (
                <div className="space-y-4">
                    <div className="flex items-center gap-3">
                        <h2 className="font-serif text-2xl">Em destaque</h2>
                        <span className="h-px flex-1 bg-border" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        {featuredProducts.map((p) => (
                            <ProductCard key={p.id} product={p} storeSlug={store.slug} />
                        ))}
                    </div>
                </div>
            )}

            {/* ── Catálogo regular ────────────────────────────────────────── */}
            {featuredProducts.length > 0 && regularProducts.length > 0 && (
                <div className="flex items-center gap-3">
                    <h2 className="font-serif text-2xl">Todos os produtos</h2>
                    <span className="h-px flex-1 bg-border" />
                </div>
            )}

            {regularProducts.length === 0 && featuredProducts.length === 0 ? (
                <EmptyState
                    title="Nenhum produto encontrado"
                    description="Tente outra categoria ou ajuste a busca."
                />
            ) : regularProducts.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {regularProducts.map((p) => (
                        <ProductCard key={p.id} product={p} storeSlug={store.slug} />
                    ))}
                </div>
            ) : null}
        </div>
    );
}
