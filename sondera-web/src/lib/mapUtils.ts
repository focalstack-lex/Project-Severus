export interface SpatialPin {
  id: string;
  longitude: number;
  latitude: number;
  title: string;
  photoUrl?: string;
  audioUrl?: string;
  category?: string;
  elevation?: number;
  weather?: string;
}

export interface PinMetadataInput {
  locationName: string;
  elevation?: number;
  weather?: string;
}

export function formatPinMetadata(meta: PinMetadataInput): string {
  const parts = [meta.locationName];
  if (meta.elevation !== undefined) parts.push(`${meta.elevation}m`);
  if (meta.weather) parts.push(meta.weather);
  return parts.join(' • ');
}

export function calculateBoundingBox(pins: SpatialPin[]): [number, number, number, number] {
  if (pins.length === 0) {
    return [0, 0, 0, 0];
  }
  let minLng = pins[0].longitude;
  let minLat = pins[0].latitude;
  let maxLng = pins[0].longitude;
  let maxLat = pins[0].latitude;

  for (const pin of pins) {
    if (pin.longitude < minLng) minLng = pin.longitude;
    if (pin.latitude < minLat) minLat = pin.latitude;
    if (pin.longitude > maxLng) maxLng = pin.longitude;
    if (pin.latitude > maxLat) maxLat = pin.latitude;
  }

  return [minLng, minLat, maxLng, maxLat];
}
