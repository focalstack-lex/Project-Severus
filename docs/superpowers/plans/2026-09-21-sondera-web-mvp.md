# Sondera Web MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a web-first spatial memory & activity map application for Sondera with a minimalist organic UI theme inspired by reference designs (olive green, soft warm cream, pill chips, floating bottom action bar, and MapLibre GL 3D vector map).

**Architecture:** Next.js (React + TypeScript) client with MapLibre GL JS WebGL map canvas, Web MediaRecorder API for Quick Snaps, Tailwind CSS with custom organic tokens, and IndexedDB local-first caching.

**Tech Stack:** Next.js, React 19, TypeScript, Tailwind CSS, MapLibre GL JS, Framer Motion, Lucide Icons, idb (IndexedDB).

**Spec:** [docs/superpowers/specs/2026-09-21-sondera-web-design.md](file:///C:/Users/User/Documents/Severus/docs/superpowers/specs/2026-09-21-sondera-web-design.md)

---

## Global Constraints

* Zero emojis in UI/UX components, pill tags, badges, buttons, notifications, or logs.
* Zero em-dashes in UI copy, documentation, or code comments.
* Omnichannel responsive design (Mobile 375px to Ultra-wide 1440px+).
* Minimalist organic UI aesthetic: Olive green (`#4A6741`), soft warm cream (`#FDFBF7`), dark charcoal typography (`#1E293B`), warm amber accents (`#D97706`).

## Review Focus

* Map rendering failure on devices without WebGL: fallback gracefully to static map view.
* Camera/Microphone permission rejection during Quick Snap: render user-friendly permission error prompt.
* Audio recording failure on mobile Safari/iOS: validate MediaRecorder mimeType fallbacks (`audio/mp4` / `audio/webm`).
* Dense pin clustering performance: ensure map markers cluster smoothly above 50 pins.
* Offline capability: verify IndexedDB syncs stored Quick Snaps once network is restored.

---

### Task 1: Project Scaffolding & Minimalist Organic Design System

**Files:**
- Create: `sondera-web/package.json`
- Create: `sondera-web/tailwind.config.ts`
- Create: `sondera-web/src/app/globals.css`
- Create: `sondera-web/src/app/layout.tsx`
- Create: `sondera-web/src/app/page.tsx`
- Test: `sondera-web/src/__tests__/design-tokens.test.ts`

**Interfaces:**
- Consumes: None (Root Scaffolding)
- Produces: Base Next.js app structure, organic design tokens (colors, typography, rounded card utilities), global layout wrapper.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { themeColors } from '../lib/theme';

describe('Organic Design System Tokens', () => {
  it('defines required olive green and warm cream color tokens', () => {
    expect(themeColors.olivePrimary).toBe('#4A6741');
    expect(themeColors.creamBackground).toBe('#FDFBF7');
    expect(themeColors.charcoalText).toBe('#1E293B');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run sondera-web/src/__tests__/design-tokens.test.ts`
Expected: FAIL with "Cannot find module ../lib/theme"

- [ ] **Step 3: Write minimal implementation**

Create `sondera-web/src/lib/theme.ts` with color tokens:
```typescript
export const themeColors = {
  olivePrimary: '#4A6741',
  oliveDark: '#385031',
  creamBackground: '#FDFBF7',
  creamCard: '#F7F4EC',
  charcoalText: '#1E293B',
  amberAccent: '#D97706',
};
```

Set up `tailwind.config.ts` extending colors and `rounded-3xl` radii.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run sondera-web/src/__tests__/design-tokens.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add sondera-web/
git commit -m "feat: scaffold sondera-web with minimalist organic design system"
```

---

### Task 2: Spatial Map Canvas Component (`<MapCanvas />`)

**Files:**
- Create: `sondera-web/src/components/MapCanvas.tsx`
- Create: `sondera-web/src/lib/mapUtils.ts`
- Test: `sondera-web/src/__tests__/mapUtils.test.ts`

**Interfaces:**
- Consumes: `SpatialPin[]` data array.
- Produces: Interactive WebGL map canvas with custom organic vector markers, polyline route tracks, and marker click handlers.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { calculateClusterBounds, formatPinMetadata } from '../lib/mapUtils';

describe('Map Utilities', () => {
  it('formats pin metadata correctly for spatial popups', () => {
    const formatted = formatPinMetadata({
      locationName: 'Shibuya Crossing',
      elevation: 45,
      weather: '21C Clear',
    });
    expect(formatted).toBe('Shibuya Crossing • 45m • 21C Clear');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run sondera-web/src/__tests__/mapUtils.test.ts`
Expected: FAIL with "formatPinMetadata not defined"

- [ ] **Step 3: Write minimal implementation**

Implement `formatPinMetadata` in `sondera-web/src/lib/mapUtils.ts`:
```typescript
export interface PinMetadata {
  locationName: string;
  elevation?: number;
  weather?: string;
}

export function formatPinMetadata(meta: PinMetadata): string {
  const parts = [meta.locationName];
  if (meta.elevation !== undefined) parts.push(`${meta.elevation}m`);
  if (meta.weather) parts.push(meta.weather);
  return parts.join(' • ');
}
```

Implement `<MapCanvas />` using MapLibre GL JS with fallback handling.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run sondera-web/src/__tests__/mapUtils.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add sondera-web/src/components/MapCanvas.tsx sondera-web/src/lib/mapUtils.ts
git commit -m "feat: add MapCanvas component with organic pin formatting"
```

---

### Task 3: Quick Snap Media Capture Modal (`<QuickSnapModal />`)

**Files:**
- Create: `sondera-web/src/components/QuickSnapModal.tsx`
- Create: `sondera-web/src/lib/mediaRecorder.ts`
- Test: `sondera-web/src/__tests__/mediaRecorder.test.ts`

**Interfaces:**
- Consumes: User trigger from floating action bar.
- Produces: Captured photo Blob + 2-second audio Blob payload ready for spatial pin placement.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { getSupportedAudioMimeType } from '../lib/mediaRecorder';

describe('Media Recorder Helper', () => {
  it('returns a valid supported audio MIME type', () => {
    const mime = getSupportedAudioMimeType();
    expect(typeof mime).toBe('string');
    expect(mime.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run sondera-web/src/__tests__/mediaRecorder.test.ts`
Expected: FAIL with "getSupportedAudioMimeType not defined"

- [ ] **Step 3: Write minimal implementation**

Implement `getSupportedAudioMimeType` with iOS Safari fallback support:
```typescript
export function getSupportedAudioMimeType(): string {
  const types = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/aac'];
  for (const type of types) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return 'audio/mp4';
}
```

Implement `<QuickSnapModal />` with camera preview canvas, record trigger, and organic cream card modal wrapper.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run sondera-web/src/__tests__/mediaRecorder.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add sondera-web/src/components/QuickSnapModal.tsx sondera-web/src/lib/mediaRecorder.ts
git commit -m "feat: add QuickSnapModal component with MediaRecorder cross-platform support"
```

---

### Task 4: Event Capsule Drawer & Category Pill Bar (`<EventCapsuleDrawer />`)

**Files:**
- Create: `sondera-web/src/components/EventCapsuleDrawer.tsx`
- Create: `sondera-web/src/components/CategoryPillBar.tsx`
- Test: `sondera-web/src/__tests__/categoryFilter.test.ts`

**Interfaces:**
- Consumes: Event capsule list & category filter selection.
- Produces: Filtered pins and event timeline sidebar styled after the reference UI (rounded cards, soft pill chips, dark charcoal headers).

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { filterCapsulesByCategory } from '../lib/categoryFilter';

describe('Category Filter', () => {
  it('filters event capsules by category chip', () => {
    const capsules = [
      { id: '1', name: 'Ramen Crawl', category: 'food' },
      { id: '2', name: 'Trail Run', category: 'fitness' },
    ];
    const filtered = filterCapsulesByCategory(capsules, 'food');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('Ramen Crawl');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run sondera-web/src/__tests__/categoryFilter.test.ts`
Expected: FAIL with "filterCapsulesByCategory not defined"

- [ ] **Step 3: Write minimal implementation**

Implement `filterCapsulesByCategory` in `sondera-web/src/lib/categoryFilter.ts`:
```typescript
export interface CapsuleItem {
  id: string;
  name: string;
  category: string;
}

export function filterCapsulesByCategory(items: CapsuleItem[], category: string): CapsuleItem[] {
  if (category === 'all') return items;
  return items.filter(item => item.category === category);
}
```

Implement `<CategoryPillBar />` with rounded organic pill chips and `<EventCapsuleDrawer />` displaying event cards styled after reference images.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run sondera-web/src/__tests__/categoryFilter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add sondera-web/src/components/EventCapsuleDrawer.tsx sondera-web/src/components/CategoryPillBar.tsx
git commit -m "feat: add EventCapsuleDrawer and CategoryPillBar matching reference UI aesthetics"
```

---

### Task 5: Floating Bottom Action Navigation Bar (`<BottomNav />`)

**Files:**
- Create: `sondera-web/src/components/BottomNav.tsx`
- Modify: `sondera-web/src/app/page.tsx`
- Test: `sondera-web/src/__tests__/bottomNav.test.ts`

**Interfaces:**
- Consumes: Navigation state and Quick Snap trigger.
- Produces: Floating bottom action bar matching reference design (rounded white/cream card with central olive green circle CTA button).

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { getActiveNavClass } from '../lib/navUtils';

describe('Navigation Utils', () => {
  it('returns correct active state styles for navigation icons', () => {
    expect(getActiveNavClass('home', 'home')).toContain('text-olivePrimary');
    expect(getActiveNavClass('home', 'gallery')).toContain('text-slate-400');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run sondera-web/src/__tests__/bottomNav.test.ts`
Expected: FAIL with "getActiveNavClass not defined"

- [ ] **Step 3: Write minimal implementation**

Implement `getActiveNavClass` in `sondera-web/src/lib/navUtils.ts`:
```typescript
export function getActiveNavClass(currentTab: string, tabName: string): string {
  if (currentTab === tabName) {
    return 'text-olivePrimary font-semibold';
  }
  return 'text-slate-400 hover:text-slate-600';
}
```

Implement `<BottomNav />` with central olive green Quick Snap action button (`#4A6741`) matching the reference image layout.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run sondera-web/src/__tests__/bottomNav.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add sondera-web/src/components/BottomNav.tsx sondera-web/src/lib/navUtils.ts
git commit -m "feat: add floating BottomNav matching reference design"
```

---

### Task 6: PWA Service Worker & IndexedDB Offline Queue

**Files:**
- Create: `sondera-web/src/lib/db.ts`
- Create: `sondera-web/public/sw.js`
- Test: `sondera-web/src/__tests__/offlineDb.test.ts`

**Interfaces:**
- Consumes: Quick Snap payloads captured while offline.
- Produces: IndexedDB queue storing pending spatial pins for cloud sync when network recovers.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { formatSyncQueuePayload } from '../lib/db';

describe('Offline DB Payload Helper', () => {
  it('formats offline queue item into valid sync payload', () => {
    const formatted = formatSyncQueuePayload({
      id: 'offline-1',
      latitude: 35.6812,
      longitude: 139.7671,
      capturedAt: '2026-09-21T09:00:00Z',
    });
    expect(formatted.location.type).toBe('Point');
    expect(formatted.location.coordinates).toEqual([139.7671, 35.6812]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run sondera-web/src/__tests__/offlineDb.test.ts`
Expected: FAIL with "formatSyncQueuePayload not defined"

- [ ] **Step 3: Write minimal implementation**

Implement `formatSyncQueuePayload` in `sondera-web/src/lib/db.ts`:
```typescript
export interface OfflineQueueItem {
  id: string;
  latitude: number;
  longitude: number;
  capturedAt: string;
}

export function formatSyncQueuePayload(item: OfflineQueueItem) {
  return {
    id: item.id,
    location: {
      type: 'Point',
      coordinates: [item.longitude, item.latitude],
    },
    captured_at: item.capturedAt,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run sondera-web/src/__tests__/offlineDb.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add sondera-web/src/lib/db.ts sondera-web/public/sw.js
git commit -m "feat: add offline IndexedDB sync payload formatter and service worker"
```
