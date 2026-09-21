# Technical Design Specification: Sondera Web Platform

**Product Name**: Sondera  
**Tagline**: *Every path tells a story.*  
**Domain**: Universal Spatial Memory & Activity Mapping Platform  
**Target Platform**: Web Application (Next.js PWA + MapLibre GL JS + PostgreSQL / PostGIS)

---

## 1. Executive Summary & Vision

Sondera is a web-first spatial memory platform that allows users to document, group, and visually explore memorable life activities (travel, food crawls, workouts, concerts, neighborhood walks, and family trips) on an interactive 2D/3D map canvas.

By combining one-tap **Quick Snaps** (photo + 2-second ambient audio clips), **Spatial Map Pins**, and **Collaborative Event Capsules**, Sondera turns everyday movement and memories into a shared living atlas.

---

## 2. System Architecture & Tech Stack

```
[ Web PWA Client (Next.js / MapLibre GL) ] 
       │
       ├─► [ Offline Cache (IndexedDB / Service Worker) ]
       │
       ├─► [ WebSockets / Realtime Sync ] ──► [ Event Capsule Collaboration ]
       │
       └─► [ REST / gRPC API (FastAPI / Node.js) ]
                │
                ├─► [ PostgreSQL + PostGIS (Spatial Database) ]
                ├─► [ S3 / R2 Object Storage (Photos & Audio Assets) ]
                └─► [ AI Pipeline Service (Hugging Face / ONNX Models) ]
```

### Stack Components
* **Frontend**: Next.js (React, TypeScript), Tailwind CSS, Framer Motion.
* **Spatial Map Engine**: MapLibre GL JS / Mapbox GL JS (WebGL-accelerated vector mapping, custom marker rendering, 3D terrain elevation, polyline routes).
* **Web APIs**: HTML5 MediaRecorder API, Web Audio API (waveform visualization), HTML5 Geolocation API, WebGPU (optional client-side ONNX model acceleration).
* **Backend Services**: Python FastAPI (or Node.js/Hono) for spatial calculations and AI pipeline orchestrations.
* **Database & Storage**: PostgreSQL with **PostGIS** spatial extension (`ST_DWithin`, `ST_MakeLine`, `ST_Centroid`), Cloudflare R2 / AWS S3 for media assets.

---

## 3. Core Product Components

### 3.1 `<MapCanvas />`
* Renders interactive WebGL vector map layers, topography elevation, and activity route lines.
* Clusters dense photo and audio pins dynamically based on zoom levels to preserve UI performance and visual clarity.
* Custom vector markers for different activity categories (travel, food, running, outdoor, daily life).

### 3.2 `<QuickSnapCapture />`
* Web camera and microphone interface.
* Single tap captures high-resolution photo frame and 2-second ambient audio stream simultaneously.
* Background upload queue ensures smooth performance even on slow mobile connections.

### 3.3 `<EventCapsuleDrawer />`
* Sidebar drawer listing named user events (*"Tokyo Ramen Crawl 2026"*, *"Highway 1 Road Trip"*, *"Sunday Morning Run"*).
* Includes timeline scrubbers, group member avatars, and spatial filters.

### 3.4 `<RealtimeSyncProvider />`
* WebSocket / Supabase Realtime communication layer broadcasting live map pins to all active group members viewing a shared event capsule.

---

## 4. AI Pipeline & Hugging Face Integrations

* **Audio Transcription & Noise Suppression**:
  * Whisper-small (ONNX runtime) executing server-side or via browser WebGPU for instant speech-to-text.
  * Audio noise suppression to isolate voice notes from ambient wind or background noise.
* **Auto-Context Metadata Tagging**:
  * `OpenCLIP` / `Zero-Shot Object Detection` analyzing uploaded photos to extract tags (*architecture, food, sunset, trail*).
  * Audio Classification model categorizing ambient background audio (*cafe noise, ocean waves, city street, forest*).
* **Unified Output Schema**:
  ```json
  {
    "location_name": "Shibuya Crossing",
    "tags": ["urban", "street", "night"],
    "ambient_type": "city_hum",
    "weather": "21C • Clear"
  }
  ```

---

## 5. Database Schema (PostgreSQL + PostGIS)

```sql
-- Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Event Capsules
CREATE TABLE event_capsules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50) DEFAULT 'general',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Spatial Pins (Photos + Audio)
CREATE TABLE spatial_pins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    capsule_id UUID REFERENCES event_capsules(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    title VARCHAR(255),
    photo_url TEXT,
    audio_url TEXT,
    transcription TEXT,
    location GEOMETRY(Point, 4326) NOT NULL,
    altitude NUMERIC(8, 2),
    metadata JSONB,
    captured_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Activity Route Tracks
CREATE TABLE activity_tracks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    capsule_id UUID REFERENCES event_capsules(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    track_name VARCHAR(255),
    route_geometry GEOMETRY(LineString, 4326),
    distance_meters NUMERIC(10, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Group Capsule Members
CREATE TABLE capsule_members (
    capsule_id UUID REFERENCES event_capsules(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    role VARCHAR(20) DEFAULT 'contributor',
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (capsule_id, user_id)
);

-- Spatial GIST Indexes
CREATE INDEX idx_spatial_pins_location ON spatial_pins USING GIST(location);
CREATE INDEX idx_activity_tracks_route ON activity_tracks USING GIST(route_geometry);
```

---

## 6. Offline PWA Support & Security

* **Service Worker & IndexedDB Caching**:
  * Logs offline GPS coordinates, photos, and audio clips when out of cellular range.
  * Automatically uploads queued entries once internet connection is re-established.
* **Row Level Security (RLS)**:
  * Strict PostgreSQL RLS policies restrict spatial pin access to authorized members of an `event_capsule`.
* **Media Security**: Presigned short-lived S3/R2 URLs for photo and audio asset delivery.
