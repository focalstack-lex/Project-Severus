'use client';

import React, { useState } from 'react';
import { X, MapPin, Volume2, Play, Pause, Tag, CloudSun, Mountain } from 'lucide-react';
import { SpatialPin, formatPinMetadata } from '../lib/mapUtils';
import { generateAutoTags, formatAmbientSoundType } from '../lib/aiTagging';

interface PinDetailDrawerProps {
  pin: SpatialPin | null;
  onClose: () => void;
}

export const PinDetailDrawer: React.FC<PinDetailDrawerProps> = ({ pin, onClose }) => {
  const [isPlaying, setIsPlaying] = useState(false);

  if (!pin) return null;

  const tags = generateAutoTags(pin.title, pin.category || 'general');
  const ambientLabel = formatAmbientSoundType('forest_breeze');

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 max-w-lg mx-auto animate-in slide-in-from-bottom duration-300">
      <div className="organic-card p-6 bg-white/95 backdrop-blur-md shadow-2xl border border-white/80 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-charcoalText p-1.5 rounded-full hover:bg-creamBackground transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] uppercase font-bold tracking-widest px-2.5 py-0.5 rounded-full bg-olivePrimary/10 text-olivePrimary">
            {pin.category || 'Spatial Pin'}
          </span>
          <span className="text-xs text-slate-400">ID: {pin.id}</span>
        </div>

        <h3 className="text-xl font-extrabold text-charcoalText mb-1">{pin.title}</h3>
        <p className="text-xs text-slate-500 mb-4 flex items-center gap-1">
          <MapPin className="w-3.5 h-3.5 text-olivePrimary" />
          <span>{formatPinMetadata({ locationName: pin.title, elevation: pin.elevation, weather: pin.weather })}</span>
        </p>

        {/* Ambient Audio Player Card */}
        <div className="p-3.5 rounded-2xl bg-creamCard border border-slate-200/60 flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className="w-10 h-10 rounded-full bg-olivePrimary hover:bg-oliveDark text-white flex items-center justify-center shadow-md transition"
            >
              {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </button>
            <div>
              <p className="text-xs font-semibold text-charcoalText flex items-center gap-1">
                <Volume2 className="w-3.5 h-3.5 text-olivePrimary" />
                <span>Ambient Soundscape</span>
              </p>

              {/* Animated Audio Waveform Bars */}
              <div className="flex items-center gap-1 mt-1">
                {[40, 70, 30, 90, 50, 80, 40, 60].map((h, i) => (
                  <div
                    key={i}
                    className={`w-1 rounded-full bg-olivePrimary transition-all duration-300 ${
                      isPlaying ? 'animate-pulse' : 'opacity-40'
                    }`}
                    style={{ height: isPlaying ? `${Math.max(8, (h * Math.random()) | 0)}px` : '10px' }}
                  />
                ))}
              </div>
            </div>
          </div>
          <span className="text-xs font-mono font-medium text-slate-500">{ambientLabel}</span>
        </div>

        {/* AI Auto-Tags Chips */}
        <div className="flex items-center gap-1.5 flex-wrap pt-1">
          <Tag className="w-3.5 h-3.5 text-slate-400" />
          {tags.map((tag) => (
            <span key={tag} className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-creamBackground text-slate-600 border border-slate-200/50">
              #{tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
