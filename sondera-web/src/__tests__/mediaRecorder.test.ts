import { test, describe } from 'node:test';
import assert from 'node:assert';
import { getSupportedAudioMimeType, createQuickSnapPayload } from '../lib/mediaRecorder';

describe('Media Recorder Utilities', () => {
  test('returns a non-empty string for supported audio MIME type', () => {
    const mime = getSupportedAudioMimeType();
    assert.strictEqual(typeof mime, 'string');
    assert.ok(mime.length > 0);
  });

  test('creates a valid Quick Snap payload with photo and audio metadata', () => {
    const payload = createQuickSnapPayload({
      title: 'Camp Big Sky',
      latitude: 44.65,
      longitude: -110.50,
      photoBlobSize: 1024,
      audioDurationSec: 2.0,
    });
    assert.strictEqual(payload.title, 'Camp Big Sky');
    assert.strictEqual(payload.latitude, 44.65);
    assert.strictEqual(payload.audioDurationSec, 2.0);
    assert.ok(payload.id.length > 0);
  });
});
