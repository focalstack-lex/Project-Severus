'use client';

import React, { useState } from 'react';
import { MapPin, Search, Sparkles } from 'lucide-react';
import { MapCanvas } from '../components/MapCanvas';
import { CategoryPillBar } from '../components/CategoryPillBar';
import { EventCapsuleDrawer } from '../components/EventCapsuleDrawer';
import { QuickSnapModal } from '../components/QuickSnapModal';
import { BottomNav } from '../components/BottomNav';
import { SpatialPin } from '../lib/mapUtils';
import { CapsuleItem } from '../lib/categoryFilter';

export default function HomePage() {
  const [currentTab, setCurrentTab] = useState('home');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [isQuickSnapOpen, setIsQuickSnapOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [pins, setPins] = useState<SpatialPin[]>([
    { id: '1', longitude: -110.50, latitude: 44.65, title: 'Camp Big Sky Adventure', category: 'outdoor', elevation: 1850, weather: '18C Sunny' },
    { id: '2', longitude: -118.24, latitude: 34.05, title: 'Los Angeles Coastal Walk', category: 'fitness', elevation: 25, weather: '24C Clear' },
    { id: '3', longitude: -87.62, latitude: 41.87, title: 'Chicago Coffee Crawl', category: 'food', elevation: 180, weather: '16C Cool' },
  ]);

  const [capsules, setCapsules] = useState<CapsuleItem[]>([
    { id: 'c1', name: 'Camp Big Sky Adventure', category: 'outdoor', locationName: 'Yellowstone, Wyoming', pinCount: 14 },
    { id: 'c2', name: 'Tokyo Ramen Crawl', category: 'food', locationName: 'Shibuya, Tokyo', pinCount: 8 },
    { id: 'c3', name: 'Sunday Morning Trail Run', category: 'fitness', locationName: 'Redwood Forest, CA', pinCount: 5 },
  ]);

  const handleSaveSnap = (newSnap: any) => {
    const newPin: SpatialPin = {
      id: newSnap.id,
      title: newSnap.title,
      latitude: newSnap.latitude,
      longitude: newSnap.longitude,
      category: 'outdoor',
      elevation: 420,
      weather: '22C Clear',
    };
    setPins((prev) => [newPin, ...prev]);
  };

  return (
    <main className="min-h-screen pb-28 pt-4 px-4 max-w-5xl mx-auto space-y-6">
      {/* Top Hero Header matching Reference organic theme */}
      <header className="organic-card p-6 bg-gradient-to-r from-creamCard to-[#EFECE3] border border-white/60 relative overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="text-xs uppercase font-bold tracking-widest text-olivePrimary">Sondera Spatial Atlas</span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-charcoalText mt-0.5">
              Hello, Explorer
            </h1>
          </div>
          <div className="w-10 h-10 rounded-full bg-olivePrimary/10 border border-olivePrimary/20 flex items-center justify-center text-olivePrimary font-bold">
            <Sparkles className="w-5 h-5 text-olivePrimary" />
          </div>
        </div>

        {/* Search Bar pill matching Reference UI */}
        <div className="relative max-w-md">
          <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search spatial pins, events, locations..."
            className="w-full pl-11 pr-4 py-3 rounded-full bg-white/90 border border-slate-200/80 text-xs text-charcoalText placeholder:text-slate-400 focus:outline-none focus:border-olivePrimary transition shadow-sm"
          />
        </div>
      </header>

      {/* Category Pill Filters matching Reference UI */}
      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Categories</h2>
        </div>
        <CategoryPillBar
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
        />
      </section>

      {/* Main Spatial Map Canvas */}
      <section className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-olivePrimary" />
            <span>Interactive Spatial Canvas</span>
          </h2>
        </div>
        <div className="h-[380px] sm:h-[450px]">
          <MapCanvas pins={pins} selectedCategory={selectedCategory} />
        </div>
      </section>

      {/* Event Capsules Drawer */}
      <section className="pt-2">
        <EventCapsuleDrawer
          capsules={capsules}
          selectedCategory={selectedCategory}
          onSelectCapsule={(item) => console.log('Selected capsule:', item)}
        />
      </section>

      {/* Quick Snap Modal */}
      <QuickSnapModal
        isOpen={isQuickSnapOpen}
        onClose={() => setIsQuickSnapOpen(false)}
        onSaveSnap={handleSaveSnap}
      />

      {/* Floating Bottom Navigation Bar */}
      <BottomNav
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        onQuickSnapTrigger={() => setIsQuickSnapOpen(true)}
      />
    </main>
  );
}
