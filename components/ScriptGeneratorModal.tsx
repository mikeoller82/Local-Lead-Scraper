import React, { useState, useEffect, useRef } from 'react';
import { BusinessLead, ScriptConfiguration, ChatMessage } from '../types';
import { X, Phone, User, Building, Target, Lightbulb, Download, Copy, RefreshCw, AlertCircle, FileText, Check, Mic, MicOff, Send, MessageSquare, Play, StopCircle, Award } from 'lucide-react';
import { generateColdCallScript, createPracticeSession, getPracticeFeedback } from '../services/gemini';
import { ChatSession, GenerateContentResponse } from "@google/genai";

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
  const [activeTab, setActiveTab] = useState<'generator' | 'practice'>('generator');
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

  // Practice Mode State
  const [chatSession, setChatSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isPracticeActive, setIsPracticeActive] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  // Refs
  const recognitionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
      
      if (lead.coldCallScript) {
        setGeneratedScript(lead.coldCallScript);
      } else {
        setGeneratedScript('');
      }
      
      // Reset Practice Mode
      setActiveTab('generator');
      resetPracticeMode();
    }
  }, [isOpen, lead]);

  // Scroll to bottom of chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Initialize Speech Recognition
  useEffect(() => {
    if (typeof window !== 'undefined') {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognition) {
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = false;
            recognitionRef.current.interimResults = false;
            recognitionRef.current.lang = 'en-US';
            
            recognitionRef.current.onresult = (event: any) => {
                 const transcript = event.results[0][0].transcript;
                 setInputText(transcript);
                 // Optional: Auto-send if confident?
                 // For now, let user confirm text.
                 setIsMicActive(false);
            };
            
            recognitionRef.current.onerror = (event: any) => {
                console.error("Speech recognition error", event.error);
                setIsMicActive(false);
            };

            recognitionRef.current.onend = () => {
                setIsMicActive(false);
            };
        }
    }
  }, []);

  if (!isOpen) return null;

  const resetPracticeMode = () => {
      setMessages([]);
      setChatSession(null);
      setIsPracticeActive(false);
      setInputText('');
      setFeedback(null);
      setIsWaitingForResponse(false);
      window.speechSynthesis.cancel();
  };

  const handleInputChange = (section: keyof ScriptConfiguration, field: string, value: string) => {
    setFormData(prev => {
      const updated = {
        ...prev,
        [section]: {
          ...prev[section],
          [field]: value
        }
      };
      
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

  // --- Practice Mode Handlers ---

  const startPractice = async () => {
      resetPracticeMode();
      setIsPracticeActive(true);
      try {
          const session = await createPracticeSession(apiKey, formData);
          setChatSession(session);
          setMessages([{ role: 'model', text: "(Picking up phone...) Hello, who is this?" }]);
          speakText("Hello, who is this?");
      } catch (e) {
          console.error("Failed to start practice session", e);
          setIsPracticeActive(false);
      }
  };

  const endPractice = async () => {
      setIsPracticeActive(false);
      window.speechSynthesis.cancel();
      if (messages.length > 2) {
          setFeedbackLoading(true);
          const result = await getPracticeFeedback(apiKey, messages);
          setFeedback(result);
          setFeedbackLoading(false);
      }
  };

  const sendPracticeMessage = async () => {
      if (!inputText.trim() || !chatSession) return;
      
      const userMsg: ChatMessage = { role: 'user', text: inputText };
      setMessages(prev => [...prev, userMsg]);
      setInputText('');
      setIsWaitingForResponse(true);

      try {
          const result = await chatSession.sendMessage(userMsg.text);
          // Use .text property, not function call
          const responseText = (result as GenerateContentResponse).text || "..."; 
          
          const modelMsg: ChatMessage = { role: 'model', text: responseText };
          setMessages(prev => [...prev, modelMsg]);
          speakText(responseText);
      } catch (e) {
          console.error("Chat Error", e);
          setMessages(prev => [...prev, { role: 'model', text: "[Connection Error]" }]);
      } finally {
          setIsWaitingForResponse(false);
      }
  };

  const toggleMic = () => {
      if (isMicActive) {
          recognitionRef.current?.stop();
      } else {
          setInputText(''); // Clear previous text
          recognitionRef.current?.start();
          setIsMicActive(true);
      }
  };

  const speakText = (text: string) => {
      if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.rate = 1.0;
          utterance.pitch = 1.0;
          window.speechSynthesis.speak(utterance);
      }
  };

  // --- Utils ---

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-hidden">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col border border-gray-200 overflow-hidden">
        
        {/* Header with Tabs */}
        <div className="flex-none bg-white border-b border-gray-200 flex items-center justify-between px-6 py-3">
             <div className="flex items-center gap-6">
                 <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <Phone size={20} className="text-indigo-600" /> Script & Practice
                 </h2>
                 <div className="flex items-center bg-gray-100 p-1 rounded-lg">
                    <button 
                        onClick={() => setActiveTab('generator')}
                        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'generator' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Generator
                    </button>
                    <button 
                         onClick={() => setActiveTab('practice')}
                         className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'practice' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Practice Mode
                    </button>
                 </div>
             </div>
             <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors">
               <X size={20} />
             </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
            {/* View Switching Logic */}
            
            {/* LEFT COLUMN */}
            <div className={`${activeTab === 'practice' ? 'hidden lg:flex lg:w-4/12' : 'w-full md:w-5/12 lg:w-4/12'} bg-gray-50 flex flex-col border-r border-gray-200 overflow-y-auto custom-scrollbar`}>
                {activeTab === 'generator' ? (
                     // CONFIGURATION FORM
                     <div className="p-5 space-y-6">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Configuration</h3>
                        </div>

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
                            placeholder="Main Pain Point *"
                            className="w-full p-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 min-h-[60px]"
                            value={formData.valueProp.painPoint}
                            onChange={(e) => handleInputChange('valueProp', 'painPoint', e.target.value)}
                            />
                            <textarea
                            placeholder="Your Solution *"
                            className="w-full p-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 min-h-[60px]"
                            value={formData.valueProp.solution}
                            onChange={(e) => handleInputChange('valueProp', 'solution', e.target.value)}
                            />
                            <textarea
                            placeholder="Unique Value"
                            className="w-full p-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 min-h-[60px]"
                            value={formData.valueProp.uniqueValue}
                            onChange={(e) => handleInputChange('valueProp', 'uniqueValue', e.target.value)}
                            />
                        </div>
                        </section>

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
                        </div>
                     </div>
                ) : (
                    // SCRIPT REFERENCE (FOR PRACTICE MODE)
                    <div className="h-full flex flex-col p-5 bg-white border-r border-gray-200">
                        <div className="mb-4">
                            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Reference Script</h3>
                            <p className="text-xs text-gray-400">Read from this script during your practice call.</p>
                        </div>
                        <div className="flex-1 overflow-y-auto border border-gray-200 rounded-lg p-4 bg-gray-50 text-sm leading-relaxed custom-scrollbar whitespace-pre-wrap">
                            {generatedScript || "Generate a script first to see it here."}
                        </div>
                    </div>
                )}
            </div>

            {/* RIGHT COLUMN */}
            <div className="flex-1 flex flex-col bg-white h-full overflow-hidden">
                {activeTab === 'generator' ? (
                    // PREVIEW OUTPUT
                    <>
                        <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-white">
                            <h3 className="font-semibold text-gray-700 flex items-center gap-2">
                                <FileText size={18} className="text-gray-400" /> Output Preview
                            </h3>
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
                                        <p className="text-sm">Configure and click generate to start.</p>
                                    </div>
                                </div>
                            )}
                        </div>
                         {/* Action Footer */}
                        <div className="p-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                <Lightbulb size={14} className="text-yellow-500" />
                                <span className="hidden sm:inline">Tip: Switch to "Practice Mode" to roleplay this script.</span>
                            </div>
                            
                            <div className="flex items-center gap-3">
                                <button onClick={handleDownload} disabled={!generatedScript} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                                    <Download size={16} /> Download
                                </button>
                                <button onClick={handleCopy} disabled={!generatedScript} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                                    {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copied' : 'Copy'}
                                </button>
                            </div>
                        </div>
                    </>
                ) : (
                    // PRACTICE MODE UI
                    <div className="flex flex-col h-full bg-slate-50 relative">
                        {/* Status Bar */}
                        <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200 shadow-sm z-10">
                            <div className="flex items-center gap-3">
                                <div className={`w-3 h-3 rounded-full ${isPracticeActive ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`}></div>
                                <span className="font-medium text-gray-700">
                                    {isPracticeActive ? 'Call in Progress...' : 'Session Ready'}
                                </span>
                            </div>
                            {!isPracticeActive ? (
                                <button 
                                    onClick={startPractice} 
                                    disabled={!generatedScript && !formData.caller.name}
                                    className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-sm transition-all"
                                >
                                    <Play size={16} /> Start Call
                                </button>
                            ) : (
                                <button 
                                    onClick={endPractice} 
                                    className="flex items-center gap-2 bg-red-100 hover:bg-red-200 text-red-700 border border-red-200 px-4 py-2 rounded-lg text-sm font-bold transition-all"
                                >
                                    <StopCircle size={16} /> End Call & Get Feedback
                                </button>
                            )}
                        </div>

                        {/* Chat Area */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                            {!isPracticeActive && messages.length === 0 && !feedback && (
                                <div className="h-full flex flex-col items-center justify-center text-gray-400">
                                    <Phone size={48} className="mb-4 text-gray-300" />
                                    <p>Press "Start Call" to begin the roleplay.</p>
                                    <p className="text-sm">The AI will act as {lead.name}.</p>
                                </div>
                            )}

                            {messages.map((msg, idx) => (
                                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                                        msg.role === 'user' 
                                            ? 'bg-indigo-600 text-white rounded-tr-none' 
                                            : 'bg-white text-gray-800 border border-gray-200 rounded-tl-none'
                                    }`}>
                                        {msg.text}
                                    </div>
                                </div>
                            ))}
                            {isWaitingForResponse && (
                                <div className="flex justify-start">
                                    <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-none px-4 py-3 shadow-sm flex items-center gap-2">
                                        <div className="flex space-x-1">
                                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.4s'}}></div>
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Feedback Overlay */}
                        {feedback && (
                            <div className="absolute inset-0 z-20 bg-white/95 backdrop-blur-sm p-8 overflow-y-auto animate-fadeIn">
                                <div className="max-w-2xl mx-auto">
                                    <div className="flex items-center justify-between mb-6">
                                        <h3 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                                            <Award className="text-yellow-500" size={28} /> Performance Review
                                        </h3>
                                        <button onClick={() => setFeedback(null)} className="text-gray-500 hover:text-gray-700">Close</button>
                                    </div>
                                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-lg prose prose-indigo max-w-none">
                                        <div className="whitespace-pre-wrap text-gray-700">{feedback}</div>
                                    </div>
                                    <div className="mt-6 flex justify-end">
                                        <button 
                                            onClick={() => { setFeedback(null); startPractice(); }}
                                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
                                        >
                                            Try Again
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        {/* Loading Feedback Overlay */}
                        {feedbackLoading && (
                             <div className="absolute inset-0 z-20 bg-white/80 backdrop-blur-sm flex items-center justify-center animate-fadeIn">
                                 <div className="text-center">
                                     <RefreshCw className="h-10 w-10 text-indigo-600 animate-spin mx-auto mb-4" />
                                     <h3 className="text-xl font-semibold text-gray-800">Analyzing your performance...</h3>
                                 </div>
                             </div>
                        )}

                        {/* Input Area */}
                        {isPracticeActive && (
                            <div className="p-4 bg-white border-t border-gray-200">
                                <div className="flex items-center gap-3 max-w-4xl mx-auto">
                                    <button 
                                        onClick={toggleMic}
                                        className={`p-3 rounded-full transition-all ${isMicActive ? 'bg-red-100 text-red-600 animate-pulse ring-2 ring-red-400' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                                        title="Toggle Microphone"
                                    >
                                        {isMicActive ? <MicOff size={20} /> : <Mic size={20} />}
                                    </button>
                                    <input 
                                        type="text" 
                                        value={inputText}
                                        onChange={(e) => setInputText(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && sendPracticeMessage()}
                                        placeholder="Type your response or use microphone..."
                                        className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-shadow"
                                        disabled={isWaitingForResponse}
                                    />
                                    <button 
                                        onClick={sendPracticeMessage}
                                        disabled={!inputText.trim() || isWaitingForResponse}
                                        className="p-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50 transition-colors shadow-sm"
                                    >
                                        <Send size={20} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};
