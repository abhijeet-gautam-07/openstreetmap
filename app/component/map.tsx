"use client";

import React, { useEffect, useRef, useState } from "react";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import { OSM, XYZ } from "ol/source"; // XYZ needed for Satellite
import { Style, Icon } from "ol/style";
import { fromLonLat } from "ol/proj";

// Phoenix, USA Coordinates
const ORIGIN_COORDINATES = [-112.0740, 33.4484];

function MapComponent() {
  const mapElement = useRef<HTMLDivElement>(null);
  
  // Refs to toggle visibility efficiently
  const streetLayerRef = useRef<TileLayer<OSM> | null>(null);
  const satelliteLayerRef = useRef<TileLayer<XYZ> | null>(null);

  // State for the toggle
  const [viewType, setViewType] = useState<"street" | "satellite">("street");

  useEffect(() => {
    if (!mapElement.current) return;

    // 1. Create Street Layer (Default Visible)
    const streetLayer = new TileLayer({
      source: new OSM(),
      visible: true,
    });
    streetLayerRef.current = streetLayer;

    // 2. Create Satellite Layer (Default Hidden)
    const satelliteLayer = new TileLayer({
      source: new XYZ({
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attributions: 'Tiles © Esri',
        maxZoom: 17,
      }),
      visible: false,
    });
    satelliteLayerRef.current = satelliteLayer;

    // 3. Create Marker Layer
    const originPoint = fromLonLat(ORIGIN_COORDINATES);
    const markerFeature = new Feature({
      geometry: new Point(originPoint),
    });

    const markerStyle = new Style({
      image: new Icon({
        anchor: [0.5, 1],
        src: "https://openlayers.org/en/latest/examples/data/icon.png",
        scale: 1,
      }),
    });
    markerFeature.setStyle(markerStyle);

    const markerLayer = new VectorLayer({
      source: new VectorSource({
        features: [markerFeature],
      }),
    });

    // 4. Initialize Map
    const map = new Map({
      target: mapElement.current,
      layers: [streetLayer, satelliteLayer, markerLayer],
      view: new View({
        center: originPoint,
        zoom: 17,
      }),
    });

    return () => map.setTarget(undefined);
  }, []);

  // Effect: Handle View Toggle
  useEffect(() => {
    if (streetLayerRef.current && satelliteLayerRef.current) {
      if (viewType === "street") {
        streetLayerRef.current.setVisible(true);
        satelliteLayerRef.current.setVisible(false);
      } else {
        streetLayerRef.current.setVisible(false);
        satelliteLayerRef.current.setVisible(true);
      }
    }
  }, [viewType]);
  

  return (
    <div className="relative h-screen w-screen">
      {/* Map Container */}
      <div ref={mapElement} className="h-full w-full" />

      {/* Toggle Controller */}
      <div className="absolute top-4 right-4 bg-white p-4 rounded-lg shadow-lg z-10 flex flex-col gap-2 min-w-[160px]">
        <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wide border-b pb-2 mb-1">
          Map View
        </h3>
        
        <label className="flex items-center space-x-3 cursor-pointer hover:bg-gray-50 p-1 rounded transition">
          <input
            type="radio"
            name="viewType"
            checked={viewType === "street"}
            onChange={() => setViewType("street")}
            className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300"
          />
          <span className="text-gray-700 font-medium">Street</span>
        </label>

        <label className="flex items-center space-x-3 cursor-pointer hover:bg-gray-50 p-1 rounded transition">
          <input
            type="radio"
            name="viewType"
            checked={viewType === "satellite"}
            onChange={() => setViewType("satellite")}
            className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-gray-300"
          />
          <span className="text-gray-700 font-medium">Satellite</span>
        </label>
      </div>
    </div>
  );
}

export default MapComponent;