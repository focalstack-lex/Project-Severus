import { test, describe } from 'node:test';
import assert from 'node:assert';
import { formatPinMetadata, calculateBoundingBox, SpatialPin } from '../lib/mapUtils';

describe('Map Utilities', () => {
  test('formats pin metadata with elevation and weather correctly', () => {
    const formatted = formatPinMetadata({
      locationName: 'Big Sky Summit',
      elevation: 1850,
      weather: '18C Sunny',
    });
    assert.strictEqual(formatted, 'Big Sky Summit • 1850m • 18C Sunny');
  });

  test('calculates correct spatial bounding box for pin clusters', () => {
    const pins: SpatialPin[] = [
      { id: '1', longitude: 139.7671, latitude: 35.6812, title: 'Pin 1' },
      { id: '2', longitude: 139.7005, latitude: 35.6580, title: 'Pin 2' },
    ];
    const bbox = calculateBoundingBox(pins);
    assert.deepStrictEqual(bbox, [139.7005, 35.6580, 139.7671, 35.6812]);
  });
});
