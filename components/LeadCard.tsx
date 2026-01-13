import React, { useState } from 'react';
import { BusinessLead, LeadTag } from '../types';
import { getScoreBadgeColor } from '../constants';
import { Globe, MapPin, Phone, Star, ExternalLink, ChevronDown, ChevronUp, AlertCircle, Sparkles, Smartphone, Zap, Palette, CheckCircle, XCircle, Lock, Unlock, CalendarClock, Link2Off, RefreshCw, Database, FileText, Copy, Check } from 'lucide-react';

interface LeadCardProps {
  lead: BusinessLead;
  onDeepAnalyze: (lead: BusinessLead) => void;
  onGenerateScript: (lead: BusinessLead) => void;
  isAnalyzing: boolean;
}

export const LeadCard: React.FC<LeadCardProps> = ({ lead, onDeepAnalyze, onGenerateScript, isAnalyzing }) => {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyScript = () => {
    if (lead.coldCallScript) {
      navigator.clipboard.writeText(lead.coldCallScript);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className={`bg-white border rounded-lg shadow-sm hover:shadow-md transition-all duration-200 ${lead.score > 75 ? 'border-l-4 border-l-red-500' : 'border-gray-200'}`}>
      <div className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        
        {/* Basic Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-lg font-semibold text-gray-900 truncate">{lead.name}</h3>
            {lead.tags.includes('High Opportunity') && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                Hot Lead
              </span>
            )}
            
            {/* GHL Sync Status Badge */}
            {lead.ghlSyncStatus === 'synced' && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800" title="Synced to HighLevel">
                <Database size={10} className="mr-1" /> CRM
              </span>
            )}
             {lead.ghlSyncStatus === 'failed' && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800" title="Sync Failed">
                <Database size={10} className="mr-1" /> Sync Fail
              </span>
            )}
          </div>
          
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-500">
            <div className="flex items-center gap-1">
              <MapPin size={14} />
              <span>{lead.city}, {lead.state}</span>
            </div>
            {lead.category && (
              <span className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600">
                {lead.category}
              </span>
            )}
          </div>
        </div>

        {/* Metrics */}
        <div className="flex items-center gap-6">
           <div className="text-center">
             <div className="flex items-center gap-1 justify-center text-yellow-500 font-bold">
               {lead.rating.toFixed(1)} <Star size={14} fill="currentColor" />
             </div>
             <div className="text-xs text-gray-400">{lead.reviewCount} Reviews</div>
           </div>
           
           <div className="text-center min-w-[80px]">
             <div className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-sm font-bold border ${getScoreBadgeColor(lead.score)}`}>
               {lead.score} / 100
             </div>
             <div className="text-[10px] text-gray-400 mt-1 uppercase tracking-wide font-medium">Lead Score</div>
           </div>
           
           <button 
             onClick={() => setExpanded(!expanded)}
             className="p-1 hover:bg-gray-100 rounded text-gray-400"
           >
             {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
           </button>
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50/50 p-4 animate-fadeIn">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Contact & Links */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Contact Details</h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 flex items-center gap-2"><Phone size={14} /> Phone</span>
                  <span className="font-medium text-gray-900">{lead.phone || 'N/A'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 flex items-center gap-2"><Globe size={14} /> Website</span>
                  {lead.website ? (
                    <div className="flex items-center gap-2">
                      <a href={lead.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-600 hover:underline font-medium truncate max-w-[150px]">
                        {lead.website.replace(/^https?:\/\//, '').replace(/\/$/, '')} <ExternalLink size={12} />
                      </a>
                      {/* Verification Status */}
                      {lead.isWebsiteReachable === true && (
                        <span className="text-green-600" title="Verified Active">
                          <CheckCircle size={14} />
                        </span>
                      )}
                      {lead.isWebsiteReachable === false && (
                        <span className="text-red-500" title="Unreachable / Inactive">
                          <XCircle size={14} />
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-red-600 font-medium flex items-center gap-1"><AlertCircle size={14} /> Missing</span>
                  )}
                </div>
                {/* SSL Status Line */}
                {lead.isWebsiteReachable !== undefined && lead.website && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500 flex items-center gap-2"><Lock size={14} /> Security</span>
                    {lead.sslSecure ? (
                       <span className="text-green-600 font-medium flex items-center gap-1 text-xs">
                         <Lock size={12} /> SSL Active
                       </span>
                    ) : (
                       <span className="text-red-600 font-medium flex items-center gap-1 text-xs">
                         <Unlock size={12} /> Not Secure
                       </span>
                    )}
                  </div>
                )}
                
                <div className="flex items-center justify-between">
                  <span className="text-gray-500 flex items-center gap-2"><MapPin size={14} /> Google Maps</span>
                  {lead.mapsUri && (
                    <a href={lead.mapsUri} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-600 hover:underline font-medium">
                      View Listing <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Analysis & Actions */}
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Opportunity Analysis</h4>
              
              {/* Deep Analysis Metrics (Visible after analysis) */}
              {(lead.hasMobileFriendlySite !== undefined || lead.pageLoadSpeed || lead.visualQualityScore || lead.hasBrokenLinks !== undefined) && (
                <div className="mb-3 grid grid-cols-2 gap-3">
                  {/* Mobile Friendly */}
                  <div className="p-2.5 bg-white rounded border border-gray-200 flex flex-col shadow-sm">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
                      <Smartphone size={12} />
                      <span>Mobile Friendly</span>
                    </div>
                    <span className={`text-sm font-semibold ${lead.hasMobileFriendlySite ? 'text-green-600' : 'text-red-600'}`}>
                      {lead.hasMobileFriendlySite ? 'Yes' : 'No (Fix Needed)'}
                    </span>
                  </div>

                  {/* Link Integrity (New) */}
                   <div className="p-2.5 bg-white rounded border border-gray-200 flex flex-col shadow-sm">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
                      <Link2Off size={12} />
                      <span>Link Health</span>
                    </div>
                    <span className={`text-sm font-semibold ${lead.hasBrokenLinks ? 'text-red-600' : 'text-green-600'}`}>
                      {lead.hasBrokenLinks ? 'Broken Links Found' : 'Good'}
                    </span>
                  </div>

                  {/* Content Freshness */}
                   <div className="p-2.5 bg-white rounded border border-gray-200 flex flex-col shadow-sm">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
                      <CalendarClock size={12} />
                      <span>Content</span>
                    </div>
                    <span className={`text-sm font-semibold ${lead.contentStatus === 'Outdated' ? 'text-red-600' : lead.contentStatus === 'Fresh' ? 'text-green-600' : 'text-gray-600'}`}>
                      {lead.contentStatus || 'Unknown'}
                    </span>
                  </div>

                  {/* Page Speed */}
                  <div className="p-2.5 bg-white rounded border border-gray-200 flex flex-col shadow-sm">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
                      <Zap size={12} />
                      <span>Est. Speed</span>
                    </div>
                    <span className={`text-sm font-semibold ${lead.pageLoadSpeed === 'Slow' ? 'text-red-600' : lead.pageLoadSpeed === 'Fast' ? 'text-green-600' : 'text-orange-600'}`}>
                      {lead.pageLoadSpeed || 'N/A'}
                    </span>
                  </div>
                </div>
              )}

              <div className="bg-white p-3 rounded border border-gray-200 mb-3 shadow-sm">
                 <p className="text-sm text-gray-700 leading-relaxed">
                   <span className="font-medium text-gray-900">Why target this business?</span> {lead.opportunitySummary}
                 </p>
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                {lead.tags.map(tag => (
                   <span key={tag} className="px-2 py-1 bg-white border border-gray-200 rounded text-xs font-medium text-gray-600 shadow-sm">
                     {tag}
                   </span>
                ))}
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => onDeepAnalyze(lead)}
                  disabled={isAnalyzing}
                  className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2 px-4 rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isAnalyzing ? (
                    <span className="flex items-center gap-2">Analyzing...</span>
                  ) : (
                    <>
                      <Sparkles size={16} /> Deep Qualify
                    </>
                  )}
                </button>

                <button 
                  onClick={() => onGenerateScript(lead)}
                  className="flex items-center justify-center gap-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 py-2 px-4 rounded text-sm font-medium transition-colors"
                >
                   <FileText size={16} /> AI Script
                </button>
              </div>
            </div>
          </div>

          {/* AI Cold Call Script Section */}
          {lead.coldCallScript && (
            <div className="mt-6 pt-4 border-t border-gray-200">
               <div className="flex items-center justify-between mb-2">
                 <h4 className="text-sm font-semibold text-indigo-900 flex items-center gap-2">
                   <Sparkles size={14} className="text-indigo-500" /> AI Personalized Script
                 </h4>
                 <div className="flex items-center gap-3">
                    <button 
                      onClick={() => onGenerateScript(lead)} 
                      className="text-xs text-indigo-600 hover:text-indigo-800"
                    >
                      Regenerate
                    </button>
                    <button 
                      onClick={copyScript}
                      className="text-xs flex items-center gap-1 text-gray-500 hover:text-indigo-600 transition-colors"
                    >
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                      {copied ? 'Copied!' : 'Copy to Clipboard'}
                    </button>
                 </div>
               </div>
               <div className="bg-indigo-50/50 p-4 rounded-lg border border-indigo-100 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                 {lead.coldCallScript}
               </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
