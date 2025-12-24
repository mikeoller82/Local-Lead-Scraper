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
      const parsed = JSON.parse(jsonStr);
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
  
  // Revised prompt to be extremely explicit about extracting the website field
  const prompt = `
    Find "${keyword}" businesses in "${location}" using Google Maps.
    
    *** URGENT DATA EXTRACTION RULES ***
    1. **WEBSITE URL (Priority #1)**: 
       - You MUST check the Google Maps "Website" button/field for EVERY result.
       - If a domain is listed (e.g., "alphasewerandplumbing.com"), you **MUST** extract it.
       - **Do NOT return null** if the website is visible on the listing.
       - Ignore "google.com" or "business.site" links; find the actual domain if possible.
    
    2. **Details**: Extract Name, Address, Phone, Rating, and Review Count.
    
    Return a strictly formatted JSON array of at least 15 businesses:
    
    [
      {
        "name": "Business Name",
        "address": "Full Address",
        "phone": "Phone Number",
        "website": "https://actual-domain.com" (OR null only if strictly missing),
        "rating": 4.5,
        "user_ratings_total": 120,
        "category": "Primary Category"
      }
    ]
    
    Do not add markdown formatting outside the JSON. 
    ACCURACY CHECK: Do not say the website is missing if it is on the Maps card.
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
       - Current Website Status: ${lead.website ? lead.website : "MISSING"}.
       - If "MISSING", perform a targeted Google Search for "${lead.name} ${lead.city} official website".
       - If you find the official site, return it.
       - If "${lead.website}" is provided, verify it is their actual site.
    2. Visual & Structural Quality: Check if the website appears modern or outdated. Assess its design quality as "Poor", "Average", or "Good".
    3. Content Freshness: Look for copyright dates (e.g. 2023 vs 2015) or recent blog posts. Is the content "Fresh" or "Outdated"?
    4. Technical Issues: Look for mentions of the site being "down", "hacked", or "not secure". 
    5. Mobile & Speed Check: Search for indications if the site is mobile-friendly. Search for performance signals (e.g. "slow site", "fast loading") in reviews or search snippets.
    6. Broken Links: Look for indications of broken links or 404 errors on the site from search results or cached versions.
    
    Return a JSON object with:
    {
      "found_website_url": "The confirmed website URL (found via search or verified)",
      "website_status": "Active" | "Inactive" | "Missing",
      "visual_quality_score": "Poor" | "Average" | "Good",
      "content_status": "Outdated" | "Fresh" | "Unknown",
      "is_mobile_friendly": true | false,
      "estimated_speed": "Slow" | "Average" | "Fast",
      "has_broken_links": true | false,
      "additional_notes": "Short summary of findings including any broken links or security warnings found."
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
    const candidateWebsite = data.found_website_url || lead.website;
    
    // 1. Validate Reachability
    const isReachable = await validateWebsiteUrl(candidateWebsite);

    if (isReachable && candidateWebsite) {
      updates.website = candidateWebsite;
      updates.isWebsiteReachable = true;
      
      // 2. Check SSL (Basic heuristic based on URL protocol)
      // If the validated URL starts with https, we assume basic SSL is present.
      // Note: validateWebsiteUrl validates the 'candidateWebsite' string.
      updates.sslSecure = candidateWebsite.toLowerCase().startsWith('https');

    } else {
      updates.isWebsiteReachable = false;
      updates.sslSecure = false; // Cannot be secure if unreachable
      if (data.website_status === 'Missing' && !candidateWebsite) {
        updates.website = null;
      }
    }

    updates.hasMobileFriendlySite = data.is_mobile_friendly;
    updates.pageLoadSpeed = data.estimated_speed;
    updates.visualQualityScore = data.visual_quality_score;
    updates.contentStatus = data.content_status;
    updates.hasBrokenLinks = data.has_broken_links;
    
    // Add notes to summary
    updates.opportunitySummary = lead.opportunitySummary + ` [Deep Dive: ${data.additional_notes}]`;
    
    // Re-score based on new data
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