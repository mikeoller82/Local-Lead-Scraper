import React, { useState, useEffect } from 'react';
import { Key, Lock, ExternalLink, Eye, EyeOff, Zap } from 'lucide-react';

interface ApiKeyModalProps {
  isOpen: boolean;
  onSave: (geminiKey: string, ghlKey: string) => void;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ isOpen, onSave }) => {
  const [geminiKey, setGeminiKey] = useState('');
  const [ghlKey, setGhlKey] = useState('');
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    // Pre-fill if existing in localStorage (handled by parent usually, but good for UX here too)
    const storedGemini = localStorage.getItem('gemini_api_key');
    const storedGhl = localStorage.getItem('ghl_api_key');
    if (storedGemini) setGeminiKey(storedGemini);
    if (storedGhl) setGhlKey(storedGhl);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (geminiKey.trim().length > 0) {
      onSave(geminiKey.trim(), ghlKey.trim());
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden border border-gray-100">
        <div className="p-6 bg-gradient-to-r from-indigo-600 to-violet-600">
          <div className="flex items-center gap-3 text-white">
            <div className="bg-white/20 p-2 rounded-lg backdrop-blur-sm">
              <Lock className="h-6 w-6 text-white" />
            </div>
            <h2 className="text-xl font-bold">Configuration Required</h2>
          </div>
          <p className="text-indigo-100 mt-2 text-sm">
            Please configure your API keys to enable the scraper and auto-integrations.
          </p>
        </div>

        <div className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* Gemini Key */}
            <div>
              <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700 mb-1">
                Google Gemini API Key <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Key className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type={showKey ? "text" : "password"}
                  id="apiKey"
                  className="block w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                  placeholder="AIzaSy..."
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                >
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">Required for scraping intelligence.</p>
            </div>

            {/* GHL Key */}
            <div>
              <label htmlFor="ghlKey" className="block text-sm font-medium text-gray-700 mb-1">
                GoHighLevel API Key (Optional)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Zap className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  type={showKey ? "text" : "password"}
                  id="ghlKey"
                  className="block w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                  placeholder="Bearer Token"
                  value={ghlKey}
                  onChange={(e) => setGhlKey(e.target.value)}
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Required to auto-sync 50+ score leads to HighLevel.
              </p>
            </div>

            <button
              type="submit"
              disabled={geminiKey.length < 10}
              className="w-full flex justify-center py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Save & Continue
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-gray-100">
            <a 
              href="https://aistudio.google.com/app/apikey" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 text-sm font-medium"
            >
              Get Gemini Key <ExternalLink size={14} />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};