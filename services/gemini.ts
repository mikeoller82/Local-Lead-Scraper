import { GoogleGenAI } from "@google/genai";
import { BusinessLead, LeadTag, ScriptConfiguration } from "../types";
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
  
  onProgress("Initializing Multi-Tool Session...");

  // We use gemini-2.5-flash because it supports BOTH Maps and Search grounding simultaneously.
  const modelId = 'gemini-2.5-flash';
  
  // LOGIC UPDATE: We now instruct the model to use Search as a fallback if Maps is missing the website.
  const prompt = `
    Find "${keyword}" businesses in or near "${location}".
    
    EXECUTION LOGIC:
    1. Use **Google Maps** to find the business list, ratings, and addresses.
    2. **CRITICAL LOCATION ACCURACY**:
       - You MUST extract the ACTUAL City, State, and Zip Code from the specific address returned by Google Maps for EACH business.
       - **DO NOT** use the user's search location (e.g., "${location}") as the default for the business location. 
       - If the user searches "St. Louis" but the business is in "Clayton, MO", list "Clayton" as the city.
    3. **WEBSITE CHECK**:
       - Check the Maps data for a 'website' or 'websiteUri'.
       - IF the website is missing in the Maps data, use **Google Search** to find the official website.
    
    RETURN FORMAT:
    Return a STRICT JSON array (no markdown text outside JSON):
    
    [
      {
        "name": "Business Name",
        "full_address": "123 Main St, City, ST 12345",
        "city": "City Name (Extracted from address)",
        "state": "ST (Extracted from address)",
        "zip_code": "12345 (Extracted from address)",
        "phone": "Phone Number",
        "website": "https://verified-url.com",
        "rating": 4.5,
        "user_ratings_total": 120,
        "category": "Primary Category"
      }
    ]
    
    Find at least 15 results. Prioritize businesses that look like good leads (e.g. might have lower reviews or older sites).
  `;

  try {
    onProgress("Querying Google Maps & Search Indexes...");
    
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        // LOGIC REFINEMENT: Enable BOTH tools to fix the "missing website" false negative.
        tools: [{ googleMaps: {} }, { googleSearch: {} }],
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
      
      // PRIORITY 3: Do NOT fallback to search location for City/State/Zip to avoid hallucinations.
      // Leave them blank if unknown, so the user knows the data is missing rather than wrong.

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

    Task: Use Google Search to find recent reviews, social media activity, and technical details about their website if it exists.
    
    Determine the following:
    1. Mobile Friendliness: (True/False/Unknown) - Is there evidence the site is mobile responsive?
    2. Page Speed: (Slow/Average/Fast) - Any complaints or indicators of speed?
    3. Visual Quality: (Poor/Average/Good) - Based on design standards or descriptions.
    4. SSL Secure: (True/False) - Does the link use HTTPS?
    5. Content Status: (Outdated/Fresh) - Are there recent posts or updates (2024-2025)?
    6. Broken Links: (True/False) - Common issue reported?

    Return JSON only:
    {
      "hasMobileFriendlySite": boolean,
      "pageLoadSpeed": "Slow" | "Average" | "Fast",
      "visualQualityScore": "Poor" | "Average" | "Good",
      "sslSecure": boolean,
      "contentStatus": "Outdated" | "Fresh",
      "hasBrokenLinks": boolean
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
       
       // Update logic: Recalculate score with new deep data
       const updatedLeadStub = { ...lead, ...data };
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
  // Using gemini-2.5-flash as it is fast and creative enough for this task
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

1. **GATEKEEPER BYPASS** (if applicable)
   - Professional approach to get past the receptionist
   - Pattern interrupt if needed

2. **OPENING** (First 10 seconds)
   - Personalized introduction
   - Permission-based pattern interrupt
   - Avoid generic "How are you today?"

3. **REASON FOR CALL** (15-20 seconds)
   - Specific, relevant reason tied to their industry/role
   - Reference to research or trigger event if possible

4. **VALUE STATEMENT** (20 seconds)
   - Clear articulation of value specific to their pain point
   - Quantifiable benefit or outcome
   - Reference to similar company success

5. **QUALIFYING QUESTIONS** (3-5 questions)
   - Open-ended questions that uncover needs
   - Questions that get them talking about challenges
   - Budget/authority qualifying questions

6. **OBJECTION HANDLING**
   - "I'm not interested" response
   - "Send me information" response
   - "I'm too busy" response
   - "We're already working with someone" response
   - "Call me back in [timeframe]" response

7. **CLOSING/NEXT STEPS**
   - Clear, specific call-to-action
   - Calendar booking technique
   - Alternative close options

8. **VOICEMAIL SCRIPT**
   - Compelling 20-30 second voicemail
   - Callback hook
   - Clear next action

REQUIREMENTS:
- Make it conversational, not robotic
- Use industry-specific language and insights
- Include natural transitions and tonality cues
- Add [PAUSE] markers where appropriate
- Include confidence-building affirmations in brackets
- Make it feel personalized, not templated
- Use the "${config.config.tone}" tone throughout
- Focus on the prospect, not just the product
- Build curiosity and intrigue
- Include tactical empathy statements

Format the script clearly with sections and include brief coaching notes in [brackets] for delivery tips.
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
