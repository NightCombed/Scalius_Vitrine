import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix Leaflet default marker icons in bundlers
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

interface Props {
  lat: number;
  lng: number;
  storeLat?: number;
  storeLng?: number;
  storeRadiusKm?: number;
  draggable?: boolean;
  onPositionChange?: (lat: number, lng: number) => void;
  height?: string;
}

/**
 * Leaflet map that shows a marker (optionally draggable) and optionally a circle for store radius.
 */
export function DeliveryMap({
  lat, lng, storeLat, storeLng, storeRadiusKm,
  draggable = false, onPositionChange, height = "260px",
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [lat, lng],
      zoom: 14,
      scrollWheelZoom: false,
      attributionControl: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
    }).addTo(map);

    // Customer marker
    const marker = L.marker([lat, lng], { draggable }).addTo(map);
    if (draggable && onPositionChange) {
      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        onPositionChange(pos.lat, pos.lng);
      });
    }
    markerRef.current = marker;

    // Store radius circle
    if (storeLat != null && storeLng != null) {
      L.marker([storeLat, storeLng], {
        icon: L.divIcon({
          className: "store-marker",
          html: `<div style="background:hsl(var(--primary));width:12px;height:12px;border-radius:50%;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.3)"></div>`,
          iconSize: [12, 12],
          iconAnchor: [6, 6],
        }),
      }).addTo(map);

      if (storeRadiusKm) {
        const circle = L.circle([storeLat, storeLng], {
          radius: storeRadiusKm * 1000,
          color: "hsl(var(--primary))",
          fillColor: "hsl(var(--primary))",
          fillOpacity: 0.08,
          weight: 1.5,
        }).addTo(map);
        circleRef.current = circle;
      }
    }

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update marker position when lat/lng props change
  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    markerRef.current.setLatLng([lat, lng]);
    mapRef.current.setView([lat, lng], mapRef.current.getZoom());
  }, [lat, lng]);

  return (
    <div
      ref={containerRef}
      style={{ height, width: "100%" }}
      className="rounded-lg overflow-hidden border border-border"
    />
  );
}
