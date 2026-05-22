import { useRef, useState, useEffect } from "react";
import { LayoutGrid, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Category } from "@/types/database";

// Deterministic vibrant color per category name for fallback avatars
function getCategoryColor(name: string): string {
  const colors = [
    "linear-gradient(135deg, hsl(350 80% 58%), hsl(330 85% 48%))",  // rose-pink
    "linear-gradient(135deg, hsl(25 92% 55%), hsl(15 88% 48%))",    // orange-red
    "linear-gradient(135deg, hsl(45 95% 52%), hsl(38 90% 48%))",    // amber-gold
    "linear-gradient(135deg, hsl(155 62% 46%), hsl(168 65% 40%))",  // emerald-teal
    "linear-gradient(135deg, hsl(200 82% 52%), hsl(215 80% 48%))",  // sky-blue
    "linear-gradient(135deg, hsl(260 72% 60%), hsl(275 68% 52%))",  // violet-purple
    "linear-gradient(135deg, hsl(320 77% 56%), hsl(305 72% 50%))",  // pink-magenta
    "linear-gradient(135deg, hsl(175 68% 44%), hsl(188 65% 40%))",  // teal-cyan
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

interface Props {
  categories: Category[];
  activeCatId: string | null;
  onSelect: (id: string | null) => void;
}

export function CategoryChips({ categories, activeCatId, onSelect }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(Math.ceil(scrollLeft + clientWidth) < scrollWidth);
    }
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener("resize", checkScroll);
    return () => window.removeEventListener("resize", checkScroll);
  }, [categories]);

  const scrollByAmount = (dir: "left" | "right") => {
    if (scrollRef.current) {
      const amount = scrollRef.current.clientWidth * 0.5;
      scrollRef.current.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
    }
  };

  if (categories.length === 0) return null;

  return (
    <div className="relative group -mx-6 md:mx-0">
      {/* Desktop Scroll Buttons (hidden on mobile) */}
      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scrollByAmount("left")}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-8 h-8 flex items-center justify-center rounded-full bg-background/90 backdrop-blur-sm border border-border shadow-sm text-foreground hover:bg-secondary hidden md:flex transition-opacity opacity-0 group-hover:opacity-100"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}

      {canScrollRight && (
        <button
          type="button"
          onClick={() => scrollByAmount("right")}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-8 h-8 flex items-center justify-center rounded-full bg-background/90 backdrop-blur-sm border border-border shadow-sm text-foreground hover:bg-secondary hidden md:flex transition-opacity opacity-0 group-hover:opacity-100"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      )}

      {/* Right fade + Visual Hint */}
      <div
        className={cn(
          "pointer-events-none absolute right-0 top-0 bottom-0 w-20 z-10 transition-opacity duration-500 flex items-center justify-end pr-2",
          canScrollRight ? "opacity-100" : "opacity-0"
        )}
        style={{
          background:
            "linear-gradient(to left, hsl(var(--background)) 25%, transparent 100%)",
        }}
      >
        <ChevronRight className="w-4 h-4 text-muted-foreground/60 md:hidden animate-pulse" />
      </div>
      
      {/* Left fade + Visual Hint */}
      <div
        className={cn(
          "pointer-events-none absolute left-0 top-0 bottom-0 w-20 z-10 transition-opacity duration-500 flex items-center justify-start pl-2",
          canScrollLeft ? "opacity-100" : "opacity-0"
        )}
        style={{
          background:
            "linear-gradient(to right, hsl(var(--background)) 25%, transparent 100%)",
        }}
      >
        <ChevronLeft className="w-4 h-4 text-muted-foreground/60 md:hidden animate-pulse" />
      </div>

      <div
        ref={scrollRef}
        onScroll={checkScroll}
        className="flex gap-3 overflow-x-auto py-3 px-6 md:px-0 relative z-0 snap-x snap-proximity md:snap-mandatory"
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {/* ── "Todos" chip ─────────────────────────────────── */}
        <button
          type="button"
          onClick={() => onSelect(null)}
          style={{ scrollSnapAlign: "start" }}
          className={cn(
            "scroll-ml-6 md:scroll-ml-0",
            // base
            "shrink-0 flex items-center gap-2.5 pl-1.5 pr-4 py-1.5 rounded-full",
            "border-2 font-semibold text-sm whitespace-nowrap",
            "transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
            // state
            !activeCatId
              ? "border-primary bg-primary/10 text-primary shadow-md shadow-primary/20"
              : "border-border/60 bg-card text-foreground hover:border-primary/50 hover:shadow-sm"
          )}
        >
          {/* Icon circle */}
          <span
            className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors",
              !activeCatId
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground"
            )}
          >
            <LayoutGrid className="w-5 h-5" />
          </span>
          Todos
        </button>

        {/* ── Category chips ───────────────────────────────── */}
        {categories.map((cat) => {
          const isActive = activeCatId === cat.id;
          const fallbackGradient = getCategoryColor(cat.name);
          const initial = cat.name.charAt(0).toUpperCase();

          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onSelect(isActive ? null : cat.id)}
              style={{ scrollSnapAlign: "start" }}
              className={cn(
                "scroll-ml-6 md:scroll-ml-0",
                // base
                "shrink-0 flex items-center gap-2.5 pl-1.5 pr-4 py-1.5 rounded-full",
                "border-2 font-semibold text-sm whitespace-nowrap",
                "transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                // state
                isActive
                  ? "border-primary bg-primary/10 text-primary shadow-md shadow-primary/20"
                  : "border-border/60 bg-card text-foreground hover:border-primary/50 hover:shadow-sm"
              )}
            >
              {/* Image avatar or gradient fallback */}
              <span className="w-10 h-10 rounded-full overflow-hidden shrink-0 flex items-center justify-center shadow-sm">
                {cat.image_url ? (
                  <img
                    src={cat.image_url}
                    alt={cat.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <span
                    className="w-full h-full flex items-center justify-center text-white text-base font-bold tracking-tight"
                    style={{ background: fallbackGradient }}
                  >
                    {initial}
                  </span>
                )}
              </span>

              {cat.name}
            </button>
          );
        })}
        {/* Extra spacer for right bleed on mobile */}
        <div className="shrink-0 w-8 md:hidden" aria-hidden="true" />
      </div>
    </div>
  );
}
