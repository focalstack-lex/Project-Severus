'use client';

import React from 'react';
import { MapPin, Calendar, Layers } from 'lucide-react';
import { CapsuleItem, filterCapsulesByCategory } from '../lib/categoryFilter';

interface EventCapsuleDrawerProps {
  capsules: CapsuleItem[];
  selectedCategory: string;
  onSelectCapsule: (capsule: CapsuleItem) => void;
}

export const EventCapsuleDrawer: React.FC<EventCapsuleDrawerProps> = ({ capsules, selectedCategory, onSelectCapsule }) => {
  const filtered = filterCapsulesByCategory(capsules, selectedCategory);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h3 className="font-bold text-base text-charcoalText">Event Capsules</h3>
        <span className="text-xs font-semibold text-olivePrimary bg-olivePrimary/10 px-2.5 py-1 rounded-full">
          {filtered.length} Saved
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((item) => (
          <div
            key={item.id}
            onClick={() => onSelectCapsule(item)}
            className="organic-card p-4 cursor-pointer hover:border-olivePrimary border border-transparent hover:shadow-md transition-all duration-200"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <h4 className="font-bold text-sm text-charcoalText truncate">{item.name}</h4>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-creamBackground text-slate-600">
                {item.category}
              </span>
            </div>

            {item.locationName && (
              <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-2">
                <MapPin className="w-3.5 h-3.5 text-olivePrimary" />
                <span className="truncate">{item.locationName}</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-slate-200/50 text-[11px] text-slate-500">
              <div className="flex items-center gap-1">
                <Layers className="w-3 h-3 text-slate-400" />
                <span>{item.pinCount || 0} Spatial Pins</span>
              </div>
              <div className="flex items-center gap-1 text-olivePrimary font-medium">
                <span>View Map</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
