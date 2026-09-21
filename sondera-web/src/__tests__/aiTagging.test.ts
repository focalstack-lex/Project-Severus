import { test, describe } from 'node:test';
import assert from 'node:assert';
import { generateAutoTags, formatAmbientSoundType } from '../lib/aiTagging';

describe('AI Auto-Tagging Service', () => {
  test('generates auto-tags based on category and title keywords', () => {
    const tags = generateAutoTags('Camp Big Sky Adventure', 'outdoor');
    assert.ok(tags.includes('nature'));
    assert.ok(tags.includes('adventure'));
  });

  test('formats ambient sound classification neatly', () => {
    const label = formatAmbientSoundType('forest_breeze');
    assert.strictEqual(label, 'Forest Breeze');
  });
});
