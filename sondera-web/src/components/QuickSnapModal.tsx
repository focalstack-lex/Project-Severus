'use client';

import React, { useState } from 'react';
import { Camera, Mic, X, Check } from 'lucide-react';
import { createQuickSnapPayload } from '../lib/mediaRecorder';

interface QuickSnapModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveSnap: (snap: any) => void;
}

export const QuickSnapModal: React.FC<QuickSnapModalProps> = ({ isOpen, onClose, onSaveSnap }) => {
  const [title, setTitle] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [hasPhoto, setHasPhoto] = useState(false);

  if (!isOpen) return null;

  const handleCapturePhoto = () => {
    setHasPhoto(true);
  };

  const handleToggleRecord = () => {
    setIsRecording(!isRecording);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = createQuickSnapPayload({
      title: title || 'Quick Snap Memory',
      latitude: 35.6812,
      longitude: 139.7671,
      photoBlobSize: hasPhoto ? 2048 : 0,
      audioDurationSec: isRecording ? 2.0 : 0,
    });
    onSaveSnap(payload);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-charcoalText/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="organic-card max-w-md w-full p-6 relative shadow-2xl border border-white/60 animate-in fade-in zoom-in duration-200">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-charcoalText p-1.5 rounded-full hover:bg-creamBackground transition"
        >
          <X className="w-5 h-5" />
        </button>

        <h3 className="text-xl font-bold text-charcoalText mb-1">New Quick Snap</h3>
        <p className="text-xs text-slate-500 mb-6">Capture a photo and 2-second ambient audio clip</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-charcoalText uppercase tracking-wider mb-2">
              Memory Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Camp Big Sky Adventure..."
              className="w-full px-4 py-3 rounded-2xl bg-white border border-slate-200 text-charcoalText placeholder:text-slate-400 text-sm focus:outline-none focus:border-olivePrimary transition"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={handleCapturePhoto}
              className={`p-4 rounded-2xl border flex flex-col items-center justify-center gap-2 transition ${
                hasPhoto
                  ? 'bg-olivePrimary/10 border-olivePrimary text-olivePrimary font-medium'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-olivePrimary'
              }`}
            >
              <Camera className="w-6 h-6" />
              <span className="text-xs">{hasPhoto ? 'Photo Ready' : 'Snap Photo'}</span>
            </button>

            <button
              type="button"
              onClick={handleToggleRecord}
              className={`p-4 rounded-2xl border flex flex-col items-center justify-center gap-2 transition ${
                isRecording
                  ? 'bg-amberAccent/10 border-amberAccent text-amberAccent font-medium animate-pulse'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-olivePrimary'
              }`}
            >
              <Mic className="w-6 h-6" />
              <span className="text-xs">{isRecording ? '2s Recording...' : 'Record Audio'}</span>
            </button>
          </div>

          <div className="pt-4">
            <button
              type="submit"
              className="w-full py-3.5 bg-olivePrimary hover:bg-oliveDark text-white font-semibold text-sm rounded-2xl shadow-md flex items-center justify-center gap-2 transition duration-200"
            >
              <Check className="w-4 h-4" />
              Save Spatial Pin
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
