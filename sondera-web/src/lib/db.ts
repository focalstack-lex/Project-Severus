export interface OfflineQueueItem {
  id: string;
  title: string;
  latitude: number;
  longitude: number;
  capturedAt: string;
}

export function formatSyncQueuePayload(item: OfflineQueueItem) {
  return {
    id: item.id,
    title: item.title,
    location: {
      type: 'Point',
      coordinates: [item.longitude, item.latitude],
    },
    captured_at: item.capturedAt,
  };
}
