import { useState, useMemo } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ShoppingBag, XCircle, AlertTriangle, ChevronLeft, ChevronRight, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useQuery } from "@tanstack/react-query";
import { useTenant } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { formatBRL } from "@/lib/mockData";
import { useCart } from "@/contexts/CartContext";
import { Button } from "@/components/ui/button";
import { QuantityStepper } from "@/components/store/QuantityStepper";
import { EmptyState } from "@/components/store/EmptyState";
import { toast } from "sonner";
import type { Product, ProductVariantGroup, ProductVariantOption } from "@/types/database";
import { getProductImages } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { getStoreLink } from "@/lib/tenant";

export default function PublicProductDetail() {
    const { store } = useTenant();
    const { productId } = useParams<{ productId: string }>();
    const navigate = useNavigate();
    const { add } = useCart();
    const [qty, setQty] = useState(1);
    const [activeImg, setActiveImg] = useState(0);

    // touch/swipe state
    const [touchStartX, setTouchStartX] = useState<number | null>(null);

    // Variant selection: { groupId -> selectedOptionId }
    const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});

    // ── Fetch product ─────────────────────────────────────────────────────────
    const { data: product = null, isLoading: loadingProduct } = useQuery<Product | null>({
        queryKey: ["product", store?.id, productId],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("products")
                .select("*")
                .eq("store_id", store!.id)
                .eq("id", productId!)
                .eq("is_active", true)
                .maybeSingle();
            if (error) throw error;
            if (!data) return null;
            return {
                id: data.id,
                store_id: data.store_id,
                category_id: data.category_id ?? null,
                name: data.name,
                description: data.description ?? undefined,
                price_cents: data.price_cents,
                image_url: data.image_url ?? null,
                active: data.is_active,
                stock: data.stock_qty ?? null,
                created_at: data.created_at,
            };
        },
        enabled: !!store?.id && !!productId,
    });

    // ── Fetch variant groups + options ────────────────────────────────────────
    const { data: variantGroups = [] } = useQuery<ProductVariantGroup[]>({
        queryKey: ["product-variants", productId],
        queryFn: async () => {
            const { data: groups, error: gErr } = await supabase
                .from("product_variant_groups")
                .select("*")
                .eq("product_id", productId!)
                .order("sort_order");
            if (gErr) throw gErr;
            if (!groups || groups.length === 0) return [];

            const groupIds = groups.map((g) => g.id);
            const { data: opts, error: oErr } = await supabase
                .from("product_variant_options")
                .select("*")
                .in("group_id", groupIds)
                .order("sort_order");
            if (oErr) throw oErr;

            return groups.map((g) => ({
                id: g.id,
                product_id: g.product_id,
                store_id: g.store_id,
                group_name: g.group_name,
                sort_order: g.sort_order,
                created_at: g.created_at,
                options: (opts ?? [])
                    .filter((o) => o.group_id === g.id)
                    .map((o) => ({
                        id: o.id,
                        group_id: o.group_id,
                        store_id: o.store_id,
                        value: o.value,
                        stock_qty: o.stock_qty ?? null,
                        sort_order: o.sort_order,
                        created_at: o.created_at,
                    } satisfies ProductVariantOption)),
            }));
        },
        enabled: !!productId,
    });

    const hasVariants = variantGroups.length > 0;

    // ── Derived variant state ─────────────────────────────────────────────────
    const allGroupsSelected = useMemo(() => {
        if (!hasVariants) return true;
        return variantGroups.every((g) => !!selectedOptions[g.id]);
    }, [variantGroups, selectedOptions, hasVariants]);

    const selectedVariantLabel = useMemo(() => {
        if (!hasVariants) return undefined;
        return variantGroups
            .map((g) => {
                const optId = selectedOptions[g.id];
                const opt = g.options?.find((o) => o.id === optId);
                return opt ? `${g.group_name}: ${opt.value}` : null;
            })
            .filter(Boolean)
            .join(" | ");
    }, [variantGroups, selectedOptions, hasVariants]);

    const selectedVariantOptionIds = useMemo(() => {
        return Object.values(selectedOptions).filter(Boolean);
    }, [selectedOptions]);

    /** For products with variants, stock is determined by the selected option(s) */
    const effectiveOutOfStock = useMemo(() => {
        if (!hasVariants) return product?.stock === 0;
        if (!allGroupsSelected) return false; // can't know until all are selected
        // Check if any selected option is at 0 stock
        return variantGroups.some((g) => {
            const optId = selectedOptions[g.id];
            const opt = g.options?.find((o) => o.id === optId);
            return opt ? opt.stock_qty === 0 : false;
        });
    }, [hasVariants, allGroupsSelected, variantGroups, selectedOptions, product?.stock]);

    const images = getProductImages(product?.image_url);

    const prevImage = () => setActiveImg((i) => (i > 0 ? i - 1 : images.length - 1));
    const nextImage = () => setActiveImg((i) => (i < images.length - 1 ? i + 1 : 0));

    const handleTouchStart = (e: React.TouchEvent) => {
        setTouchStartX(e.touches[0].clientX);
    };
    const handleTouchEnd = (e: React.TouchEvent) => {
        if (touchStartX === null) return;
        const diff = touchStartX - e.changedTouches[0].clientX;
        if (Math.abs(diff) > 40) {
            diff > 0 ? nextImage() : prevImage();
        }
        setTouchStartX(null);
    };

    // ── Add to cart ───────────────────────────────────────────────────────────
    const handleAdd = () => {
        if (effectiveOutOfStock) return;
        if (hasVariants && !allGroupsSelected) {
            toast.error("Escolha uma opção em cada campo antes de adicionar.");
            return;
        }
        add(
            {
                productId: product!.id,
                name: product!.name,
                unit_price_cents: product!.price_cents,
                image_url: images[0] ?? null,
                variantLabel: selectedVariantLabel || undefined,
                variantOptionIds: selectedVariantOptionIds.length > 0 ? selectedVariantOptionIds : undefined,
                hasVariants: hasVariants || undefined,
            },
            qty
        );
        const description = selectedVariantLabel
            ? `${qty}× ${product!.name} — ${selectedVariantLabel}`
            : `${qty}× ${product!.name}`;
        toast.success("Adicionado ao carrinho", { description });
    };

    const handleBuyNow = () => {
        if (effectiveOutOfStock) return;
        if (hasVariants && !allGroupsSelected) {
            toast.error("Escolha uma opção em cada campo antes de continuar.");
            return;
        }
        handleAdd();
        navigate(getStoreLink("checkout", store!.slug));
    };

    if (!store || loadingProduct) {
        return (
            <div className="min-h-[60vh] grid place-items-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (!product) {
        return (
            <div className="container py-16">
                <EmptyState
                    title="Produto não encontrado"
                    description="Este produto pode ter sido removido ou está indisponível."
                    action={
                        <Button asChild>
                            <Link to={getStoreLink("", store.slug)}>Voltar ao catálogo</Link>
                        </Button>
                    }
                />
            </div>
        );
    }

    return (
        <div className="container py-8 md:py-14">
            <Button
                variant="ghost"
                onClick={() => navigate(-1)}
                className="mb-6 -ml-2 gap-2"
            >
                <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>

            <div className="grid lg:grid-cols-2 gap-8 lg:gap-12">
                {/* ── Image Gallery ── */}
                <div className="space-y-3">
                    {/* Main image / carousel */}
                    <div
                        className="aspect-square rounded-2xl bg-gradient-soft grid place-items-center overflow-hidden shadow-soft relative select-none"
                        onTouchStart={handleTouchStart}
                        onTouchEnd={handleTouchEnd}
                    >
                        {images.length > 0 ? (
                            <>
                                <img
                                    src={images[activeImg]}
                                    alt={`${product.name} - foto ${activeImg + 1}`}
                                    className="h-full w-full object-cover transition-opacity duration-300"
                                />
                                {/* Prev / Next arrows — only when multiple images */}
                                {images.length > 1 && (
                                    <>
                                        <button
                                            onClick={prevImage}
                                            className="absolute left-3 top-1/2 -translate-y-1/2 bg-background/80 backdrop-blur-sm border border-border rounded-full p-2 shadow-md hover:bg-background transition-colors"
                                        >
                                            <ChevronLeft className="h-4 w-4" />
                                        </button>
                                        <button
                                            onClick={nextImage}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 bg-background/80 backdrop-blur-sm border border-border rounded-full p-2 shadow-md hover:bg-background transition-colors"
                                        >
                                            <ChevronRight className="h-4 w-4" />
                                        </button>
                                        {/* Dot indicators */}
                                        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                                            {images.map((_, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => setActiveImg(i)}
                                                    className={cn(
                                                        "h-2 rounded-full transition-all duration-200",
                                                        i === activeImg
                                                            ? "w-5 bg-primary"
                                                            : "w-2 bg-background/70 hover:bg-background"
                                                    )}
                                                />
                                            ))}
                                        </div>
                                    </>
                                )}
                            </>
                        ) : (
                            <ShoppingBag className="h-32 w-32 text-primary/30" />
                        )}
                    </div>

                    {/* Thumbnail strip — only when > 1 image */}
                    {images.length > 1 && (
                        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
                            {images.map((src, i) => (
                                <button
                                    key={i}
                                    onClick={() => setActiveImg(i)}
                                    className={cn(
                                        "flex-shrink-0 h-16 w-16 rounded-lg overflow-hidden border-2 transition-all duration-150",
                                        i === activeImg
                                            ? "border-primary shadow-sm"
                                            : "border-transparent opacity-60 hover:opacity-90"
                                    )}
                                >
                                    <img src={src} alt={`Miniatura ${i + 1}`} className="h-full w-full object-cover" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* ── Info + Actions ── */}
                <div className="space-y-6">
                    <div className="space-y-3">
                        <div className="flex items-center gap-3 flex-wrap">
                            <h1 className="font-serif text-3xl md:text-5xl leading-tight">{product.name}</h1>
                            {effectiveOutOfStock && (
                                <Badge variant="destructive" className="px-3 py-1 text-sm gap-1.5">
                                    <XCircle className="h-3.5 w-3.5" /> Esgotado
                                </Badge>
                            )}
                        </div>
                        <p className={`font-serif text-3xl ${effectiveOutOfStock ? "text-muted-foreground line-through" : "text-primary"}`}>
                            {formatBRL(product.price_cents)}
                        </p>
                    </div>

                    {effectiveOutOfStock && (
                        <Alert variant="destructive" className="bg-destructive/5 border-destructive/20">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>Produto Indisponível</AlertTitle>
                            <AlertDescription>
                                {hasVariants
                                    ? "Esta opção está esgotada. Tente selecionar outra."
                                    : "No momento este produto está esgotado. Entre em contato com a loja."}
                            </AlertDescription>
                        </Alert>
                    )}

                    {product.description && (
                        <p className="text-muted-foreground leading-relaxed">{product.description}</p>
                    )}

                    {/* ── Variant Selectors ── */}
                    {hasVariants && (
                        <div className="space-y-4">
                            {variantGroups.map((group) => (
                                <div key={group.id} className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium">{group.group_name}</span>
                                        {selectedOptions[group.id] && (
                                            <span className="text-sm text-muted-foreground">
                                                — {group.options?.find((o) => o.id === selectedOptions[group.id])?.value}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {(group.options ?? []).map((opt) => {
                                            const isSelected = selectedOptions[group.id] === opt.id;
                                            const isOutOfStock = opt.stock_qty === 0;
                                            return (
                                                <button
                                                    key={opt.id}
                                                    type="button"
                                                    disabled={isOutOfStock}
                                                    onClick={() =>
                                                        setSelectedOptions((prev) => ({
                                                            ...prev,
                                                            [group.id]: isSelected ? "" : opt.id,
                                                        }))
                                                    }
                                                    className={cn(
                                                        "relative px-4 py-2 rounded-lg border text-sm font-medium transition-all duration-150",
                                                        isSelected
                                                            ? "border-primary bg-primary text-primary-foreground shadow-sm"
                                                            : isOutOfStock
                                                            ? "border-border bg-muted text-muted-foreground cursor-not-allowed opacity-50"
                                                            : "border-border bg-background hover:border-primary hover:text-primary"
                                                    )}
                                                >
                                                    {isSelected && (
                                                        <Check className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />
                                                    )}
                                                    {opt.value}
                                                    {isOutOfStock && (
                                                        <span className="ml-1.5 text-xs">(esgotado)</span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}

                            {/* Subtle validation hint */}
                            {!allGroupsSelected && (
                                <p className="text-xs text-muted-foreground">
                                    Escolha uma opção em cada campo acima para adicionar ao carrinho.
                                </p>
                            )}
                        </div>
                    )}

                    <div className="space-y-4 pt-2">
                        <div className="flex items-center gap-4">
                            <span className="text-sm text-muted-foreground">Quantidade</span>
                            <QuantityStepper value={qty} onChange={setQty} />
                        </div>

                        <div className="grid sm:grid-cols-2 gap-3">
                            <Button
                                size="lg"
                                variant="outline"
                                onClick={handleAdd}
                                disabled={effectiveOutOfStock || (hasVariants && !allGroupsSelected)}
                            >
                                <ShoppingBag className="h-4 w-4" />
                                {effectiveOutOfStock ? "Indisponível" : "Adicionar"}
                            </Button>
                            <Button
                                size="lg"
                                onClick={handleBuyNow}
                                disabled={effectiveOutOfStock || (hasVariants && !allGroupsSelected)}
                            >
                                {effectiveOutOfStock ? "Avisar quando chegar" : "Comprar agora"}
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
