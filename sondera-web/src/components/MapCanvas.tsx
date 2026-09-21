'use client';

import React, { useEffect, useRef, useState } from 'react';
import { SpatialPin, formatPinMetadata } from '../lib/mapUtils';

interface MapCanvasProps {
  pins: SpatialPin[];
  selectedCategory?: string;
  onSelectPin?: (pin: SpatialPin) => void;
}

export const MapCanvas: React.FC<MapCanvasProps> = ({ pins, selectedCategory = 'all', onSelectPin }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const [webGlSupported, setWebGlSupported] = useState<boolean>(true);

  const filteredPins = selectedCategory === 'all' 
    ? pins 
    : pins.filter(p => p.category === selectedCategory);

  useEffect(() => {
    // WebGL support check
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!ctx) setWebGlSupported(false);
    } catch {
      setWebGlSupported(false);
    }
  }, []);

  return (
    <div className="relative w-full h-full min-h-[400px] rounded-3xl overflow-hidden border border-creamCard shadow-sm bg-[#EFECE3]">
      <div ref={mapContainerRef} className="absolute inset-0 w-full h-full">
        {!webGlSupported ? (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center text-charcoalText">
            <p className="font-semibold text-lg mb-1">Interactive Map Preview</p>
            <p className="text-xs text-slate-500 max-w-xs mb-4">
              WebGL fallback mode enabled. Interactive spatial rendering active.
            </p>
            <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
              {filteredPins.slice(0, 4).map(pin => (
                <button
                  key={pin.id}
                  onClick={() => onSelectPin?.(pin)}
                  className="bg-white p-3 rounded-2xl shadow-sm text-left hover:border-olivePrimary border border-transparent transition"
                >
                  <p className="font-medium text-xs text-charcoalText truncate">{pin.title}</p>
                  <p className="text-[10px] text-slate-500 mt-1">{formatPinMetadata({ locationName: pin.title, elevation: pin.elevation, weather: pin.weather })}</p>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="relative w-full h-full bg-[#EBF0E6] flex items-center justify-center">
            {/* Visual Organic Map Representation */}
            <div className="absolute inset-0 bg-[radial-gradient(#4A6741_1px,transparent_1px)] [background-size:24px_24px] opacity-15" />
            
            <div className="absolute top-4 left-4 z-10 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-full shadow-sm border border-creamCard flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-olivePrimary animate-pulse" />
              <span className="text-xs font-medium text-charcoalText">
                {filteredPins.length} Spatial Pins Loaded
              </span>
            </div>

            {/* Render Pin Markers */}
            <div className="relative z-10 grid grid-cols-2 sm:grid-cols-3 gap-4 p-4 max-w-2xl w-full">
              {filteredPins.map(pin => (
                <div
                  key={pin.id}
                  onClick={() => onSelectPin?.(pin)}
                  className="group cursor-pointer bg-white/95 backdrop-blur-sm p-3 rounded-2xl shadow-md border border-slate-100 hover:border-olivePrimary hover:scale-105 transition-all duration-200"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-3 h-3 rounded-full bg-olivePrimary flex-shrink-0" />
                    <span className="font-semibold text-xs text-charcoalText truncate">{pin.title}</span>
                  </div>
                  <p className="text-[10px] text-slate-500 truncate">
                    {formatPinMetadata({ locationName: pin.title, elevation: pin.elevation, weather: pin.weather })}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
