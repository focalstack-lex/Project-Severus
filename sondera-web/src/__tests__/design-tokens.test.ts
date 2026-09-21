import { test, describe } from 'node:test';
import assert from 'node:assert';
import { themeColors } from '../lib/theme';

describe('Organic Design System Tokens', () => {
  test('defines required olive green, warm cream, and organic color tokens', () => {
    assert.strictEqual(themeColors.olivePrimary, '#4A6741');
    assert.strictEqual(themeColors.creamBackground, '#FDFBF7');
    assert.strictEqual(themeColors.charcoalText, '#1E293B');
    assert.strictEqual(themeColors.amberAccent, '#D97706');
    assert.strictEqual(themeColors.forestTeal, '#1F5F5B');
  });
});
