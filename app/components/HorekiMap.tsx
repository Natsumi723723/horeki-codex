"use client";

import { useEffect, useRef } from "react";
import type { ExploreSpot, GeoPoint } from "../types";
import { splitIntoSegments } from "../lib/geo";

type RouteLayer = {
  points: GeoPoint[];
  muted?: boolean;
};

type Props = {
  currentPosition?: GeoPoint | null;
  routes?: RouteLayer[];
  spots?: ExploreSpot[];
  selectedSpotId?: string | null;
  followCurrent?: boolean;
  compact?: boolean;
  onSpotSelect?: (spot: ExploreSpot) => void;
};

const DEFAULT_CENTER: [number, number] = [35.6814, 139.7667];

export default function HorekiMap({
  currentPosition,
  routes = [],
  spots = [],
  selectedSpotId,
  followCurrent = false,
  compact = false,
  onSpotSelect,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layersRef = useRef<import("leaflet").LayerGroup | null>(null);
  const didFitRef = useRef(false);

  useEffect(() => {
    let disposed = false;
    async function initialize() {
      if (!containerRef.current || mapRef.current) return;
      const L = await import("leaflet");
      if (disposed || !containerRef.current) return;
      const map = L.map(containerRef.current, {
        zoomControl: !compact,
        attributionControl: true,
        preferCanvas: true,
      }).setView(DEFAULT_CENTER, compact ? 13 : 15);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      layersRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setTimeout(() => map.invalidateSize(), 0);
    }
    void initialize();
    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layersRef.current = null;
    };
  }, [compact]);

  useEffect(() => {
    let disposed = false;
    async function redraw() {
      const map = mapRef.current;
      const layers = layersRef.current;
      if (!map || !layers) {
        window.setTimeout(redraw, 80);
        return;
      }
      const L = await import("leaflet");
      if (disposed) return;
      layers.clearLayers();
      const bounds: [number, number][] = [];

      routes.forEach((route) => {
        splitIntoSegments(route.points).forEach((segment) => {
          const positions = segment.map((point) => [point.lat, point.lng] as [number, number]);
          if (positions.length > 1) {
            L.polyline(positions, {
              color: route.muted ? "#806044" : "#A64B3C",
              weight: route.muted ? 4 : 5,
              opacity: route.muted ? 0.52 : 0.9,
              lineCap: "round",
              lineJoin: "round",
            }).addTo(layers);
          }
          bounds.push(...positions);
        });
      });

      spots.forEach((spot) => {
        const emoji = spot.category === "神社・寺" ? "⛩" : spot.category === "史跡" ? "史" : spot.category === "公園・自然" ? "樹" : "文";
        const marker = L.marker([spot.lat, spot.lng], {
          icon: L.divIcon({
            className: "horeki-marker-shell",
            html: `<span class="horeki-spot-marker${selectedSpotId === spot.id ? " is-selected" : ""}">${emoji}</span>`,
            iconSize: [38, 38],
            iconAnchor: [19, 34],
          }),
        }).addTo(layers);
        marker.on("click", () => onSpotSelect?.(spot));
        bounds.push([spot.lat, spot.lng]);
      });

      if (currentPosition) {
        L.circle([currentPosition.lat, currentPosition.lng], {
          radius: currentPosition.accuracy,
          color: "#36566F",
          weight: 1,
          fillColor: "#36566F",
          fillOpacity: 0.1,
        }).addTo(layers);
        L.circleMarker([currentPosition.lat, currentPosition.lng], {
          radius: 8,
          color: "#FAF8F2",
          weight: 3,
          fillColor: "#36566F",
          fillOpacity: 1,
        }).addTo(layers);
        bounds.push([currentPosition.lat, currentPosition.lng]);
        if (followCurrent) map.setView([currentPosition.lat, currentPosition.lng], Math.max(map.getZoom(), 16));
      }

      if (!followCurrent && !didFitRef.current && bounds.length > 1) {
        map.fitBounds(L.latLngBounds(bounds), { padding: compact ? [8, 8] : [42, 42], maxZoom: 16 });
        didFitRef.current = true;
      } else if (!didFitRef.current && bounds.length === 1) {
        map.setView(bounds[0], 16);
        didFitRef.current = true;
      }
      map.invalidateSize();
    }
    void redraw();
    return () => {
      disposed = true;
    };
  }, [currentPosition, routes, spots, selectedSpotId, followCurrent, compact, onSpotSelect]);

  return <div ref={containerRef} className={compact ? "map-canvas compact" : "map-canvas"} aria-label="歩行ルート地図" />;
}
