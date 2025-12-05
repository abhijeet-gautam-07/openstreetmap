"use client";

import React, { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type ParcelRow = {
  id: number;
  geometry: any;
  zoning: string | null;
  usedesc: string | null;
  lat: number | null;
  lon: number | null;
};

const ORIGIN: [number, number] = [33.4484, -112.074];

const FETCH_ZOOM_THRESHOLD = 16;
const DRAW_ZOOM_THRESHOLD = 16;

type ViewType = "street" | "satellite";

export default function OSMParcelMap() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);

  const mapRef = useRef<any>(null);
  const parcelsLayerRef = useRef<any>(null);

  const streetLayerRef = useRef<any>(null);
  const satelliteLayerRef = useRef<any>(null);

  const parcelsRef = useRef<ParcelRow[]>([]);
  const leafletRef = useRef<any>(null);

  // drawing state
  const userPolygonRef = useRef<any>(null);
  const drawingLayerRef = useRef<any>(null);
  const drawPointsRef = useRef<any[]>([]);
  const isDrawingRef = useRef(false);

  const drawButtonElRef = useRef<HTMLAnchorElement | null>(null);

  const showZoomMessageRef = useRef(false);
  const hasUserPolygonRef = useRef(false);

  const redrawParcelsRef = useRef<null | (() => void)>(null);

  const [viewType, setViewType] = useState<ViewType>("satellite");
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showZoomMessage, setShowZoomMessage] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasUserPolygon, setHasUserPolygon] = useState(false);

  // point-in-polygon (lon, lat vs polygon lat/lng)
  const pointInPolygon = (
    lon: number,
    lat: number,
    polygonLatLngs: { lat: number; lng: number }[]
  ): boolean => {
    let inside = false;
    for (let i = 0, j = polygonLatLngs.length - 1; i < polygonLatLngs.length; j = i++) {
      const xi = polygonLatLngs[i].lng;
      const yi = polygonLatLngs[i].lat;
      const xj = polygonLatLngs[j].lng;
      const yj = polygonLatLngs[j].lat;

      const intersect =
        yi > lat !== yj > lat &&
        lon <
          ((xj - xi) * (lat - yi)) / ((yj - yi) || 1e-12) + xi;

      if (intersect) inside = !inside;
    }
    return inside;
  };

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        if (!mapContainerRef.current) return;
        if (typeof window === "undefined") return;

        const L = await import("leaflet");
        leafletRef.current = L;
        if (cancelled) return;

        if (mapRef.current) return;

        const map = L.map(mapContainerRef.current).setView(ORIGIN, 16);

        // base layers
        const streetLayer = L.tileLayer(
          "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
          {
            attribution: "&copy; OpenStreetMap contributors",
            maxZoom: 19,
          }
        );
        const satelliteLayer = L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          {
            attribution: "Tiles © Esri",
            maxZoom: 19,
          }
        ).addTo(map); // default

        streetLayerRef.current = streetLayer;
        satelliteLayerRef.current = satelliteLayer;

        const parcelsLayer = L.layerGroup().addTo(map);
        parcelsLayerRef.current = parcelsLayer;
        mapRef.current = map;

        // helper to enable/disable draw button
        const updateDrawButtonState = () => {
          const btn = drawButtonElRef.current;
          if (!btn) return;
          const disabled =
            showZoomMessageRef.current ||
            hasUserPolygonRef.current ||
            isDrawingRef.current;

          if (disabled) {
            btn.classList.add("leaflet-disabled");
          } else {
            btn.classList.remove("leaflet-disabled");
          }
        };

        // redraw parcels (with optional polygon filter)
        const redrawParcels = (Lmod: typeof import("leaflet")) => {
          if (!parcelsLayerRef.current || !mapRef.current) return;

          const zoom = mapRef.current.getZoom();
          parcelsLayerRef.current.clearLayers();

          if (zoom < DRAW_ZOOM_THRESHOLD) return;

          let filterLatLngs: { lat: number; lng: number }[] | null = null;
          if (userPolygonRef.current) {
            const ll = userPolygonRef.current.getLatLngs();
            if (Array.isArray(ll) && ll.length > 0) {
              filterLatLngs = ll[0] as { lat: number; lng: number }[];
            }
          }

          parcelsRef.current.forEach((p) => {
            if (!p.geometry) return;

            if (filterLatLngs && p.lat != null && p.lon != null) {
              if (!pointInPolygon(p.lon, p.lat, filterLatLngs)) {
                return;
              }
            }

            const gj = Lmod.geoJSON(p.geometry, {
              style: {
                color: "#ea580c",
                weight: 2,
                fillColor: "#fed7aa",
                fillOpacity: 0.6,
              },
            });

            gj.addTo(parcelsLayerRef.current);
          });
        };

        redrawParcelsRef.current = () => {
          if (leafletRef.current) redrawParcels(leafletRef.current);
        };

        // fetch parcels for current viewport (but not while drawing)
        const fetchParcelsForView = async () => {
          if (!mapRef.current) return;

          const zoom = mapRef.current.getZoom();

          if (zoom < FETCH_ZOOM_THRESHOLD) {
            setShowZoomMessage(true);
            showZoomMessageRef.current = true;
            parcelsRef.current = [];
            parcelsLayerRef.current.clearLayers();
            setCount(0);
            updateDrawButtonState();
            return;
          }

          setShowZoomMessage(false);
          showZoomMessageRef.current = false;
          updateDrawButtonState();

          // do NOT fetch while drawing
          if (isDrawingRef.current) return;

          try {
            setLoading(true);
            setErrorMsg(null);

            const bounds = mapRef.current.getBounds();
            const minLat = bounds.getSouth();
            const maxLat = bounds.getNorth();
            const minLon = bounds.getWest();
            const maxLon = bounds.getEast();

            const { data, error } = await supabase
              .from("parcel_info3")
              .select("id, geometry, zoning, usedesc, lat, lon")
              .gt("lat", minLat)
              .lt("lat", maxLat)
              .gt("lon", minLon)
              .lt("lon", maxLon)
              .limit(300);

            if (error) {
              setErrorMsg(error.message);
              parcelsRef.current = [];
              parcelsLayerRef.current.clearLayers();
              setCount(0);
              return;
            }

            const cleaned = (data ?? []).filter(
              (p) => p.geometry
            ) as ParcelRow[];

            parcelsRef.current = cleaned;
            setCount(cleaned.length);

            redrawParcels(leafletRef.current);
          } finally {
            setLoading(false);
          }
        };

        // finish drawing polygon (auto-close, then just redraw from cache)
        const finishDrawing = () => {
          if (!isDrawingRef.current || !leafletRef.current || !mapRef.current)
            return;
          const Lmod = leafletRef.current;
          const mapLocal = mapRef.current;

          isDrawingRef.current = false;
          setIsDrawing(false);
          mapLocal.getContainer().style.cursor = "";
          updateDrawButtonState();

          if (drawPointsRef.current.length < 3) {
            if (drawingLayerRef.current) {
              drawingLayerRef.current.remove();
              drawingLayerRef.current = null;
            }
            drawPointsRef.current = [];
            return;
          }

          const finalPoints =
            drawPointsRef.current.length > 4
              ? drawPointsRef.current.slice(0, 4)
              : drawPointsRef.current;

          if (userPolygonRef.current) {
            userPolygonRef.current.remove();
          }

          const polygon = Lmod.polygon(finalPoints, {
            color: "#22c55e",
            weight: 2,
            fillOpacity: 0.05,
          }).addTo(mapLocal);

          userPolygonRef.current = polygon;
          setHasUserPolygon(true);
          hasUserPolygonRef.current = true;
          updateDrawButtonState();

          if (drawingLayerRef.current) {
            drawingLayerRef.current.remove();
            drawingLayerRef.current = null;
          }

          drawPointsRef.current = [];

          // No new fetch here — just filter existing parcels to polygon
          redrawParcels(Lmod);
        };

        // start drawing (from control button)
        const startDrawing = () => {
          if (
            showZoomMessageRef.current ||
            hasUserPolygonRef.current ||
            isDrawingRef.current
          ) {
            return;
          }
          if (!mapRef.current) return;

          isDrawingRef.current = true;
          setIsDrawing(true);
          mapRef.current.getContainer().style.cursor = "crosshair";
          drawPointsRef.current = [];

          if (drawingLayerRef.current) {
            drawingLayerRef.current.remove();
            drawingLayerRef.current = null;
          }
          updateDrawButtonState();
        };

        // custom draw control (below zoom)
        const DrawControl = L.Control.extend({
          onAdd: () => {
            const container = L.DomUtil.create(
              "div",
              "leaflet-bar leaflet-control"
            );
            const link = L.DomUtil.create(
              "a",
              "",
              container
            ) as HTMLAnchorElement;
            link.href = "#";
            link.title = "Draw polygon";
            link.innerHTML = "▱";

            drawButtonElRef.current = link;
            updateDrawButtonState();

            L.DomEvent.on(link, "click", (e: any) => {
              L.DomEvent.stop(e);
              startDrawing();
            });

            return container;
          },
          onRemove: () => {},
        });

        const drawControl = new DrawControl({ position: "topleft" });
        drawControl.addTo(map);

        // handle clicks to add vertices
        map.on("click", (e: any) => {
          if (!isDrawingRef.current || !leafletRef.current) return;
          const Lmod = leafletRef.current;

          drawPointsRef.current.push(e.latlng);

          if (drawingLayerRef.current) {
            drawingLayerRef.current.setLatLngs(drawPointsRef.current);
          } else {
            drawingLayerRef.current = Lmod.polygon(drawPointsRef.current, {
              color: "#22c55e",
              weight: 2,
              dashArray: "4 2",
              fillOpacity: 0.05,
            }).addTo(map);
          }

          // auto-finish at 4 points
          if (drawPointsRef.current.length >= 4) {
            finishDrawing();
          }
        });

        // optional: double click to finish early
        map.on("dblclick", () => {
          if (isDrawingRef.current) {
            finishDrawing();
          }
        });

        // initial fetch on load
        await fetchParcelsForView();

        // on moveend: fetch only if not drawing
        let timeout: any = null;
        map.on("moveend", () => {
          if (timeout) clearTimeout(timeout);
          timeout = setTimeout(fetchParcelsForView, 200);
        });

        // on zoomend: show popup + redraw, fetch handled by moveend / initial
        map.on("zoomend", () => {
          const z = map.getZoom();
          const show = z < FETCH_ZOOM_THRESHOLD;
          setShowZoomMessage(show);
          showZoomMessageRef.current = show;
          updateDrawButtonState();
          if (!show) {
            // when zoom back in, we can fetch again
            fetchParcelsForView();
          } else {
            if (parcelsLayerRef.current) parcelsLayerRef.current.clearLayers();
          }
        });
      } catch (e) {
        console.error(e);
      }
    }

    init();

    return () => {
      cancelled = true;
      if (mapRef.current) mapRef.current.remove();
    };
  }, []);

  // base layer toggle
  useEffect(() => {
    const map = mapRef.current;
    const street = streetLayerRef.current;
    const sat = satelliteLayerRef.current;
    if (!map || !street || !sat) return;

    if (viewType === "satellite") {
      if (map.hasLayer(street)) map.removeLayer(street);
      if (!map.hasLayer(sat)) sat.addTo(map);
    } else {
      if (map.hasLayer(sat)) map.removeLayer(sat);
      if (!map.hasLayer(street)) street.addTo(map);
    }
  }, [viewType]);

  const handleDeletePolygon = () => {
    if (!mapRef.current) return;

    if (userPolygonRef.current) {
      userPolygonRef.current.remove();
      userPolygonRef.current = null;
    }
    if (drawingLayerRef.current) {
      drawingLayerRef.current.remove();
      drawingLayerRef.current = null;
    }
    drawPointsRef.current = [];
    isDrawingRef.current = false;
    setIsDrawing(false);
    setHasUserPolygon(false);
    hasUserPolygonRef.current = false;

    // clear filter and redraw all fetched parcels
    if (redrawParcelsRef.current) redrawParcelsRef.current();

    const btn = drawButtonElRef.current;
    if (btn) btn.classList.remove("leaflet-disabled");
  };

  return (
    <div className="relative h-screen w-screen">
      {/* MAP */}
      <div ref={mapContainerRef} className="h-full w-full" />

      {/* BOTTOM POPUP */}
      {showZoomMessage && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none">
          <div className="bg-white shadow-lg border border-yellow-400 rounded-md px-4 py-3 flex items-center gap-3 pointer-events-auto">
            <svg
              className="w-6 h-6 text-yellow-500 flex-shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="7" x2="12" y2="13" />
              <circle cx="12" cy="17" r="1" />
            </svg>
            <span className="text-yellow-600 text-sm font-medium">
              Zoom in to view parcel boundaries
            </span>
          </div>
        </div>
      )}

      {/* LEFT DELETE BUTTON */}
      {hasUserPolygon && (
        <div className="absolute top-1/2 left-4 -translate-y-1/2 z-[1000]">
          <button
            onClick={handleDeletePolygon}
            className="bg-white border border-red-300 text-red-600 text-xs font-semibold px-3 py-2 rounded-md shadow-md hover:bg-red-50"
          >
            Delete polygon
          </button>
        </div>
      )}

      {/* TOP-RIGHT CONTROL PANEL */}
      <div className="absolute top-4 right-4 bg-white p-3 rounded-md shadow-lg border border-gray-200 z-[1000] text-xs space-y-2 pointer-events-auto min-w-[210px]">
        <div className="font-semibold text-gray-800 text-sm">Map controls</div>

        {/* Base layer toggle */}
        <div>
          <div className="text-[11px] font-semibold text-gray-500 uppercase mb-1">
            Base layer
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setViewType("street")}
              className={`flex-1 px-2 py-1 rounded-md border text-[11px] ${
                viewType === "street"
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
              }`}
            >
              Street
            </button>
            <button
              onClick={() => setViewType("satellite")}
              className={`flex-1 px-2 py-1 rounded-md border text-[11px] ${
                viewType === "satellite"
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
              }`}
            >
              Satellite
            </button>
          </div>
        </div>

        {/* Status */}
        
        
      </div>
    </div>
  );
}
