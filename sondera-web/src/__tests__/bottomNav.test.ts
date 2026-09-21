import { test, describe } from 'node:test';
import assert from 'node:assert';
import { getActiveNavClass } from '../lib/navUtils';

describe('Navigation Utils', () => {
  test('returns active styling class for current tab', () => {
    const activeClass = getActiveNavClass('home', 'home');
    assert.ok(activeClass.includes('text-olivePrimary'));
    assert.ok(activeClass.includes('font-semibold'));
  });

  test('returns inactive styling class for other tabs', () => {
    const inactiveClass = getActiveNavClass('home', 'gallery');
    assert.ok(inactiveClass.includes('text-slate-400'));
  });
});
