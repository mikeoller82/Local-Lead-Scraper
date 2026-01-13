import React, { useState, useEffect } from 'react';
import { BusinessLead, ScriptConfiguration } from '../types';
import { X, Phone, User, Building, Target, Lightbulb, Download, Copy, RefreshCw, AlertCircle, FileText, Check } from 'lucide-react';
import { generateColdCallScript } from '../services/gemini';

interface ScriptGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  lead: BusinessLead;
  apiKey: string;
  onScriptGenerated: (leadId: string, script: string) => void;
}

export const ScriptGeneratorModal: React.FC<ScriptGeneratorModalProps> = ({
  isOpen,
  onClose,
  lead,
  apiKey,
  onScriptGenerated
}) => {
  const [loading, setLoading] = useState(false);
  const [generatedScript, setGeneratedScript] = useState<string>('');
  const [copied, setCopied] = useState(false);

  // Form State
  const [formData, setFormData] = useState<ScriptConfiguration>({
    caller: { name: '', title: '', company: '' },
    prospect: { industry: '', role: '', companySize: '' },
    valueProp: { painPoint: '', solution: '', uniqueValue: '', socialProof: '' },
    config: { objective: 'Schedule Demo', tone: 'Professional' }
  });

  // Load saved caller info and pre-fill lead info
  useEffect(() => {
    if (isOpen) {
      const savedCaller = localStorage.getItem('scriptGen_callerInfo');
      const initialCaller = savedCaller ? JSON.parse(savedCaller) : { name: '', title: '', company: '' };
      
      setFormData({
        caller: initialCaller,
        prospect: {
          industry: lead.category || 'General Business',
          role: 'Owner / Decision Maker',
          companySize: '1-50 employees'
        },
        valueProp: {
          painPoint: lead.opportunitySummary || 'Online visibility issues',
          solution: 'Digital marketing services to increase local ranking',
          uniqueValue: 'Proven track record in local SEO',
          socialProof: ''
        },
        config: { objective: 'Book Meeting', tone: 'Professional' }
      });
      
      // Reset script if it's a new open
      if (lead.coldCallScript) {
        setGeneratedScript(lead.coldCallScript);
      } else {
        setGeneratedScript('');
      }
    }
  }, [isOpen, lead]);

  if (!isOpen) return null;

  const handleInputChange = (section: keyof ScriptConfiguration, field: string, value: string) => {
    setFormData(prev => {
      const updated = {
        ...prev,
        [section]: {
          ...prev[section],
          [field]: value
        }
      };
      
      // Auto-save caller info
      if (section === 'caller') {
        localStorage.setItem('scriptGen_callerInfo', JSON.stringify(updated.caller));
      }
      return updated;
    });
  };

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const script = await generateColdCallScript(apiKey, formData);
      setGeneratedScript(script);
      onScriptGenerated(lead.id, script);
    } catch (error) {
      console.error("Failed to generate script", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedScript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([generatedScript], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `script_${lead.name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col md:flex-row overflow-hidden border border-gray-200">
        
        {/* Left Column: Input Form */}
        <div className="w-full md:w-5/12 lg:w-4/12 bg-gray-50 flex flex-col border-r border-gray-200 overflow-y-auto custom-scrollbar h-full max-h-[90vh]">
          <div className="p-5 border-b border-gray-200 bg-white sticky top-0 z-10">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 bg-indigo-100 rounded text-indigo-600">
                <Phone size={18} />
              </div>
              <h2 className="text-lg font-bold text-gray-900">Script Configuration</h2>
            </div>
            <p className="text-xs text-gray-500">Configure parameters for {lead.name}</p>
          </div>

          <div className="p-5 space-y-6">
            
            {/* Caller Info */}
            <section className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-indigo-700 uppercase tracking-wide">
                <User size={14} /> Caller Information
              </div>
              <div className="grid gap-3">
                <input
                  type="text"
                  placeholder="Your Name *"
                  className="w-full p-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                  value={formData.caller.name}
                  onChange={(e) => handleInputChange('caller', 'name', e.target.value)}
                />
                <input
                  type="text"
                  placeholder="Your Title"
                  className="w-full p-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                  value={formData.caller.title}
                  onChange={(e) => handleInputChange('caller', 'title', e.target.value)}
                />
                <input
                  type="text"
                  placeholder="Company Name *"
                  className="w-full p-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                  value={formData.caller.company}
                  onChange={(e) => handleInputChange('caller', 'company', e.target.value)}
                />
              </div>
            </section>

            {/* Target Prospect */}
            <section className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-indigo-700 uppercase tracking-wide">
                <Building size={14} /> Target Prospect
              </div>
              <div className="grid gap-3">
                <input
                  type="text"
                  placeholder="Target Industry *"
                  className="w-full p-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                  value={formData.prospect.industry}
                  onChange={(e) => handleInputChange('prospect', 'industry', e.target.value)}
                />
                <input
                  type="text"
                  placeholder="Target Role/Title *"
                  className="w-full p-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                  value={formData.prospect.role}
                  onChange={(e) => handleInputChange('prospect', 'role', e.target.value)}
                />
                <select
                  className="w-full p-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                  value={formData.prospect.companySize}
                  onChange={(e) => handleInputChange('prospect', 'companySize', e.target.value)}
                >
                  <option value="1-50 employees">1-50 employees</option>
                  <option value="51-200 employees">51-200 employees</option>
                  <option value="201-1000 employees">201-1000 employees</option>
                  <option value="1000+ employees">1000+ employees</option>
                </select>
              </div>
            </section>

            {/* Value Prop */}
            <section className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-indigo-700 uppercase tracking-wide">
                <Target size={14} /> Value Proposition
              </div>
              <div className="grid gap-3">
                <textarea
                  placeholder="Main Pain Point (e.g., Low lead volume) *"
                  className="w-full p-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 min-h-[60px]"
                  value={formData.valueProp.painPoint}
                  onChange={(e) => handleInputChange('valueProp', 'painPoint', e.target.value)}
                />
                <textarea
                  placeholder="Your Solution (e.g., Automated SEO platform) *"
                  className="w-full p-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 min-h-[60px]"
                  value={formData.valueProp.solution}
                  onChange={(e) => handleInputChange('valueProp', 'solution', e.target.value)}
                />
                <textarea
                  placeholder="Unique Value (e.g., 30% increase in 30 days)"
                  className="w-full p-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 min-h-[60px]"
                  value={formData.valueProp.uniqueValue}
                  onChange={(e) => handleInputChange('valueProp', 'uniqueValue', e.target.value)}
                />
                <input
                  type="text"
                  placeholder="Social Proof (e.g., Worked with IBM)"
                  className="w-full p-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                  value={formData.valueProp.socialProof}
                  onChange={(e) => handleInputChange('valueProp', 'socialProof', e.target.value)}
                />
              </div>
            </section>

            {/* Config */}
            <section className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-indigo-700 uppercase tracking-wide">
                <Lightbulb size={14} /> Call Config
              </div>
              <div className="grid grid-cols-2 gap-3">
                <select
                  className="w-full p-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                  value={formData.config.objective}
                  onChange={(e) => handleInputChange('config', 'objective', e.target.value)}
                >
                  <option value="Discovery Call">Discovery Call</option>
                  <option value="Schedule Demo">Schedule Demo</option>
                  <option value="Book Meeting">Book Meeting</option>
                  <option value="Qualify Lead">Qualify Lead</option>
                </select>
                <select
                  className="w-full p-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                  value={formData.config.tone}
                  onChange={(e) => handleInputChange('config', 'tone', e.target.value)}
                >
                  <option value="Professional">Professional</option>
                  <option value="Casual & Friendly">Casual & Friendly</option>
                  <option value="Consultative">Consultative</option>
                  <option value="Direct & Concise">Direct & Concise</option>
                </select>
              </div>
            </section>

            {/* Generate Button */}
            <div className="pt-2 pb-8">
              <button
                onClick={handleGenerate}
                disabled={loading || !formData.caller.name || !formData.caller.company}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {loading ? (
                   <>
                     <RefreshCw className="animate-spin h-5 w-5" /> Generating...
                   </>
                ) : (
                   <>
                     <FileText size={18} /> Generate Script
                   </>
                )}
              </button>
              {(!formData.caller.name || !formData.caller.company) && (
                <p className="text-xs text-red-500 mt-2 text-center">
                  * Caller Name and Company are required.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Output */}
        <div className="flex-1 flex flex-col bg-white h-[90vh] md:h-auto overflow-hidden">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-white">
             <h3 className="font-semibold text-gray-700 flex items-center gap-2">
               <FileText size={18} className="text-gray-400" /> Script Preview
             </h3>
             <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600">
               <X size={20} />
             </button>
          </div>

          <div className="flex-1 p-6 overflow-y-auto bg-gray-50/30 custom-scrollbar">
            {generatedScript ? (
              <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm max-w-3xl mx-auto">
                <pre className="whitespace-pre-wrap font-sans text-gray-800 leading-relaxed text-sm">
                  {generatedScript}
                </pre>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                  <FileText size={32} className="text-indigo-200" />
                </div>
                <div className="text-center">
                  <p className="font-medium text-gray-600">No script generated yet</p>
                  <p className="text-sm">Fill out the configuration and click Generate.</p>
                </div>
              </div>
            )}
          </div>

          {/* Action Footer */}
          <div className="p-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between gap-4">
             <div className="flex items-center gap-2 text-xs text-gray-500">
               <Lightbulb size={14} className="text-yellow-500" />
               <span className="hidden sm:inline">Tip: Practice the script out loud before calling.</span>
             </div>
             
             <div className="flex items-center gap-3">
                <button
                  onClick={handleDownload}
                  disabled={!generatedScript}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download size={16} /> <span className="hidden sm:inline">Download</span>
                </button>
                <button
                  onClick={handleCopy}
                  disabled={!generatedScript}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  {copied ? 'Copied' : 'Copy Text'}
                </button>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};
