/**
 * Distance calculation and geocoding utilities for delivery fee system.
 * Uses Haversine formula for distance and Nominatim for geocoding.
 */

/** Haversine formula — calculates distance between two geographic points in km */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

import { DeliveryZone } from "@/types/database";

/** Finds the matching price tier for a given distance, or calculates dynamic fee */
export function calculateDeliveryFee(
  distanceKm: number,
  durationMin: number | null,
  zone: DeliveryZone,
  pricingTable: Array<{
    min_distance_km: number;
    max_distance_km: number;
    price_cents: number;
  }>
): number | null {
  // If automatic mode
  if (zone.pricing_type === "auto") {
    const base = zone.auto_base_fee_cents ?? 0;
    const perKm = zone.auto_price_per_km_cents ?? 0;
    const perMin = zone.auto_price_per_min_cents ?? 0;
    const multiplier = zone.auto_multiplier ?? 1.0;
    const minFee = zone.auto_min_fee_cents ?? 0;

    const calc = base + (distanceKm * perKm) + ((durationMin ?? 0) * perMin);
    const finalVal = Math.round(calc * multiplier);
    return Math.max(finalVal, minFee);
  }

  // Manual mode
  const sorted = [...pricingTable].sort(
    (a, b) => a.min_distance_km - b.min_distance_km
  );
  const range = sorted.find(
    (r) => distanceKm >= r.min_distance_km && distanceKm < r.max_distance_km
  );
  return range?.price_cents ?? null;
}

export interface RoutingResult {
  distanceKm: number;
  durationMin: number;
}

/**
 * Gets real driving distance and time using OSRM.
 */
export async function getRoutingData(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): Promise<RoutingResult | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
      return null;
    }
    const distanceMeters = data.routes[0].distance;
    const durationSeconds = data.routes[0].duration;
    
    return {
      distanceKm: distanceMeters / 1000,
      durationMin: durationSeconds / 60,
    };
  } catch (err) {
    console.error("[getRoutingData] error:", err);
    return null;
  }
}

export interface GeocodingResult {
  lat: number;
  lon: number;
  display_name: string;
}

/**
 * Geocode an address using OpenStreetMap Nominatim (free, 1 req/s limit).
 * Returns the top result or null if not found.
 */
export async function geocodeAddress(
  address: string | { street: string; number?: string; city?: string; state?: string; postalcode?: string; }
): Promise<GeocodingResult | null> {
  const fetchNominatim = async (url: URL) => {
    const res = await fetch(url.toString(), {
      headers: { "Accept-Language": "pt-BR", "User-Agent": "ScaliusVitrine/1.0" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    return {
      lat: parseFloat(data[0].lat),
      lon: parseFloat(data[0].lon),
      display_name: data[0].display_name,
    };
  };

  const validateCity = (result: GeocodingResult | null, targetCity?: string) => {
    if (!result || !targetCity) return result;
    const lowerDisplayName = result.display_name.toLowerCase();
    
    // Normalize city names for comparison (remove accents, etc)
    const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const targetNorm = normalize(targetCity);
    const displayNorm = normalize(lowerDisplayName);
    
    if (displayNorm.includes(targetNorm)) return result;
    
    // Check for "Palmas" specific case if display name includes "Tocantins"
    if (targetNorm === "palmas" && displayNorm.includes("tocantins") && (displayNorm.includes("arse") || displayNorm.includes("arne") || displayNorm.includes("arno") || displayNorm.includes("arso"))) {
       return result;
    }

    return null;
  };

  try {
    let url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");
    url.searchParams.set("countrycodes", "br");

    if (typeof address === "string") {
      if (!address.trim()) return null;
      url.searchParams.set("q", address);
      return await fetchNominatim(url);
    } else {
      const { street, number, city, state, postalcode } = address;
      if (!street?.trim()) return null;
      
      const cleanCep = postalcode?.replace(/\D/g, "");
      const cleanStreet = street.replace(/quadra\s+/gi, "").replace(/lote\s+/gi, "").trim();
      const streetQuery = [number, cleanStreet].filter(Boolean).join(" ");

      console.log(`[geocodeAddress] Searching for: ${streetQuery} in ${city}, CEP: ${cleanCep}`);

      // Attempt 1: CEP + City (Highly accurate if found)
      if (cleanCep) {
        const cepUrl = new URL(url);
        cepUrl.searchParams.set("q", `${cleanCep}, ${city || ""}`);
        const cepRes = await fetchNominatim(cepUrl);
        if (validateCity(cepRes, city)) {
          console.log("[geocodeAddress] Found via CEP");
          return cepRes;
        }
      }

      // Attempt 2: Structured Street Search
      const structuredUrl = new URL(url);
      structuredUrl.searchParams.set("street", streetQuery);
      if (city) structuredUrl.searchParams.set("city", city);
      if (state) structuredUrl.searchParams.set("state", state);
      
      let res = await fetchNominatim(structuredUrl);
      if (validateCity(res, city)) return res;

      // Attempt 3: Palmas Specific Fallback (ARSE/ARNE/etc)
      const palmasMatch = cleanStreet.match(/(arse|arne|arno|arso|arce|acsu|acne|acse|acno)\s*(\d+)/i);
      if (palmasMatch) {
        const blockCode = palmasMatch[0].toUpperCase();
        console.log(`[geocodeAddress] Palmas block detected: ${blockCode}`);
        const blockUrl = new URL(url);
        blockUrl.searchParams.set("q", `${blockCode}, Palmas, TO`);
        res = await fetchNominatim(blockUrl);
        if (validateCity(res, city)) return res;
      }

      // Attempt 4: Freeform search with street + city
      const freeformUrl = new URL(url);
      freeformUrl.searchParams.set("q", `${streetQuery}, ${city || ""}, ${state || ""}`);
      res = await fetchNominatim(freeformUrl);
      if (validateCity(res, city)) return res;

      // Attempt 5: Neighborhood fallback
      if (address.neighborhood) {
        const neighborhoodUrl = new URL(url);
        neighborhoodUrl.searchParams.set("q", `${address.neighborhood}, ${city || ""}`);
        res = await fetchNominatim(neighborhoodUrl);
        if (validateCity(res, city)) return res;
      }

      // Attempt 6: City Center (Last resort)
      console.warn("[geocodeAddress] Falling back to city center");
      const cityUrl = new URL(url);
      cityUrl.searchParams.set("q", `${city || ""}, ${state || ""}`);
      return await fetchNominatim(cityUrl);
    }
  } catch (err) {
    console.error("[geocodeAddress] error:", err);
    return null;
  }
}

/**
 * Build a full address string from parts for geocoding.
 */
export function buildAddressString(parts: {
  street?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
}): string {
  const line1 = [parts.street, parts.number].filter(Boolean).join(", ");
  return [line1, parts.neighborhood, parts.city, parts.state, "Brasil"]
    .filter(Boolean)
    .join(", ");
}

const stateMapping: Record<string, string> = {
  "acre": "AC", "alagoas": "AL", "amapa": "AP", "amazonas": "AM", "bahia": "BA",
  "ceara": "CE", "distrito federal": "DF", "espirito santo": "ES", "goias": "GO",
  "maranhao": "MA", "mato grosso": "MT", "mato grosso do sul": "MS", "minas gerais": "MG",
  "para": "PA", "paraiba": "PB", "parana": "PR", "pernambuco": "PE", "piaui": "PI",
  "rio de janeiro": "RJ", "rio grande do norte": "RN", "rio grande do sul": "RS",
  "rondonia": "RO", "roraima": "RR", "santa catarina": "SC", "sao paulo": "SP",
  "sergipe": "SE", "tocantins": "TO"
};

export function normalizeState(stateName: string): string {
  if (!stateName) return "";
  if (stateName.length === 2) return stateName.toUpperCase();
  
  const normalized = stateName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  return stateMapping[normalized] || stateName.slice(0, 2).toUpperCase();
}

