import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, MapPin, Store as StoreIcon, Truck, AlertTriangle, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { useTenant } from "@/contexts/TenantContext";
import { useCart } from "@/contexts/CartContext";
import { useCustomerAuth } from "@/hooks/useCustomerAuth";
import { formatBRL } from "@/lib/mockData";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ShippingRule, DeliveryZone, DistancePricing } from "@/types/database";
import { calculateDistance, calculateDeliveryFee, geocodeAddress, getRoutingData } from "@/lib/distance";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Separator } from "@/components/ui/separator";
import { buildWhatsAppUrl } from "@/components/store/WhatsAppButton";
import { EmptyState } from "@/components/store/EmptyState";
import { cn } from "@/lib/utils";

const baseSchema = z.object({
  postal_code: z.string().trim().regex(/^\d{5}-?\d{3}$/, "CEP inválido"),
  delivery_type: z.enum(["delivery", "pickup", "national_shipping", ""]),
  name: z.string().trim().min(2, "Informe seu nome").max(100),
  phone: z
    .string()
    .trim()
    .min(8, "Telefone inválido")
    .max(20)
    .regex(/^[0-9()+\-\s]+$/, "Use apenas números e ( ) + - "),
  email: z.string().email("E-mail inválido").optional().or(z.literal("")),
  document: z.string().optional().or(z.literal("")),
  pix_name: z.string().trim().max(100).optional(),
  
  street: z.string().trim().max(120).optional(),
  number: z.string().trim().max(20).optional(),
  neighborhood: z.string().trim().max(80).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(2).optional(),
  quadra: z.string().trim().max(20).optional(),
  lote: z.string().trim().max(20).optional(),
  complement: z.string().trim().max(120).optional(),
  reference: z.string().trim().max(120).optional(),
  
  immediate: z.boolean(),
  deliveryDate: z.date().optional(),
  notes: z.string().optional(),
  shipping_service_id: z.number().optional(),
});

const checkoutSchema = baseSchema.superRefine((data, ctx) => {
  if (data.delivery_type === "delivery" || data.delivery_type === "national_shipping") {
    if (!data.number || data.number.length < 1) {
      ctx.addIssue({ code: "custom", path: ["number"], message: "Informe o número" });
    }
  }
  if (data.delivery_type === "national_shipping") {
    if (!data.shipping_service_id) {
      ctx.addIssue({ code: "custom", path: ["shipping_service_id"], message: "Selecione um serviço de entrega" });
    }
    if (!data.email || data.email.trim() === "") {
      ctx.addIssue({ code: "custom", path: ["email"], message: "Email é obrigatório para entrega nacional" });
    }
    if (!data.document || data.document.trim() === "") {
      ctx.addIssue({ code: "custom", path: ["document"], message: "Documento é obrigatório para entrega nacional" });
    }
  }
});

type CheckoutValues = z.infer<typeof checkoutSchema>;

interface AddressData {
  success: boolean;
  street?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  postal_code: string;
}

const norm = (s?: string | null) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

class CheckoutErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: Error | null}> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Checkout rendering error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-destructive max-w-2xl mx-auto mt-10 border border-destructive/20 rounded-xl bg-destructive/5">
          <h2 className="text-xl font-bold flex items-center gap-2 mb-4">
            <AlertTriangle /> Ocorreu um erro ao renderizar o checkout
          </h2>
          <pre className="text-xs bg-background p-4 rounded-md overflow-auto border border-border">
            {this.state.error?.message}
            <br/><br/>
            {this.state.error?.stack}
          </pre>
          <Button className="mt-4" onClick={() => window.location.reload()}>Recarregar página</Button>
        </div>
      );
    }
    return this.props.children;
  }
}

function PublicCheckoutInner() {
  const { store, settings } = useTenant();
  const { items, subtotalCents, notes, setNotes, clear } = useCart();
  const { customer, isAuthenticated, getLastAddress, linkOrder } = useCustomerAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [savedAccountData, setSavedAccountData] = useState<any>(null);
  const [showPrefillPrompt, setShowPrefillPrompt] = useState(false);

  // Progressive Disclosure States
  const [cepValidated, setCepValidated] = useState(false);
  const [addressData, setAddressData] = useState<AddressData | null>(null);
  const [availableDeliveryOptions, setAvailableDeliveryOptions] = useState<string[]>([]);
  const [loadingCep, setLoadingCep] = useState(false);
  const [locating, setLocating] = useState(false);
  const [shippingIntent, setShippingIntent] = useState<"delivery" | "pickup" | null>(null);

  // Local Delivery States
  const shippingMode = settings?.shipping_mode ?? "regions";
  const [distanceFee, setDistanceFee] = useState<{ zoneName: string; zoneId: string; feeCents: number } | null>(null);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [localOutOfRangeMsg, setLocalOutOfRangeMsg] = useState<string | null>(null);
  const [matchedRule, setMatchedRule] = useState<any | null>(null);

  // National Shipping States
  const [nationalShippingOptions, setNationalShippingOptions] = useState<any[]>([]);
  const [nationalShippingError, setNationalShippingError] = useState<string | null>(null);
  const [nationalShippingServiceErrors, setNationalShippingServiceErrors] = useState<any[]>([]);
  const [loadingNationalShipping, setLoadingNationalShipping] = useState(false);
  const [selectedShippingService, setSelectedShippingService] = useState<any | null>(null);

  const form = useForm<CheckoutValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      postal_code: "",
      delivery_type: "",
      name: "",
      email: "",
      document: "",
      phone: "",
      pix_name: "",
      street: "",
      number: "",
      neighborhood: "",
      city: "",
      state: "",
      quadra: "",
      lote: "",
      complement: "",
      reference: "",
      immediate: true,
      notes: notes ?? "",
    },
  });

  // (Pre-fill effect for logged-in customers is placed after handleValidateCEP declaration below)

  const watched = form.watch();
  const deliveryType = watched.delivery_type;

  // Active shipping rules for this store (regions mode)
  const { data: rules = [] } = useQuery<ShippingRule[]>({
    queryKey: ["shipping-regions", store?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shipping_regions").select("*").eq("store_id", store!.id).eq("is_active", true).order("name");
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id, store_id: row.store_id, name: row.name, price_cents: row.fee_cents, active: row.is_active,
      }));
    },
    enabled: !!store?.id && shippingMode === "regions",
  });

  // Delivery zones + pricing (distance mode)
  const { data: zones = [] } = useQuery<(DeliveryZone & { pricing: DistancePricing[] })[]>({
    queryKey: ["checkout-delivery-zones", store?.id],
    queryFn: async () => {
      const { data: zData, error: zErr } = await supabase
        .from("delivery_zones").select("*").eq("store_id", store!.id).eq("is_active", true);
      if (zErr) throw zErr;
      const zoneIds = (zData ?? []).map((z: any) => z.id);
      if (zoneIds.length === 0) return [];
      const { data: pData, error: pErr } = await supabase
        .from("distance_pricing").select("*").in("delivery_zone_id", zoneIds).order("min_distance_km");
      if (pErr) throw pErr;
      return (zData ?? []).map((z: any) => ({
        ...z, pricing: (pData ?? []).filter((p: any) => p.delivery_zone_id === z.id),
      }));
    },
    enabled: !!store?.id && shippingMode === "distance",
  });

  const validateCEP = async (cep: string): Promise<AddressData | { error: string }> => {
    const cleanCep = cep.replace(/\D/g, "");
    if (cleanCep.length !== 8) return { error: "CEP deve ter 8 dígitos" };

    try {
      const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
      const data = await response.json();
      if (data.erro) throw new Error("CEP não encontrado");
      
      return {
        success: true,
        street: data.logradouro,
        neighborhood: data.bairro,
        city: data.localidade,
        state: data.uf,
        postal_code: cleanCep,
      };
    } catch {
      try {
        const response = await fetch(`https://brasilapi.com.br/api/cep/v1/${cleanCep}`);
        const data = await response.json();
        return {
          success: true,
          street: data.street,
          neighborhood: data.neighborhood,
          city: data.city,
          state: data.state,
          postal_code: cleanCep,
        };
      } catch {
        return { error: "CEP inválido ou não encontrado" };
      }
    }
  };

  const calculatePackageDimensions = async () => {
    if (!settings) return null;
    try {
      const productIds = items.map(i => i.productId);
      const { data: products } = await supabase
        .from("products").select("id, weight_kg, width_cm, height_cm, length_cm").in("id", productIds);

      const parseNum = (val: any) => {
        if (val === undefined || val === null || val === "") return 0;
        return parseFloat(val.toString().replace(",", "."));
      };

      let totalWeight = 0, maxWidth = 0, totalHeight = 0, maxLength = 0;
      const defaultWeight = parseNum(settings.default_package_weight_kg) || 0.5;
      const defaultWidth = parseNum(settings.default_package_width_cm) || 15;
      const defaultHeight = parseNum(settings.default_package_height_cm) || 10;
      const defaultLength = parseNum(settings.default_package_length_cm) || 20;

      items.forEach(item => {
        const prod = products?.find(p => p.id === item.productId);
        const w = prod?.weight_kg != null ? parseNum(prod.weight_kg) : defaultWeight;
        const width = prod?.width_cm != null ? parseNum(prod.width_cm) : defaultWidth;
        const height = prod?.height_cm != null ? parseNum(prod.height_cm) : defaultHeight;
        const length = prod?.length_cm != null ? parseNum(prod.length_cm) : defaultLength;
        totalWeight += (w * item.quantity);
        maxWidth = Math.max(maxWidth, width);
        totalHeight += (height * item.quantity); // Sum heights (stacking) to avoid volume underestimation
        maxLength = Math.max(maxLength, length);
      });
      return { weight_kg: totalWeight, width_cm: maxWidth, height_cm: totalHeight, length_cm: maxLength };
    } catch {
      return null;
    }
  };

  const determineAvailableDeliveryOptions = async (address: AddressData) => {
    const options: string[] = ["pickup"]; // Always available
    setDistanceFee(null);
    setLocalOutOfRangeMsg(null);
    setMatchedRule(null);

    // Check Local Delivery
    let hasLocal = false;
    if (shippingMode === "regions" && address.neighborhood) {
      const an = norm(address.neighborhood);
      
      // 1. Try exact match first
      let rule = rules.find((r) => norm(r.name) === an);
      
      // 2. Fallback to partial matches, but pick the most specific (longest name) one
      if (!rule) {
        const potentialMatches = rules.filter((r) => {
          const rn = norm(r.name);
          return rn.includes(an) || an.includes(rn);
        });
        
        if (potentialMatches.length > 0) {
          // Sort by name length descending to get the most specific match
          potentialMatches.sort((a, b) => b.name.length - a.name.length);
          rule = potentialMatches[0];
        }
      }

      if (rule) {
        hasLocal = true;
        setMatchedRule(rule);
      } else {
        setLocalOutOfRangeMsg("Bairro não atendido pela entrega local.");
      }
    } else if (shippingMode === "distance" && address.street && address.city && settings?.latitude && settings?.longitude) {
      // Geocode to calculate distance
      const geoResult = await geocodeAddress({
        street: address.street,
        city: address.city,
        state: address.state || settings.address_state,
        postalcode: address.postal_code
      });
      
      if (geoResult) {
        const straightDist = calculateDistance(settings.latitude, settings.longitude, geoResult.lat, geoResult.lon);
        const route = await getRoutingData(settings.latitude, settings.longitude, geoResult.lat, geoResult.lon);
        const dist = route ? route.distanceKm : straightDist;
        setDistanceKm(dist);

        let bestFee: { zoneName: string; zoneId: string; feeCents: number } | null = null;
        for (const z of zones) {
          if (z.max_distance_km != null && dist > z.max_distance_km) continue;
          const fee = calculateDeliveryFee(dist, route ? route.durationMin : null, z, z.pricing);
          if (fee != null && (!bestFee || fee < bestFee.feeCents)) {
            bestFee = { zoneName: z.name, zoneId: z.id, feeCents: fee };
          }
        }
        if (bestFee) {
          hasLocal = true;
          setDistanceFee(bestFee);
        } else {
          const maxKm = Math.max(...zones.map((z) => z.max_distance_km ?? 0));
          setLocalOutOfRangeMsg(`Entregamos até ${maxKm.toFixed(0)} km. Seu endereço está a ${dist.toFixed(1)} km.`);
        }
      } else {
        setLocalOutOfRangeMsg("Não foi possível calcular a distância para este CEP.");
      }
    }

    if (hasLocal) options.push("delivery");
    if (settings?.national_shipping_enabled) options.push("national_shipping");
    
    setAvailableDeliveryOptions(options);

    // Auto-fetch national shipping options in background if enabled
    if (settings?.national_shipping_enabled) {
      fetchNationalShippingOptions(address.postal_code);
    }
  };

  const fetchNationalShippingOptions = async (cep: string) => {
    setLoadingNationalShipping(true);
    setNationalShippingError(null);
    setNationalShippingOptions([]);
    setNationalShippingServiceErrors([]);
    try {
      const dimensions = await calculatePackageDimensions();
      if (!dimensions) return;
      const payload = { 
        store_id: store!.id, 
        receiver_postal_code: cep, 
        ...dimensions,
        insurance: subtotalCents / 100,
        _ts: Date.now() // Anti-cache timestamp
      };
      const { data, error } = await supabase.functions.invoke("calculate-shipping", { body: payload });
      
      if (error) {
        const msg = (error as any)?.message || "Erro de conexão com o serviço de frete";
        console.error("[calculate-shipping] invoke error:", error);
        setNationalShippingError(msg);
        return;
      }
      if (data?.error) {
        console.error("[calculate-shipping] API error:", data.error);
        setNationalShippingError(data.error);
        return;
      }
      if (data?.services && data.services.length > 0) {
        setNationalShippingOptions(data.services);
      } else {
        console.warn("[calculate-shipping] Resposta sem serviços:", data);
        if (data?.debug_service_errors?.length > 0) {
          console.warn("[calculate-shipping] service errors:", JSON.stringify(data.debug_service_errors, null, 2));
          setNationalShippingServiceErrors(data.debug_service_errors);
          setNationalShippingError(""); // clear generic message, show per-service table
        } else {
          setNationalShippingError("Nenhuma transportadora disponível para este CEP. Verifique se o token do Melhor Envio está configurado corretamente.");
        }
      }
    } catch (err: any) {
      console.error("[calculate-shipping] exception:", err);
      setNationalShippingError(err?.message || "Erro inesperado ao calcular frete");
    } finally {
      setLoadingNationalShipping(false);
    }
  };

  const handleValidateCEP = async (cepValue: string) => {
    setLoadingCep(true);
    form.clearErrors("postal_code");
    
    const result = await validateCEP(cepValue);
    
    if ("error" in result) {
      form.setError("postal_code", { message: result.error });
      setCepValidated(false);
      setLoadingCep(false);
      return;
    }
    
    form.setValue("street", result.street || "");
    form.setValue("neighborhood", result.neighborhood || "");
    form.setValue("city", result.city || "");
    form.setValue("state", result.state || "");
    
    // Clear delivery type if it was previously set, so user is forced to re-evaluate
    form.setValue("delivery_type", "");
    setSelectedShippingService(null);
    form.setValue("shipping_service_id", undefined);
    
    setAddressData(result);
    setCepValidated(true);
    
    await determineAvailableDeliveryOptions(result);
    setLoadingCep(false);
    
    // Smooth scroll to delivery options
    setTimeout(() => {
      document.getElementById("step-delivery")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  const handleCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocalização não suportada no seu navegador");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude: lat, longitude: lng } = pos.coords;
          const res = await fetch(`https://photon.komoot.io/reverse?lon=${lng}&lat=${lat}`);
          if (!res.ok) throw new Error("Erro na busca reversa");
          const data = await res.json();
          if (data.features && data.features.length > 0) {
            const postcode = data.features[0].properties.postcode;
            if (postcode) {
              const clean = postcode.replace(/\D/g, "");
              if (clean.length === 8) {
                form.setValue("postal_code", clean.replace(/^(\d{5})(\d)/, "$1-$2"));
                handleValidateCEP(clean);
                toast.success("CEP localizado com sucesso!");
                return;
              }
            }
          }
          toast.warning("Localização encontrada, mas não foi possível extrair o CEP exato.");
        } catch {
          toast.error("Não foi possível identificar o endereço pela localização");
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocating(false);
        toast.error("Permissão de localização negada ou indisponível.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // ── Draft & Pre-fill logic ────────────────────────────────────────────────
  // 1. Load draft on mount if not authenticated — restore CEP field only, don't auto-fetch freight
  useEffect(() => {
    if (isAuthenticated || !store) return;
    const draft = localStorage.getItem(`checkout_draft_${store.slug}`);
    if (draft) {
      try {
        const parsed = JSON.parse(draft);
        // Only restore basic text fields — don't trigger CEP validation or freight fetch automatically
        // Don't restore delivery_type or shipping intent — user must select mode on each visit
        const safeFields = ["name", "phone", "email", "postal_code", "complement", "notes", "pix_name"];
        safeFields.forEach((k) => {
          if (parsed[k]) form.setValue(k as keyof CheckoutValues, parsed[k] as any);
        });
        // NOTE: shippingIntent is intentionally NOT restored — always starts fresh
      } catch {}
    }
  }, [isAuthenticated, store, form]);

  // 2. Save draft on change if not authenticated
  useEffect(() => {
    if (isAuthenticated || !store) return;
    const subscription = form.watch((value) => {
      localStorage.setItem(`checkout_draft_${store.slug}`, JSON.stringify(value));
    });
    return () => subscription.unsubscribe();
  }, [form.watch, isAuthenticated, store]);

  // 3. Check for last address if authenticated
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    getLastAddress().then((data) => {
      if (cancelled || !data) return;
      if (data.customer?.full_name || data.customer?.phone || data.last_order) {
        setSavedAccountData(data);
        setShowPrefillPrompt(true);
      }
    });
    return () => { cancelled = true; };
  }, [isAuthenticated, getLastAddress]);

  const applyPrefill = () => {
    if (!savedAccountData) return;
    const { customer: profile, last_order } = savedAccountData;
    if (profile?.full_name) form.setValue("name", profile.full_name);
    if (profile?.phone) form.setValue("phone", profile.phone);
    if (profile?.email) form.setValue("email", profile.email);
    if (last_order) {
      if (last_order.national_shipping_cep) {
        setShippingIntent("delivery");
        const cep = last_order.national_shipping_cep.replace(/\D/g, "");
        const formatted = cep.replace(/^(\d{5})(\d)/, "$1-$2");
        form.setValue("postal_code", formatted);
        handleValidateCEP(cep);
      } else if (last_order.address_street) {
        setShippingIntent("delivery");
      }
      if (last_order.address_street) form.setValue("street", last_order.address_street);
      if (last_order.address_number) form.setValue("number", last_order.address_number);
      if (last_order.address_neighborhood) form.setValue("neighborhood", last_order.address_neighborhood);
      if (last_order.address_city) form.setValue("city", last_order.address_city);
      if (last_order.address_state) form.setValue("state", last_order.address_state);
      
      if (last_order.address_complement) {
        const segments = last_order.address_complement.split(", ");
        const complementSegments: string[] = [];
        
        for (const seg of segments) {
          if (seg.startsWith("QD: ")) form.setValue("quadra", seg.replace("QD: ", ""));
          else if (seg.startsWith("LT: ")) form.setValue("lote", seg.replace("LT: ", ""));
          else if (seg.startsWith("Ref: ")) form.setValue("reference", seg.replace("Ref: ", ""));
          else complementSegments.push(seg);
        }
        
        if (complementSegments.length > 0) {
          form.setValue("complement", complementSegments.join(", "));
        }
      }
    }
    setShowPrefillPrompt(false);
    toast.success("Dados preenchidos!");
  };

  // Computed shipping fee
  const shippingFeeCents = deliveryType === "pickup" ? 0
    : deliveryType === "national_shipping" ? Math.round((selectedShippingService?.price || 0) * 100)
    : deliveryType === "delivery" ? (shippingMode === "distance" ? (distanceFee?.feeCents ?? 0) : (matchedRule?.price_cents ?? 0))
    : 0;

  const totalCents = subtotalCents + shippingFeeCents;

  const onSubmit = async (values: CheckoutValues) => {
    setSubmitting(true);
    try {
      const deliveryDate = !values.immediate && values.deliveryDate
        ? values.deliveryDate.toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0];

      const isDelivery = values.delivery_type === "delivery" || values.delivery_type === "national_shipping";
      const finalDeliveryType = values.delivery_type;

      const payload: Record<string, any> = {
        p_store_slug: store!.slug,
        p_customer_id: isAuthenticated && customer ? customer.id : null,
        p_customer_name: values.name,
        p_customer_phone: values.phone,
        p_customer_email: values.email || null,
        p_customer_document: values.document || null,
        p_delivery_type: finalDeliveryType,
        p_delivery_date: deliveryDate,
        p_notes: values.notes || null,
        p_address_street: isDelivery ? (values.street ?? null) : null,
        p_address_number: isDelivery ? (values.number ?? null) : null,
        p_address_neighborhood: isDelivery ? (values.neighborhood ?? null) : null,
        p_address_city: isDelivery ? (values.city ?? null) : null,
        p_address_state: isDelivery ? (values.state ?? null) : null,
        p_national_shipping_cep: values.postal_code ? values.postal_code.replace(/\D/g,"") : null,
        p_address_complement: isDelivery ? (
          [
            values.quadra ? `QD: ${values.quadra}` : null,
            values.lote ? `LT: ${values.lote}` : null,
            values.complement,
            values.reference ? `Ref: ${values.reference}` : null
          ].filter(Boolean).join(", ") || null
        ) : null,
        p_items: items.map((i) => ({
          product_id: i.productId,
          quantity: i.quantity,
          variant_label: i.variantLabel ?? null,
          variant_option_ids: i.variantOptionIds ?? null,
        })),
        p_pix_name: values.pix_name?.trim() || null,
      };

      if (values.delivery_type === "delivery") {
        if (shippingMode === "distance" && distanceFee) {
          payload.p_delivery_zone_id = distanceFee.zoneId;
          payload.p_delivery_zone_name = distanceFee.zoneName;
          payload.p_delivery_distance_km = distanceKm;
          payload.p_shipping_fee_override = distanceFee.feeCents;
        } else if (shippingMode === "regions" && matchedRule) {
          payload.p_region_slug = matchedRule.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
        }
      }
      
      if (values.delivery_type === "national_shipping" && selectedShippingService) {
        payload.p_shipping_fee_override = Math.round(selectedShippingService.price * 100);
        payload.p_shipping_service_id = selectedShippingService.id;
        payload.p_shipping_service_name = selectedShippingService.name;
        payload.p_shipping_company = selectedShippingService.company;
        payload.p_shipping_delivery_time_days = selectedShippingService.delivery_time;
      }

      // Create the order
      const { data, error } = await supabase.rpc("create_public_order", payload);
      if (error) { toast.error("Erro ao criar pedido", { description: error.message }); return; }

      // Clear draft on success
      localStorage.removeItem(`checkout_draft_${store!.slug}`);

      const result = data as { order_id: string; order_number: number };

      // Se o cliente já está logado, vincula o pedido imediatamente à conta dele.
      // Caso contrário, o banner na tela de tracking fará isso se ele criar a conta.
      if (isAuthenticated) {
        linkOrder(result.order_id).catch(() => {});
      }

      // Disparar notificação de novo pedido
      supabase.functions.invoke("send-notification", {
        body: { event: "new_order", order_id: result.order_id },
      }).catch(err => console.error("Notification error:", err));


      // Check if store uses Mercado Pago
      const isMercadoPago = (settings as any)?.payment_provider === "mercadopago";

      if (isMercadoPago) {
        // Generate Pix charge and redirect to payment page
        toast.loading("Gerando cobrança Pix...", { id: "pix-gen" });
        try {
          const { data: pixData, error: pixError } = await supabase.functions.invoke("mercadopago-pix", {
            body: { order_id: result.order_id },
          });

          toast.dismiss("pix-gen");

          if (pixError || !pixData?.qr_code) {
            // Fallback: go to confirmation page showing manual info
            toast.warning("Não foi possível gerar o QR Code automático. Verifique o resumo do pedido.");
            clear();
            navigate(`/loja/${store!.slug}/pedido/${result.order_id}`);
            return;
          }

          // Redirect to the dedicated payment page
          clear();
          navigate(`/loja/${store!.slug}/pagar/${result.order_id}`);
        } catch (pixErr: any) {
          toast.dismiss("pix-gen");
          toast.warning("Erro ao gerar QR Code. Redirecionando para o pedido.");
          clear();
          navigate(`/loja/${store!.slug}/pedido/${result.order_id}`);
        }
      } else {
        // Manual Pix flow — show confirmation with pix key
        toast.success("Pedido enviado!", { description: "Em breve a floricultura entrará em contato." });
        clear();
        navigate(`/loja/${store!.slug}/pedido/${result.order_id}`);
      }
    } catch (err: any) {
      toast.error("Erro inesperado", { description: err?.message ?? "Tente novamente." });
    } finally {
      setSubmitting(false);
    }
  };


  if (!store) return null;

  if (items.length === 0) {
    return (
      <div className="container py-12">
        <EmptyState title="Seu carrinho está vazio" description="Adicione produtos antes de finalizar o pedido." action={<Button asChild><Link to={`/loja/${store.slug}/produtos`}>Ver produtos</Link></Button>} />
      </div>
    );
  }

  return (
    <div className="container py-8 md:py-14 max-w-3xl mx-auto">
      <h1 className="font-serif text-3xl md:text-4xl mb-8 text-center">Finalizar pedido</h1>

      {showPrefillPrompt && (
        <div className="mb-6 rounded-xl border border-primary/20 bg-primary/5 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm animate-in fade-in slide-in-from-top-4 duration-500">
          <div>
            <h3 className="font-semibold text-primary">Usar informações padrões da conta?</h3>
            <p className="text-sm text-primary/80 mt-0.5">
              Podemos preencher o formulário com os dados da sua última compra. Você poderá editá-los livremente.
            </p>
          </div>
          <div className="flex gap-2 shrink-0 w-full sm:w-auto">
            <Button variant="ghost" size="sm" onClick={() => setShowPrefillPrompt(false)} className="w-full sm:w-auto">
              Não, obrigado
            </Button>
            <Button size="sm" onClick={applyPrefill} className="w-full sm:w-auto shadow-sm">
              Preencher dados
            </Button>
          </div>
        </div>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          
          {/* STEP 1: METHOD OF RECEIPT */}
          <section className="rounded-xl border border-border bg-card p-5 md:p-6 space-y-4 shadow-soft transition-all">
            <h2 className="font-serif text-xl flex items-center gap-2">
              <span className="flex items-center justify-center bg-primary text-primary-foreground w-6 h-6 rounded-full text-sm font-bold">1</span>
              Como você quer receber?
            </h2>
            
            <div className="grid sm:grid-cols-2 gap-3">
              <Label
                className={cn(
                  "flex items-center justify-between gap-3 rounded-lg border-2 p-4 cursor-pointer transition-colors",
                  shippingIntent === "delivery" ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/40"
                )}
                onClick={() => {
                  setShippingIntent("delivery");
                  if (form.getValues("delivery_type") === "pickup") {
                    form.setValue("delivery_type", "");
                  }
                }}
              >
                <div className="flex items-center gap-3">
                  <div className={cn("flex-shrink-0 w-4 h-4 rounded-full border flex items-center justify-center transition-colors", shippingIntent === "delivery" ? "border-primary" : "border-muted-foreground")}>
                    {shippingIntent === "delivery" && <div className="w-2 h-2 rounded-full bg-primary" />}
                  </div>
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      <Truck className="h-4 w-4" /> Receber em um endereço
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Entregamos na sua casa ou trabalho
                    </div>
                  </div>
                </div>
              </Label>

              <Label
                className={cn(
                  "flex items-center justify-between gap-3 rounded-lg border-2 p-4 cursor-pointer transition-colors",
                  shippingIntent === "pickup" ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/40"
                )}
                onClick={() => {
                  setShippingIntent("pickup");
                  form.setValue("delivery_type", "pickup");
                  form.clearErrors("postal_code");
                  setCepValidated(false);
                }}
              >
                <div className="flex items-center gap-3">
                  <div className={cn("flex-shrink-0 w-4 h-4 rounded-full border flex items-center justify-center transition-colors", shippingIntent === "pickup" ? "border-primary" : "border-muted-foreground")}>
                    {shippingIntent === "pickup" && <div className="w-2 h-2 rounded-full bg-primary" />}
                  </div>
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      <StoreIcon className="h-4 w-4" /> Retirar na loja
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {settings?.address ?? "Endereço não informado."}
                    </div>
                  </div>
                </div>
                <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">Grátis</span>
              </Label>
            </div>
          </section>

          {/* STEP 2: CEP (ONLY FOR DELIVERY) */}
          {shippingIntent === "delivery" && (
            <section className="rounded-xl border border-border bg-card p-5 md:p-6 space-y-4 shadow-soft animate-in fade-in slide-in-from-top-4 duration-500">
              <h2 className="font-serif text-xl flex items-center gap-2">
                <span className="flex items-center justify-center bg-primary text-primary-foreground w-6 h-6 rounded-full text-sm font-bold">2</span>
                Onde você quer receber?
              </h2>
              
              <FormField
                control={form.control}
                name="postal_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Informe seu CEP</FormLabel>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input 
                          placeholder="00000-000" 
                          maxLength={9} 
                          className="max-w-[200px]"
                          {...field}
                          onChange={(e) => {
                            let v = e.target.value.replace(/\D/g, "");
                            if (v.length > 5) v = v.replace(/^(\d{5})(\d)/, "$1-$2");
                            field.onChange(v);
                            setCepValidated(false);
                            form.setValue("delivery_type", "");
                          }}
                        />
                      </FormControl>
                      <Button
                        type="button"
                        onClick={() => handleValidateCEP(field.value)}
                        disabled={loadingCep || field.value.replace(/\D/g, "").length !== 8}
                      >
                        {loadingCep ? <Loader2 className="h-4 w-4 animate-spin" /> : "Validar"}
                      </Button>
                    </div>
                    <div className="pt-2">
                      <button
                        type="button"
                        disabled={locating}
                        onClick={handleCurrentLocation}
                        className="inline-flex items-center gap-1.5 text-primary hover:text-primary/80 transition-colors text-sm font-medium"
                      >
                        <MapPin className={cn("h-4 w-4", locating && "animate-pulse")} />
                        {locating ? "Buscando localização..." : "Usar minha localização atual"}
                      </button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {cepValidated && addressData?.success && (
                <div className="mt-4 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-100 dark:border-emerald-900 flex items-start gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div className="text-sm text-emerald-800 dark:text-emerald-300">
                    <span className="font-semibold block mb-0.5">Endereço localizado:</span>
                    {addressData.street}, {addressData.neighborhood} <br/>
                    {addressData.city} - {addressData.state}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* STEP 3: DELIVERY OPTIONS */}
          {shippingIntent === "delivery" && cepValidated && (
            <section id="step-delivery" className="rounded-xl border border-border bg-card p-5 md:p-6 space-y-4 shadow-soft animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h2 className="font-serif text-xl flex items-center gap-2">
                <span className="flex items-center justify-center bg-primary text-primary-foreground w-6 h-6 rounded-full text-sm font-bold">3</span>
                Opções de entrega
              </h2>
              
              <FormField
                control={form.control}
                name="delivery_type"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormControl>
                      <RadioGroup
                        value={field.value}
                        onValueChange={field.onChange}
                        className="grid gap-3"
                      >

                        {/* Option 2: Local Delivery */}
                        <Label
                          htmlFor="dt-delivery"
                          className={cn(
                            "flex flex-col gap-3 rounded-lg border-2 p-4 transition-colors",
                            !availableDeliveryOptions.includes("delivery") ? "opacity-60 cursor-not-allowed bg-muted/30" : "cursor-pointer hover:border-primary/40",
                            field.value === "delivery" ? "border-primary bg-primary/5" : "border-border"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <RadioGroupItem id="dt-delivery" value="delivery" disabled={!availableDeliveryOptions.includes("delivery")} />
                              <div>
                                <div className="font-medium flex items-center gap-2">
                                  <Truck className="h-4 w-4" /> Entrega Local
                                </div>
                                <div className="text-xs text-muted-foreground mt-1">
                                  {availableDeliveryOptions.includes("delivery") 
                                    ? (shippingMode === "distance" && distanceFee ? `Distância: ${distanceKm?.toFixed(1)} km` : "Receba rapidamente em seu endereço")
                                    : localOutOfRangeMsg ?? "Não disponível para sua região"}
                                </div>
                              </div>
                            </div>
                            {availableDeliveryOptions.includes("delivery") && (
                              <span className="font-bold">
                                {shippingMode === "distance" && distanceFee ? formatBRL(distanceFee.feeCents) : null}
                                {shippingMode === "regions" && matchedRule ? formatBRL(matchedRule.price_cents) : null}
                              </span>
                            )}
                          </div>
                        </Label>

                        {/* Option 3: National Shipping */}
                        {settings?.national_shipping_enabled && (
                          <Label
                            htmlFor="dt-national"
                            className={cn(
                              "flex flex-col gap-3 rounded-lg border-2 p-4 cursor-pointer transition-colors",
                              field.value === "national_shipping" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                            )}
                          >
                            <div className="flex items-start gap-3">
                              <RadioGroupItem id="dt-national" value="national_shipping" className="mt-1" />
                              <div className="flex-1">
                                <div className="font-medium flex items-center gap-2">
                                  <Truck className="h-4 w-4 text-blue-600" /> Entrega Nacional
                                </div>
                                <div className="text-xs text-muted-foreground mt-1">
                                  Enviamos para todo o Brasil.
                                </div>
                              </div>
                            </div>

                            {field.value === "national_shipping" && (
                              <div className="pl-7 w-full pt-2">
                                {loadingNationalShipping ? (
                                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" /> Calculando fretes...
                                  </div>
                                ) : nationalShippingOptions.length > 0 ? (
                                  <div className="space-y-2 mt-2">
                                    <div className="text-sm font-medium mb-2 text-muted-foreground">Escolha uma transportadora:</div>
                                    <div className="space-y-2">
                                      {nationalShippingOptions.map(option => (
                                        <label
                                          key={option.id}
                                          className={cn(
                                            "flex items-center justify-between p-3 rounded-md border cursor-pointer hover:bg-muted/50 transition-colors bg-background",
                                            selectedShippingService?.id === option.id ? "border-primary bg-primary/5" : "border-border"
                                          )}
                                        >
                                          <div className="flex items-center gap-3">
                                            <input 
                                              type="radio" 
                                              name="shipping_svc_selection" 
                                              checked={selectedShippingService?.id === option.id}
                                              onChange={() => {
                                                setSelectedShippingService(option);
                                                form.setValue("shipping_service_id", option.id, { shouldValidate: true });
                                              }}
                                              className="accent-primary"
                                            />
                                            <div className="flex flex-col">
                                              <span className="font-medium text-sm">{option.name}</span>
                                              <span className="text-xs text-muted-foreground">Prazo: {option.delivery_time} dias úteis</span>
                                            </div>
                                          </div>
                                          <div className="font-semibold">{formatBRL(option.price * 100)}</div>
                                        </label>
                                      ))}
                                    </div>
                                    {form.formState.errors.shipping_service_id && (
                                      <p className="text-[0.8rem] font-medium text-destructive mt-1">
                                        {form.formState.errors.shipping_service_id.message}
                                      </p>
                                    )}
                                  </div>
                                ) : nationalShippingServiceErrors.length > 0 ? (
                                  <div className="space-y-2">
                                    {nationalShippingServiceErrors.every((s: any) => s.error?.includes("(-2)")) ? (
                                      <div className="text-sm bg-destructive/5 border border-destructive/20 rounded p-3 space-y-1">
                                        <p className="font-medium text-destructive flex items-center gap-1.5">
                                          <AlertTriangle className="h-4 w-4" /> Token sem permissão de calcular frete
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                          Gere um novo token no Melhor Envio marcando todas as permissões (especialmente <strong>Calcular frete</strong>) e salve nas Configurações da loja.
                                        </p>
                                      </div>
                                    ) : (
                                      <>
                                        <p className="text-xs font-medium text-destructive flex items-center gap-1.5">
                                          <AlertTriangle className="h-3.5 w-3.5" /> Erros retornados pelo Melhor Envio:
                                        </p>
                                        {nationalShippingServiceErrors.map((svc: any) => (
                                          <div key={svc.id} className="text-xs bg-destructive/5 border border-destructive/20 rounded p-2">
                                            <span className="font-medium">{svc.name}:</span>{" "}
                                            <span className="text-muted-foreground">{svc.error || "Serviço indisponível"}</span>
                                          </div>
                                        ))}
                                      </>
                                    )}
                                  </div>
                                ) : (
                                  <div className="text-sm text-destructive flex items-center gap-1.5 bg-destructive/10 p-3 rounded-md">
                                    <AlertTriangle className="h-4 w-4" />
                                    <span>{nationalShippingError || "Nenhuma opção de frete encontrada para este CEP."}</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </Label>
                        )}
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </section>
          )}

          {/* STEP 4: PERSONAL DATA */}
          {deliveryType && (
            <section className="rounded-xl border border-border bg-card p-5 md:p-6 space-y-4 shadow-soft animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h2 className="font-serif text-xl flex items-center gap-2">
                <span className="flex items-center justify-center bg-primary text-primary-foreground w-6 h-6 rounded-full text-sm font-bold">{shippingIntent === "pickup" ? "2" : "4"}</span>
                Seus dados
              </h2>
              
              <div className="grid sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome completo</FormLabel>
                      <FormControl>
                        <Input placeholder="Como podemos te chamar?" maxLength={100} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telefone / WhatsApp</FormLabel>
                      <FormControl>
                        <Input placeholder="(11) 99999-9999" maxLength={20} inputMode="tel" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {deliveryType === "national_shipping" && (
                <div className="space-y-4 pt-2">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>E-mail *</FormLabel>
                        <FormControl>
                          <Input placeholder="seuemail@exemplo.com" type="email" {...field} />
                        </FormControl>
                        <FormDescription>Necessário para enviar o código de rastreio.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="document"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>CPF ou CNPJ do Destinatário *</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="000.000.000-00" 
                            {...field} 
                            onChange={(e) => {
                              let v = e.target.value.replace(/\D/g, "");
                              if (v.length <= 11) {
                                v = v.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
                              } else {
                                v = v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
                              }
                              field.onChange(v);
                            }}
                          />
                        </FormControl>
                        <FormDescription>Necessário para emissão da etiqueta de envio</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}
            </section>
          )}

          {/* STEP 5: ADDRESS COMPLEMENT */}
          {(deliveryType === "delivery" || deliveryType === "national_shipping") && (
            <section className="rounded-xl border border-border bg-card p-5 md:p-6 space-y-4 shadow-soft animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h2 className="font-serif text-xl flex items-center gap-2">
                <span className="flex items-center justify-center bg-primary text-primary-foreground w-6 h-6 rounded-full text-sm font-bold">5</span>
                Complete o endereço
              </h2>

              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="street"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Rua</FormLabel>
                      <FormControl>
                        <Input {...field} readOnly className="bg-muted/50 cursor-not-allowed" />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Número *</FormLabel>
                        <FormControl>
                          <Input placeholder="Ex: 123" maxLength={20} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="complement"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Complemento</FormLabel>
                        <FormControl>
                          <Input placeholder="Apto 45" maxLength={120} {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="quadra"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Quadra (Opcional)</FormLabel>
                        <FormControl>
                          <Input placeholder="Ex: 103 Norte" maxLength={20} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="lote"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Lote (Opcional)</FormLabel>
                        <FormControl>
                          <Input placeholder="Ex: 05" maxLength={20} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="neighborhood"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bairro</FormLabel>
                      <FormControl>
                        <Input {...field} readOnly className="bg-muted/50 cursor-not-allowed" />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            </section>
          )}

          {/* STEP 6: PIX & NOTES */}
          {deliveryType && (
            <section className="rounded-xl border border-border bg-card p-5 md:p-6 space-y-4 shadow-soft animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h2 className="font-serif text-xl flex items-center gap-2">
                <span className="flex items-center justify-center bg-primary text-primary-foreground w-6 h-6 rounded-full text-sm font-bold">{shippingIntent === "pickup" ? "3" : "6"}</span>
                Detalhes finais
              </h2>

              {settings?.pix_key && (
                <FormField
                  control={form.control}
                  name="pix_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome no Pix (Opcional)</FormLabel>
                      <FormControl>
                        <Input placeholder="Nome igual ao da conta bancária" maxLength={100} {...field} />
                      </FormControl>
                      <FormDescription>Ajuda a loja a identificar seu pagamento.</FormDescription>
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Observações (Opcional)</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Alguma observação para o pedido ou entrega?" className="resize-none" rows={3} {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </section>
          )}

          {/* STEP 6: SUMMARY */}
          {deliveryType && (
            <section className="rounded-xl border border-border bg-card p-5 md:p-6 space-y-4 shadow-soft animate-in fade-in slide-in-from-bottom-4 duration-500 bg-primary/5">
              <h2 className="font-serif text-xl">Resumo do pedido</h2>
              
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal ({items.length} itens)</span>
                  <span>{formatBRL(subtotalCents)}</span>
                </div>
                
                <div className="flex justify-between text-muted-foreground">
                  <span>Frete ({deliveryType === "pickup" ? "Retirada" : deliveryType === "delivery" ? "Entrega Local" : "Entrega Nacional"})</span>
                  <span>{shippingFeeCents > 0 ? formatBRL(shippingFeeCents) : "Grátis"}</span>
                </div>
                
                <Separator className="my-2" />
                
                <div className="flex justify-between font-bold text-lg text-foreground">
                  <span>Total</span>
                  <span className="text-primary">{formatBRL(totalCents)}</span>
                </div>
              </div>

              <Button type="submit" disabled={submitting} className="w-full h-12 text-lg shadow-md mt-4">
                {submitting ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : null}
                Finalizar Pedido
              </Button>
            </section>
          )}
        </form>
      </Form>
    </div>
  );
}

export default function PublicCheckout() {
  return (
    <CheckoutErrorBoundary>
      <PublicCheckoutInner />
    </CheckoutErrorBoundary>
  );
}