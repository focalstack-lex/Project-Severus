import { test, describe } from 'node:test';
import assert from 'node:assert';
import { formatSyncQueuePayload, OfflineQueueItem } from '../lib/db';

describe('Offline DB Utilities', () => {
  test('formats offline queue item into PostGIS point payload', () => {
    const item: OfflineQueueItem = {
      id: 'offline-1',
      title: 'Trail Memory',
      latitude: 35.6812,
      longitude: 139.7671,
      capturedAt: '2026-09-21T09:00:00Z',
    };
    const payload = formatSyncQueuePayload(item);
    assert.strictEqual(payload.id, 'offline-1');
    assert.strictEqual(payload.location.type, 'Point');
    assert.deepStrictEqual(payload.location.coordinates, [139.7671, 35.6812]);
  });
});
