import React, { useState, useEffect } from 'react';
import { SearchPanel } from './components/SearchPanel';
import { LeadCard } from './components/LeadCard';
import { StatsOverview } from './components/StatsOverview';
import { ApiKeyModal } from './components/ApiKeyModal';
import { searchBusinesses, deepQualifyLead } from './services/gemini';
import { BusinessLead, SearchParams } from './types';
import { exportToCSV } from './utils/scoring';
import { LayoutDashboard, Download, AlertTriangle, LogOut } from 'lucide-react';

const App: React.FC = () => {
  const [leads, setLeads] = useState<BusinessLead[]>([]);
  const [loading, setLoading] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // API Key State
  const [apiKey, setApiKey] = useState<string | null>(null);

  useEffect(() => {
    // Check for existing key on load
    const storedKey = localStorage.getItem('gemini_api_key');
    if (storedKey) {
      setApiKey(storedKey);
    }
  }, []);

  const handleSaveApiKey = (key: string) => {
    localStorage.setItem('gemini_api_key', key);
    setApiKey(key);
  };

  const handleClearKey = () => {
    localStorage.removeItem('gemini_api_key');
    setApiKey(null);
    setLeads([]);
  };

  const handleSearch = async (params: SearchParams) => {
    if (!apiKey) return;

    setLoading(true);
    setError(null);
    setLeads([]);
    setProgressMsg('Initializing...');
    
    try {
      const results = await searchBusinesses(apiKey, params.keyword, params.location, (msg) => setProgressMsg(msg));
      
      // Apply client-side filters
      const filtered = results.filter(lead => {
        const matchesReviews = lead.reviewCount <= params.maxReviews && lead.reviewCount >= params.minReviews;
        const matchesRating = lead.rating >= params.minRating && lead.rating <= params.maxRating;
        return matchesReviews && matchesRating;
      });

      // Sort by opportunity score desc
      const sorted = filtered.sort((a, b) => b.score - a.score);
      
      setLeads(sorted);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
      setProgressMsg('');
    }
  };

  const handleDeepAnalyze = async (lead: BusinessLead) => {
    if (!apiKey) return;

    setAnalyzingId(lead.id);
    try {
      const updates = await deepQualifyLead(apiKey, lead);
      setLeads(prev => prev.map(l => l.id === lead.id ? { ...l, ...updates } : l));
    } catch (e) {
      console.error(e);
    } finally {
      setAnalyzingId(null);
    }
  };

  const handleExport = () => {
    if (leads.length > 0) exportToCSV(leads);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-slate-800">
      
      <ApiKeyModal isOpen={!apiKey} onSave={handleSaveApiKey} />

      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <LayoutDashboard className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600">
              LocalLead<span className="font-light text-gray-800">Scraper</span>
            </h1>
          </div>
          <div className="flex items-center gap-4">
             <div className="text-sm text-gray-500 hidden md:block">
                Powered by Gemini Grounding
             </div>
             {apiKey && (
               <button 
                 onClick={handleClearKey} 
                 className="text-xs text-red-500 hover:text-red-700 font-medium flex items-center gap-1 border border-red-100 rounded px-2 py-1 bg-red-50"
                 title="Clear API Key"
               >
                 <LogOut size={12} /> Clear Key
               </button>
             )}
          </div>
        </div>
      </header>

      {/* Main Search Controls */}
      <SearchPanel onSearch={handleSearch} isLoading={loading} />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Loading State */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
             <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
             <p className="text-lg font-medium text-gray-600 animate-pulse">{progressMsg}</p>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3 text-red-700 mb-6">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {/* Results */}
        {!loading && leads.length > 0 && (
          <div className="animate-fadeIn">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">
                Found {leads.length} Prospects
              </h2>
              <button 
                onClick={handleExport}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 font-medium transition-colors text-sm shadow-sm"
              >
                <Download size={16} /> Export CSV
              </button>
            </div>

            <StatsOverview leads={leads} />

            <div className="space-y-4">
              {leads.map(lead => (
                <LeadCard 
                  key={lead.id} 
                  lead={lead} 
                  onDeepAnalyze={handleDeepAnalyze} 
                  isAnalyzing={analyzingId === lead.id}
                />
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && leads.length === 0 && (
          <div className="text-center py-20">
            <div className="bg-gray-100 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4">
              <LayoutDashboard className="h-10 w-10 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900">No leads found yet</h3>
            <p className="text-gray-500 mt-2 max-w-md mx-auto">
              Enter a keyword and location above to start scraping Google Maps for high-opportunity local businesses.
            </p>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;