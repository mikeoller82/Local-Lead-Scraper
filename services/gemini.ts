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
  // Matches: comma, space, City name (words), comma, space, State (2 chars), space, Zip (5+4 digits)
  const zipMatch = fullAddress.match(/,\s*([a-zA-Z\s\.]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  
  if (zipMatch) {
    return {
      city: zipMatch[1].trim(),
      state: zipMatch[2].trim(),
      zip: zipMatch[3].trim()
    };
  }

  // Fallback for just "City, ST" if zip is missing
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
    // Regex handles ```json followed by optional newline, content, and ```
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
             reviewCount: item.user_ratings_total || item.reviewCount || 0,
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
  
  onProgress("Accessing Google Maps & Search Indexes...");

  // gemini-2.5-flash is optimized for multi-tool usage and speed
  const modelId = 'gemini-2.5-flash';
  
  // SOPHISTICATED PROMPT:
  // 1. Explicitly asks for 20+ results (Maps usually returns 20 per page).
  // 2. Enforces a fallback: If Maps has no website, use Search.
  // 3. Stricts JSON output.
  const prompt = `
    Find at least 20 businesses matching "${keyword}" in "${location}".
    
    EXECUTION STEPS:
    1. **Primary Source**: Use **Google Maps** to find the list of businesses.
    2. **Data Enrichment**: 
       - For EACH business found, you MUST check if a 'website' is listed.
       - **CRITICAL**: If the Google Maps result does NOT have a website, use **Google Search** to find the official website for that specific business name and city.
       - Do not leave the website field empty unless you are 100% certain no website exists after searching.
    3. **Address Accuracy**: Extract the full specific address, including City and Zip Code.

    RETURN FORMAT:
    Strictly output a JSON array of objects. Do not include markdown code blocks or text outside the JSON.
    
    [
      {
        "name": "Exact Business Name",
        "full_address": "123 Street, City, State Zip",
        "phone": "(555) 123-4567",
        "website": "https://...",
        "rating": 4.8,
        "user_ratings_total": 150,
        "category": "Plumber"
      }
    ]
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        // We provide BOTH tools to allow the model to fallback to Search for missing websites
        tools: [{ googleMaps: {} }, { googleSearch: {} }],
        // Slightly higher temperature to allow it to "think" about using Search
        temperature: 0.7 
      },
    });

    onProgress("Processing intelligence...");

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
      // PRIORITY 1: Use what the AI extracted into the JSON
      let finalCity = lead.city;
      let finalState = lead.state;
      let finalZip = lead.zip;

      // PRIORITY 2: If JSON is missing specific fields, parse the full_address string
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
        // Recalculate score based on reachability
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
  // Unreachable due to handleGeminiError throwing, but needed for TS
  return []; 
};

/**
 * Performs a "Deep Analysis" by using the AI to infer technical details 
 * based on search grounding about the business's web presence.
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
    7. Contact Email: (String) - Search diligently for a public email address (e.g. info@${lead.name.replace(/\s/g,'').toLowerCase()}.com or similar) if not already known.

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
         score, // Update score
         opportunitySummary: summary, // Update summary
         tags // Update tags
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

CALLER INFORMATION:
- Name: ${config.caller.name}
- Title: ${config.caller.title}
- Company: ${config.caller.company}

TARGET PROSPECT:
- Industry: ${config.prospect.industry}
- Role/Title: ${config.prospect.role}
- Company Size: ${config.prospect.companySize}

VALUE PROPOSITION:
- Main Pain Point: ${config.valueProp.painPoint}
- Solution Offered: ${config.valueProp.solution}
- Unique Value: ${config.valueProp.uniqueValue}
- Social Proof: ${config.valueProp.socialProof}

CALL PARAMETERS:
- Objective: ${config.config.objective}
- Tone: ${config.config.tone}

Generate a complete cold call script that includes:
1. GATEKEEPER BYPASS
2. OPENING (Permission-based pattern interrupt)
3. REASON FOR CALL
4. VALUE STATEMENT
5. QUALIFYING QUESTIONS
6. OBJECTION HANDLING
7. CLOSING/NEXT STEPS
8. VOICEMAIL SCRIPT

Make it conversational, professional, and persuasive. Use [Brackets] for coaching notes.
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
        - If the caller sounds robotic, you might hang up or be dismissive.
        - Keep your responses short (1-2 sentences) to simulate a real phone conversation.
        - Do not break character. Do not say "I am an AI". Act exactly like the prospect.
        - Respond naturally to the user's greeting.
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
        Analyze the following cold call transcript between a Salesperson (USER) and a Prospect (MODEL).
        
        TRANSCRIPT:
        ${transcript}
        
        Provide constructive feedback on the Salesperson's performance:
        1. **Strengths**: What did they do well?
        2. **Weaknesses**: Where did they stumble?
        3. **Objection Handling**: How well did they handle pushback?
        4. **Score**: Give a score out of 10.
        
        Keep it concise and actionable.
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
