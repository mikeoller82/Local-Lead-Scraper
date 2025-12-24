import { GoogleGenAI } from "@google/genai";
import { BusinessLead, LeadTag } from "../types";
import { calculateLeadScore, determineTags } from "../utils/scoring";
import { validateWebsiteUrl } from "../utils/validation";

// NOTE: We no longer initialize a global client. 
// We create a new instance per request using the user-provided key.

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
             address: item.address,
             phone: item.phone,
             website: item.website,
             rating: item.rating || 0,
             reviewCount: item.user_ratings_total || item.reviewCount || 0,
             category: item.type || item.category,
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

export const searchBusinesses = async (
  apiKey: string,
  keyword: string, 
  location: string, 
  onProgress: (msg: string) => void
): Promise<BusinessLead[]> => {
  
  if (!apiKey) throw new Error("API Key is missing");

  const ai = new GoogleGenAI({ apiKey });
  
  onProgress("Initializing Gemini Maps Session...");

  // We use gemini-2.5-flash for Maps Grounding
  const modelId = 'gemini-2.5-flash';
  
  // Revised prompt: Chain of Thought + strict field mapping
  const prompt = `
    Goal: Find "${keyword}" businesses in "${location}" using Google Maps.
    
    STEP 1: Search Google Maps for the businesses.
    STEP 2: For EACH business found, inspect the data details specifically for the "website" or "websiteUri" field.
    
    *** DATA EXTRACTION RULES ***
    - **WEBSITE**: You must extract the URL found in the 'websiteUri' or 'website' field of the Maps result. 
      - Example: If the map result says "alphasewerandplumbing.com", output "https://alphasewerandplumbing.com".
      - If the website field contains a valid domain, YOU MUST INCLUDE IT.
      - Do NOT return 'null' if a URL exists in the map data.
      - Do NOT return 'google.com/maps/...' links as the website.
    
    STEP 3: Return a JSON array of the businesses.
    
    [
      {
        "name": "Business Name",
        "address": "Full Address",
        "phone": "Phone Number",
        "website": "https://website.com" (OR null),
        "rating": 4.5,
        "user_ratings_total": 120,
        "category": "Primary Category"
      }
    ]
    
    Output ONLY the JSON. No conversational text.
    Ensure you find at least 10-15 results if possible.
  `;

  try {
    onProgress("Querying Google Maps via Gemini...");
    
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        tools: [{ googleMaps: {} }],
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

      const finalLead: BusinessLead = {
        id: `lead-${Date.now()}-${index}`,
        name: lead.name || "Unknown Business",
        address: lead.address || location,
        city: location.split(',')[0], // heuristic
        state: location.split(',')[1]?.trim() || "",
        phone: lead.phone,
        website: lead.website || null,
        rating: lead.rating || 0,
        reviewCount: lead.reviewCount || 0,
        category: lead.category || keyword,
        mapsUri: matchChunk?.maps?.uri || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lead.name + " " + lead.address)}`,
        
        // Initial scoring
        score: 0,
        tags: [],
        opportunitySummary: "",
      };

      const { score, summary } = calculateLeadScore(finalLead);
      finalLead.score = score;
      finalLead.opportunitySummary = summary;
      finalLead.tags = determineTags(finalLead);

      return finalLead;
    });

    return processedLeads;

  } catch (error) {
    console.error("Gemini Search Error:", error);
    throw new Error("Failed to fetch leads. Please check your API key and try again.");
  }
};

/**
 * Deep qualification using Google Search Grounding.
 */
export const deepQualifyLead = async (apiKey: string, lead: BusinessLead): Promise<Partial<BusinessLead>> => {
  if (!apiKey) throw new Error("API Key is missing");

  const ai = new GoogleGenAI({ apiKey });
  const modelId = 'gemini-3-flash-preview';
  
  const prompt = `
    Analyze the online presence for the business "${lead.name}" located at "${lead.address}".
    
    Task:
    1. **WEBSITE RECOVERY**: 
       - Current recorded website: ${lead.website ? lead.website : "MISSING/NULL"}.
       - **MANDATORY**: Search specifically for "${lead.name} ${lead.city} official website".
       - If you find a matching official website (e.g. on the business profile or top search result), RETURN IT, even if the input said missing.
    
    2. Analyze the following:
       - Visual & Structural Quality (Poor/Average/Good)
       - Content Freshness (Fresh/Outdated)
       - Technical Issues (Secure/Hacked)
       - Mobile Friendliness (Yes/No)
       - Broken Links (Yes/No)
    
    Return JSON:
    {
      "found_website_url": "The confirmed website URL (found via search or verified)",
      "website_status": "Active" | "Inactive" | "Missing",
      "visual_quality_score": "Poor" | "Average" | "Good",
      "content_status": "Outdated" | "Fresh" | "Unknown",
      "is_mobile_friendly": true | false,
      "estimated_speed": "Slow" | "Average" | "Fast",
      "has_broken_links": true | false,
      "additional_notes": "Brief summary."
    }
  `;

  const response = await ai.models.generateContent({
    model: modelId,
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json"
    }
  });

  const jsonStr = response.text;
  try {
    const data = JSON.parse(jsonStr);
    
    const updates: Partial<BusinessLead> = {};
    
    // Logic to prefer the found website if the original was null or different
    let candidateWebsite = lead.website;
    if (data.found_website_url && data.found_website_url !== "null") {
       candidateWebsite = data.found_website_url;
    }
    
    // 1. Validate Reachability
    const isReachable = await validateWebsiteUrl(candidateWebsite);

    if (isReachable && candidateWebsite) {
      updates.website = candidateWebsite;
      updates.isWebsiteReachable = true;
      updates.sslSecure = candidateWebsite.toLowerCase().startsWith('https');
    } else {
      updates.isWebsiteReachable = false;
      updates.sslSecure = false;
      if (data.website_status === 'Missing' && !candidateWebsite) {
        updates.website = null;
      }
    }

    updates.hasMobileFriendlySite = data.is_mobile_friendly;
    updates.pageLoadSpeed = data.estimated_speed;
    updates.visualQualityScore = data.visual_quality_score;
    updates.contentStatus = data.content_status;
    updates.hasBrokenLinks = data.has_broken_links;
    
    updates.opportunitySummary = lead.opportunitySummary + ` [Analysis: ${data.additional_notes}]`;
    
    const tempLeadForScoring = { ...lead, ...updates };
    const { score, summary } = calculateLeadScore(tempLeadForScoring);
    const tags = determineTags(tempLeadForScoring);

    updates.score = score;
    updates.opportunitySummary = summary;
    updates.tags = tags;

    return updates;

  } catch (e) {
    console.error("Deep qualify parse error", e);
    return {};
  }
};