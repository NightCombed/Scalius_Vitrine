import { useMemo, useState, useRef } from "react";
import { Search, Clock, MapPin, Store, ChevronLeft, ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useTenant } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { ProductCard } from "@/components/store/ProductCard";
import { EmptyState } from "@/components/store/EmptyState";
import { WhatsAppButton } from "@/components/store/WhatsAppButton";
import { CategoryChips } from "@/components/store/CategoryPills";
import { cn } from "@/lib/utils";
import type { Product, Category } from "@/types/database";

// ── Helpers ─────────────────────────────────────────────────────────────────

function SectionDivider({ label, showHint }: { label: string; showHint?: boolean }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <h2 className="font-serif text-2xl md:text-3xl shrink-0">{label}</h2>
      <span className="h-px flex-1 bg-border" />
      {showHint && (
        <span className="text-[10px] font-bold tracking-[0.2em] text-muted-foreground/40 md:hidden uppercase flex items-center gap-1.5">
          Arraste
          <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
        </span>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function PublicStoreHome() {
  const { store, settings } = useTenant();
  const [query, setQuery] = useState("");
  const [activeCatId, setActiveCatId] = useState<string | null>(null);
  const catalogRef = useRef<HTMLElement>(null);
  const featuredScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollFeaturedLeft, setCanScrollFeaturedLeft] = useState(false);
  const [canScrollFeaturedRight, setCanScrollFeaturedRight] = useState(false);

  const checkFeaturedScroll = () => {
    if (featuredScrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = featuredScrollRef.current;
      setCanScrollFeaturedLeft(scrollLeft > 0);
      setCanScrollFeaturedRight(Math.ceil(scrollLeft + clientWidth) < scrollWidth);
    }
  };

  const scrollFeaturedBy = (dir: "left" | "right") => {
    if (featuredScrollRef.current) {
      const amount = featuredScrollRef.current.clientWidth * 0.75;
      featuredScrollRef.current.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
    }
  };

  const storeId = store?.id ?? null;

  // ── Categories ─────────────────────────────────────────────────────────────
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
        image_url: row.image_url ?? null,
      }));
    },
    enabled: !!storeId,
  });

  // ── Products ───────────────────────────────────────────────────────────────
  const { data: rawProducts = [], isLoading: loadingProducts } = useQuery<Product[]>({
    queryKey: ["products", storeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("store_id", storeId!)
        .eq("is_active", true)
        .order("sort_order", { ascending: true, nullsFirst: false });
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
      }));
    },
    enabled: !!storeId,
  });

  // ── Derived data ───────────────────────────────────────────────────────────
  const featuredProducts = useMemo(
    () => {
      const showOutOfStock = settings?.show_out_of_stock ?? true;
      return rawProducts.filter((p) => {
        if (!(p as Product & { featured?: boolean }).featured) return false;
        if (p.stock === 0 && !showOutOfStock) return false;
        return true;
      });
    },
    [rawProducts, settings?.show_out_of_stock],
  );

  const catalogProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    const showOutOfStock = settings?.show_out_of_stock ?? true;

    return rawProducts.filter((p) => {
      // 1. Stock Filter
      if (p.stock === 0 && !showOutOfStock) return false;

      // 2. Search Filter
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q);

      // 3. Category Filter
      const matchesCat = !activeCatId || p.category_id === activeCatId;

      return matchesSearch && matchesCat;
    });
  }, [rawProducts, query, activeCatId, settings?.show_out_of_stock]);

  // Check scroll when featured products change
  useMemo(() => {
    // Timeout to allow DOM to render before checking
    setTimeout(checkFeaturedScroll, 100);
  }, [featuredProducts]);

  if (!store) return (
    <div className="min-h-screen grid place-items-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
  );

  const displayName = settings?.display_name || store.name;
  const tagline = settings?.tagline;
  const whatsapp = settings?.whatsapp;
  const address = settings?.address;
  const openingHours = settings?.opening_hours;

  return (
    <>
      {/* ── HERO ──────────────────────────────────────────────────────────── */}
      <header className="relative bg-background">
        {/* Banner Section */}
        <div className="w-full h-[140px] md:h-[200px] overflow-hidden bg-secondary/30">
          {settings?.banner_url ? (
            <img 
              src={settings.banner_url} 
              alt="Banner da loja" 
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-secondary/50" />
          )}
        </div>

        <div className="container relative">
          {/* Profile/Logo cutout */}
          <div className="absolute -top-10 md:-top-12 left-4 md:left-8">
            <div className="w-[80px] h-[80px] md:w-[100px] md:h-[100px] rounded-full border-4 border-background bg-background shadow-lg overflow-hidden flex items-center justify-center">
              {settings?.logo_url ? (
                <img 
                  src={settings.logo_url} 
                  alt={displayName} 
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-primary/10 text-primary">
                  <Store className="h-8 w-8 md:h-10 md:w-10" />
                </div>
              )}
            </div>
          </div>

          {/* Content area */}
          <div className="pt-12 md:pt-16 pb-8 space-y-4">
            <div className="space-y-1">
              <h1 className="text-2xl md:text-[28px] font-medium text-foreground leading-tight">
                {displayName}
              </h1>
              {tagline && (
                <p className="text-sm text-muted-foreground max-w-2xl">{tagline}</p>
              )}
            </div>

            {/* Info structured row */}
            {(openingHours || address) && (
              <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                {openingHours && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 shrink-0 text-primary" />
                    <span>{openingHours}</span>
                  </div>
                )}
                {address && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 shrink-0 text-primary" />
                    <span>{address}</span>
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-3 pt-2">
              {whatsapp && (
                <WhatsAppButton phone={whatsapp} variant="inline" />
              )}
              <button
                type="button"
                onClick={() =>
                  catalogRef.current?.scrollIntoView({ behavior: "smooth" })
                }
                className="px-6 py-2.5 rounded-full border border-border text-sm font-medium hover:bg-secondary transition-all active:scale-95"
              >
                Ver catálogo ↓
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── DESTAQUES ─────────────────────────────────────────────────────── */}
      {featuredProducts.length > 0 && (
        <section className="bg-secondary/20 border-y border-border/40 pt-10 pb-4 md:pt-12 md:pb-6 overflow-hidden relative group">
          <div className="container relative">
            <SectionDivider label="Destaques" showHint />

            {/* Desktop Scroll Buttons (hidden on mobile) */}
            {canScrollFeaturedLeft && (
              <button
                type="button"
                onClick={() => scrollFeaturedBy("left")}
                className="absolute -left-4 top-[calc(50%+24px)] -translate-y-1/2 z-20 w-10 h-10 flex items-center justify-center rounded-full bg-background border border-border shadow-md text-foreground hover:bg-secondary hidden md:flex transition-opacity opacity-0 group-hover:opacity-100"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}
            
            {canScrollFeaturedRight && (
              <button
                type="button"
                onClick={() => scrollFeaturedBy("right")}
                className="absolute -right-4 top-[calc(50%+24px)] -translate-y-1/2 z-20 w-10 h-10 flex items-center justify-center rounded-full bg-background border border-border shadow-md text-foreground hover:bg-secondary hidden md:flex transition-opacity opacity-0 group-hover:opacity-100"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            )}

            {/* Right fade + Visual Hint */}
            <div
              className={cn(
                "pointer-events-none absolute right-0 top-0 bottom-0 w-24 z-10 transition-opacity duration-500 flex items-center justify-end pr-2 md:hidden",
                canScrollFeaturedRight ? "opacity-100" : "opacity-0"
              )}
              style={{
                background: "linear-gradient(to left, hsl(var(--secondary) / 0.15) 20%, transparent 100%)",
              }}
            >
              <ChevronRight className="w-5 h-5 text-muted-foreground/40 animate-pulse" />
            </div>

            {/* Left fade + Visual Hint */}
            <div
              className={cn(
                "pointer-events-none absolute left-0 top-0 bottom-0 w-24 z-10 transition-opacity duration-500 flex items-center justify-start pl-2 md:hidden",
                canScrollFeaturedLeft ? "opacity-100" : "opacity-0"
              )}
              style={{
                background: "linear-gradient(to right, hsl(var(--secondary) / 0.15) 20%, transparent 100%)",
              }}
            >
              <ChevronLeft className="w-5 h-5 text-muted-foreground/40 animate-pulse" />
            </div>

            {/* Carousel restricted to container width on desktop, full-bleed on mobile */}
            <div
              ref={featuredScrollRef}
              onScroll={checkFeaturedScroll}
              className="flex gap-4 overflow-x-auto pb-4 pt-1 snap-x snap-proximity md:snap-mandatory -mx-6 px-6 md:mx-0 md:px-0"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}
            >
              {featuredProducts.map((p) => (
                <div key={p.id} className="snap-start scroll-ml-6 md:scroll-ml-0 shrink-0 w-[80vw] max-w-xs md:max-w-sm min-w-0">
                  <div className="w-full h-full">
                    <ProductCard product={p} storeSlug={store.slug} />
                  </div>
                </div>
              ))}
              {/* Extra spacer for right bleed on mobile */}
              <div className="shrink-0 w-8 md:hidden" aria-hidden="true" />
            </div>
          </div>
        </section>
      )}

      {/* ── CATEGORIAS ────────────────────────────────────────────────────── */}
      {categories.length > 0 && (
        <section className="container pt-0 pb-4 border-b border-border/30">
          <SectionDivider label="Categorias" showHint />
          <CategoryChips
            categories={categories}
            activeCatId={activeCatId}
            onSelect={setActiveCatId}
          />
        </section>
      )}

      {/* ── CATÁLOGO COMPLETO ─────────────────────────────────────────────── */}
      <section ref={catalogRef} className="container pb-20 space-y-6 pt-6">
        <SectionDivider label="Nosso Catálogo" />

        {/* Search + active filter indicator */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value.slice(0, 100))}
              placeholder="Buscar produtos..."
              className="pl-9"
            />
          </div>

          {/* Active category badge */}
          {activeCatId && (() => {
            const cat = categories.find(c => c.id === activeCatId);
            return cat ? (
              <button
                type="button"
                onClick={() => setActiveCatId(null)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"
              >
                {cat.name}
                <span className="ml-0.5 text-primary/70">×</span>
              </button>
            ) : null;
          })()}
        </div>

        {/* Grid */}
        {loadingProducts ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-border bg-card overflow-hidden animate-pulse"
              >
                <div className="aspect-[4/3] bg-secondary" />
                <div className="p-5 space-y-3">
                  <div className="h-5 rounded bg-secondary w-3/4" />
                  <div className="h-4 rounded bg-secondary w-full" />
                  <div className="h-4 rounded bg-secondary w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : catalogProducts.length === 0 ? (
          <EmptyState
            title="Nenhum produto encontrado"
            description={
              query || activeCatId
                ? "Tente outra categoria ou ajuste a busca."
                : "Esta loja ainda não possui produtos disponíveis."
            }
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {catalogProducts.map((p) => (
              <ProductCard key={p.id} product={p} storeSlug={store.slug} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
