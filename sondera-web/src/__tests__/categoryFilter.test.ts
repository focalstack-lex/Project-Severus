import { test, describe } from 'node:test';
import assert from 'node:assert';
import { filterCapsulesByCategory, CapsuleItem } from '../lib/categoryFilter';

describe('Category Filter Utility', () => {
  const mockCapsules: CapsuleItem[] = [
    { id: '1', name: 'Camp Big Sky', category: 'outdoor' },
    { id: '2', name: 'Tokyo Ramen Crawl', category: 'food' },
    { id: '3', name: 'Morning Trail Run', category: 'fitness' },
  ];

  test('returns all capsules when category is "all"', () => {
    const filtered = filterCapsulesByCategory(mockCapsules, 'all');
    assert.strictEqual(filtered.length, 3);
  });

  test('filters capsules strictly by chosen category', () => {
    const filtered = filterCapsulesByCategory(mockCapsules, 'food');
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].name, 'Tokyo Ramen Crawl');
  });
});
