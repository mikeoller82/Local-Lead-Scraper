import { GoogleGenAI, ChatSession, GenerateContentResponse } from "@google/genai";
import { BusinessLead, LeadTag, ScriptConfiguration, ChatMessage } from "../types";
import { calculateLeadScore, determineTags } from "../utils/scoring";
import { validateWebsiteUrl } from "../utils/validation";

// NOTE: We no longer initialize a global client. 
// We create a new instance per request using the user-provided key.

/**
 * Helper to extract City, State, Zip from a full address string if the JSON fields are missing.
 * Tries to parse standard US address formats: "123 Main St, City, ST 12345"
 */
const parseAddressString = (fullAddress: string): { city: string, state: string, zip: string } => {
  if (!fullAddress) return { city: "", state: "", zip: "" };
  
  // Regex to look for "City, ST Zip" or "City, ST" at the end of the string
  const zipMatch = fullAddress.match(/,\s*([a-zA-Z\s\.]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  
  if (zipMatch) {
    return {
      city: zipMatch[1].trim(),
      state: zipMatch[2].trim(),
      zip: zipMatch[3].trim()
    };
  }

  // Fallback for just "City, ST"
  const stateMatch = fullAddress.match(/,\s*([a-zA-Z\s\.]+),\s*([A-Z]{2})$/);
  if (stateMatch) {
    return {
      city: stateMatch[1].trim(),
      state: stateMatch[2].trim(),
      zip: ""
    };
  }

  return { city: "", state: "", zip: "" };
};

/**
 * Parses the raw text response from Gemini into structured Business objects.
 */
const parseBusinessResponse = (text: string, chunks: any[]): Partial<BusinessLead>[] => {
  try {
    // Attempt to find a JSON block in the text. 
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\[\s*\{[\s\S]*\}\s*\]/);
    
    if (jsonMatch) {
      const jsonStr = jsonMatch[1] || jsonMatch[0];
      // Sanitize potential trailing commas or markdown issues before parsing
      const sanitized = jsonStr.replace(/,\s*]/g, ']').replace(/,\s*}/g, '}');
      const parsed = JSON.parse(sanitized);
      
      if (Array.isArray(parsed)) {
        return parsed.map((item: any) => {
           return {
             name: item.name,
             address: item.full_address || item.address,
             phone: item.phone,
             email: item.email || "",
             website: item.website,
             rating: item.rating || 0,
             reviewCount: item.user_ratings_total || item.reviewCount || item.review_count || 0,
             category: item.type || item.category,
             // Explicitly capture these fields if returned
             city: item.city,
             state: item.state,
             zip: item.zip_code || item.zip
           };
        });
      }
    }
  } catch (e) {
    console.warn("Failed to parse JSON directly from model response", e);
    console.debug("Raw text was:", text);
  }
  return [];
};

/**
 * Common error handler for Gemini API calls
 */
const handleGeminiError = (error: any): never => {
  console.error("Gemini API Error:", error);
  
  const msg = error.message || JSON.stringify(error);
  
  if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("Quota")) {
    throw new Error("⚠️ Google API Quota Exceeded. Please wait a minute or use a different API key.");
  }
  
  if (msg.includes("API Key is missing")) {
    throw new Error("API Key is missing or invalid.");
  }

  throw new Error(`AI Service Error: ${error.message || "Unknown error occurred"}`);
};

export const searchBusinesses = async (
  apiKey: string,
  keyword: string, 
  location: string, 
  onProgress: (msg: string) => void
): Promise<BusinessLead[]> => {
  
  if (!apiKey) throw new Error("API Key is missing");

  const ai = new GoogleGenAI({ apiKey });
  
  onProgress("Searching Google Maps...");

  const modelId = 'gemini-2.5-flash';
  
  // REVERTED STRATEGY: Use ONLY Google Maps.
  // This prevents the model from timing out or getting confused by trying to use Search simultaneously for 20 items.
  const prompt = `
    Find 20 businesses matching "${keyword}" in "${location}" using Google Maps.
    
    Return a strict JSON array of objects with these fields:
    - name
    - address (full address)
    - phone
    - website (Extract from Google Maps data)
    - rating
    - reviewCount
    - category
    
    Format:
    [
      { "name": "...", "address": "...", "phone": "...", "website": "...", "rating": 4.5, "reviewCount": 100, "category": "..." }
    ]
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        // STRICTLY ONE TOOL for reliability
        tools: [{ googleMaps: {} }],
        temperature: 0.4
      },
    });

    onProgress("Processing results...");

    const text = response.text || "";
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

    const rawLeads = parseBusinessResponse(text, groundingChunks);
    
    if (rawLeads.length === 0) {
      console.warn("No structured leads found in response:", text);
    }

    // Enhance and Score Leads
    const processedLeads: BusinessLead[] = rawLeads.map((lead, index) => {
      // Find a matching chunk if possible to get the real Maps URI
      const matchChunk = groundingChunks.find(c => 
        c.maps?.title && lead.name && c.maps.title.toLowerCase().includes(lead.name.toLowerCase())
      );

      // Determine address components
      let finalCity = lead.city;
      let finalState = lead.state;
      let finalZip = lead.zip;

      if ((!finalCity || !finalState) && lead.address) {
        const parsed = parseAddressString(lead.address);
        if (!finalCity && parsed.city) finalCity = parsed.city;
        if (!finalState && parsed.state) finalState = parsed.state;
        if (!finalZip && parsed.zip) finalZip = parsed.zip;
      }
      
      const finalAddress = lead.address || (matchChunk?.maps?.title) || "Address not listed";

      const partialLead: Partial<BusinessLead> = {
        ...lead,
        id: `lead-${Date.now()}-${index}`,
        address: finalAddress,
        city: finalCity || "Unknown City",
        state: finalState || "",
        zip: finalZip,
        mapsUri: matchChunk?.maps?.uri || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lead.name} ${lead.address || ''}`)}`,
      };

      const tags = determineTags(partialLead);
      const { score, summary } = calculateLeadScore(partialLead);

      return {
        ...partialLead,
        score,
        tags,
        opportunitySummary: summary,
        ghlSyncStatus: 'idle',
        isGeneratingScript: false
      } as BusinessLead;
    });

    onProgress(`Found ${processedLeads.length} leads. Validating websites...`);

    // Parallel Website Validation
    const validatedLeads = await Promise.all(processedLeads.map(async (lead) => {
      if (lead.website) {
        const isReachable = await validateWebsiteUrl(lead.website);
        const updatedLead = { ...lead, isWebsiteReachable: isReachable };
        const { score, summary } = calculateLeadScore(updatedLead);
        const tags = determineTags(updatedLead);
        return { ...updatedLead, score, opportunitySummary: summary, tags };
      }
      return lead;
    }));

    return validatedLeads;

  } catch (error: any) {
    handleGeminiError(error);
  }
  return []; 
};

/**
 * Performs a "Deep Analysis" by using the AI to infer technical details.
 * This is where we use Google Search to find extra data (like email or missing website).
 */
export const deepQualifyLead = async (apiKey: string, lead: BusinessLead): Promise<Partial<BusinessLead>> => {
  const ai = new GoogleGenAI({ apiKey });
  const modelId = 'gemini-2.5-flash';

  const prompt = `
    Analyze the digital presence of "${lead.name}" located in "${lead.city}, ${lead.state}".
    Website: ${lead.website || "No website found"}

    Task: Use Google Search to find recent reviews, social media activity, contact details, and technical details.
    
    Determine the following:
    1. Mobile Friendliness: (True/False/Unknown)
    2. Page Speed: (Slow/Average/Fast)
    3. Visual Quality: (Poor/Average/Good)
    4. SSL Secure: (True/False)
    5. Content Status: (Outdated/Fresh)
    6. Broken Links: (True/False)
    7. Contact Email: (String) - Search diligently for a public email address.

    Return JSON only:
    {
      "hasMobileFriendlySite": boolean,
      "pageLoadSpeed": "Slow" | "Average" | "Fast",
      "visualQualityScore": "Poor" | "Average" | "Good",
      "sslSecure": boolean,
      "contentStatus": "Outdated" | "Fresh",
      "hasBrokenLinks": boolean,
      "email": "string" 
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      }
    });

    const text = response.text || "";
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/) || text.match(/\{[\s\S]*\}/);
    
    if (jsonMatch) {
       const data = JSON.parse(jsonMatch[1] || jsonMatch[0]);
       
       const updatedLeadStub = { ...lead, ...data };
       
       if (!data.email && lead.email) {
          data.email = lead.email; 
       }

       const { score, summary } = calculateLeadScore(updatedLeadStub);
       const tags = determineTags(updatedLeadStub);

       return {
         ...data,
         score,
         opportunitySummary: summary,
         tags
       };
    }
    return {};
  } catch (e) {
    handleGeminiError(e);
    return {};
  }
};

/**
 * Generates a highly personalized cold call script using detailed configuration.
 */
export const generateColdCallScript = async (
  apiKey: string, 
  config: ScriptConfiguration
): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey });
  const modelId = 'gemini-2.5-flash'; 

  const prompt = `
Create a highly personalized, non-generic cold call script with the following specifications:

CALLER: ${config.caller.name}, ${config.caller.title} at ${config.caller.company}
PROSPECT: ${config.prospect.role} in ${config.prospect.industry} (${config.prospect.companySize})
PAIN POINT: ${config.valueProp.painPoint}
SOLUTION: ${config.valueProp.solution}
OBJECTIVE: ${config.config.objective}
TONE: ${config.config.tone}

Generate a complete script with:
1. Gatekeeper Bypass
2. Opening (Pattern Interrupt)
3. Value Pitch
4. Qualification
5. Objection Handling
6. Closing

Format with [Coaching Notes].
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
    });
    return response.text || "Could not generate script.";
  } catch (e) {
    handleGeminiError(e);
    return "Error generating script";
  }
};

/**
 * Initializes a roleplay chat session with an AI acting as the prospect.
 */
export const createPracticeSession = async (apiKey: string, config: ScriptConfiguration): Promise<ChatSession> => {
    const ai = new GoogleGenAI({ apiKey });
    const modelId = 'gemini-2.5-flash';

    const systemInstruction = `
        You are a roleplaying partner. You are acting as a ${config.prospect.role} at a ${config.prospect.companySize} company in the ${config.prospect.industry} industry.
        You are receiving a cold call from ${config.caller.name} from ${config.caller.company}.
        
        Your Personality:
        - Busy and slightly skeptical, but professional.
        - You get many cold calls, so you value brevity.
        - If the caller addresses your pain point (${config.valueProp.painPoint}), you become interested.
        - Keep responses short (1-2 sentences).
        - Do not break character.
    `;

    const chat = ai.chats.create({
        model: modelId,
        config: {
            systemInstruction,
            temperature: 0.9,
        }
    });

    return chat;
};

/**
 * Generates feedback on the practice session.
 */
export const getPracticeFeedback = async (apiKey: string, history: ChatMessage[]): Promise<string> => {
    const ai = new GoogleGenAI({ apiKey });
    const modelId = 'gemini-2.5-flash';

    const transcript = history.map(m => `${m.role.toUpperCase()}: ${m.text}`).join('\n');

    const prompt = `
        Analyze the following cold call transcript.
        
        TRANSCRIPT:
        ${transcript}
        
        Provide feedback on:
        1. Strengths
        2. Weaknesses
        3. Objection Handling
        4. Score (0-10)
    `;

    try {
        const result = await ai.models.generateContent({
            model: modelId,
            contents: prompt
        });
        return result.text || "No feedback generated.";
    } catch (e) {
        console.error("Feedback generation error:", e);
        return "Could not generate feedback.";
    }
};
