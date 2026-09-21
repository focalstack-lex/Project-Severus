'use client';

import React from 'react';
import { Home, Layers, Plus, MessageSquare, Settings } from 'lucide-react';
import { getActiveNavClass } from '../lib/navUtils';

interface BottomNavProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  onQuickSnapTrigger: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ currentTab, onTabChange, onQuickSnapTrigger }) => {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 max-w-md w-[calc(100%-2rem)]">
      <div className="bg-white/95 backdrop-blur-md px-6 py-3 rounded-full shadow-xl border border-creamCard flex items-center justify-between">
        <button
          onClick={() => onTabChange('home')}
          className={`flex flex-col items-center gap-0.5 text-[10px] transition ${getActiveNavClass(currentTab, 'home')}`}
        >
          <Home className="w-5 h-5" />
          <span>Home</span>
        </button>

        <button
          onClick={() => onTabChange('events')}
          className={`flex flex-col items-center gap-0.5 text-[10px] transition ${getActiveNavClass(currentTab, 'events')}`}
        >
          <Layers className="w-5 h-5" />
          <span>Events</span>
        </button>

        {/* Central Olive Green Quick Snap Action CTA */}
        <button
          onClick={onQuickSnapTrigger}
          className="w-12 h-12 rounded-full bg-olivePrimary hover:bg-oliveDark text-white flex items-center justify-center shadow-lg hover:scale-105 active:scale-95 transition-all duration-200 -mt-5 border-4 border-creamBackground"
          aria-label="New Quick Snap"
        >
          <Plus className="w-6 h-6 stroke-[2.5]" />
        </button>

        <button
          onClick={() => onTabChange('chat')}
          className={`flex flex-col items-center gap-0.5 text-[10px] transition ${getActiveNavClass(currentTab, 'chat')}`}
        >
          <MessageSquare className="w-5 h-5" />
          <span>Chat</span>
        </button>

        <button
          onClick={() => onTabChange('settings')}
          className={`flex flex-col items-center gap-0.5 text-[10px] transition ${getActiveNavClass(currentTab, 'settings')}`}
        >
          <Settings className="w-5 h-5" />
          <span>Settings</span>
        </button>
      </div>
    </div>
  );
};
