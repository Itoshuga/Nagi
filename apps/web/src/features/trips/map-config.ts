const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() ?? '';
// Mapbox officially supports these raster tiles in Leaflet. Keep the existing
// engine, marker grouping, bounds and touch controls; no second map SDK is needed.
export const tripTileProvider = {
  url: `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/512/{z}/{x}/{y}?access_token=${encodeURIComponent(token)}`,
  attribution:
    '© <a href="https://www.mapbox.com/about/maps/" target="_blank" rel="noreferrer">Mapbox</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> · <a href="https://apps.mapbox.com/feedback/" target="_blank" rel="noreferrer">Améliorer cette carte</a>',
  maxZoom: 20,
} as const;
