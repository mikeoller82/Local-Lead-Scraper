import { GoogleGenAI } from "@google/genai";
import { BusinessLead, LeadTag } from "../types";
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
    console.error("Gemini Search Error:", error);
    throw new Error(`Search failed: ${error.message}`);
  }
};

/**
 * Performs a "Deep Analysis" by using the AI to infer technical details 
 * based on search grounding about the business's web presence.
 */
export const deepQualifyLead = async (apiKey: string, lead: BusinessLead): Promise<Partial<BusinessLead>> => {
  const ai = new GoogleGenAI({ apiKey });
  const modelId = 'gemini-3-flash-preview';

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
    console.error("Deep analysis failed", e);
    return {};
  }
};

/**
 * Generates a personalized cold call script using AI.
 */
export const generateColdCallScript = async (apiKey: string, lead: BusinessLead): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey });
  const modelId = 'gemini-3-pro-preview'; 

  const prompt = `
You are an elite cold calling closer for a digital marketing agency specializing in local service businesses. Your scripts book demos at a 40%+ conversion rate because they sound like actual human conversations—not sales pitches.

Task:
Generate a cold call script for "${lead.name}" that gets them to agree to a 15-minute demo.

Lead Intelligence (use strategically):
- Industry: ${lead.category}
- Location: ${lead.city}, ${lead.state}
- Lead Score: ${lead.score}/100
- Identified Weaknesses: ${lead.opportunitySummary}
- Tags/Context: ${lead.tags.join(', ')}

Core Philosophy:
You're calling to point out something broken that's costing them money. That's it. No fluff. No hype. Just signal a problem they probably already suspect exists, then offer a quick look at how to fix it.

Script Requirements:

1. OPENER (8-12 seconds)
- Acknowledge it's a cold call immediately
- No fake familiarity
- Get permission to continue in one sentence
- Sound like you're doing them a favor by keeping it brief

Bad: "Hey! How's your day going?"
Good: "This is a cold call, so I'll make it quick—do you have 30 seconds?"

2. CONTEXT (5-8 seconds)
- Mention their city or industry to prove this isn't a blast
- No generic praise
- Establish you looked at their actual business

Bad: "I work with businesses like yours"
Good: "I was looking at HVAC companies in Denver and pulled up your site"

3. THE HOOK (15-20 seconds)
- State ONE specific problem from ${lead.opportunitySummary}
- Connect it directly to lost revenue or missed jobs
- Use plain language a business owner would use
- No marketing jargon

Bad: "Your SEO strategy lacks optimization"
Good: "Your Google listing doesn't show your phone number on mobile, so people are probably calling your competitors instead"

4. PERMISSION QUESTION (1 sentence)
- Get them to confirm the problem or engage
- Make it easy to answer

Examples:
"Is that something you've seen happen?"
"Does that match what you're hearing from customers?"

5. THE CLOSE (10-15 seconds)
- Offer a 15-minute demo
- Frame it as showing them something, not selling them something
- Remove friction
- Make saying yes easier than saying no

Bad: "Can I schedule some time to discuss solutions?"
Good: "I can show you exactly what I'm seeing in 15 minutes tomorrow. No pitch, just screen share what's broken and how to fix it. Does 2pm or 4pm work better?"

Objection Handling (MANDATORY - Include ALL):

"I'm busy / Don't have time" →
Acknowledge. Emphasize brevity. Reframe as time-saving.
Example: "I get it. That's why I'm saying 15 minutes, not an hour. I'll show you the problem in 5 minutes, you tell me if it's worth the other 10. If not, we're done."

"We already work with someone / have a marketing company" →
Don't compete. Position as second opinion.
Example: "That's fine. I'm not trying to replace anyone. This is just about one specific thing I saw that's costing you calls right now. If your team can fix it, perfect. 15 minutes to show you what I mean."

"How much does this cost?" →
Deflect to demo. Never quote pricing on cold call.
Example: "I don't even know if we're a fit yet. The demo's free and there's no obligation. Let me show you what I found, then we can talk about whether it makes sense to work together."
Alternative: "Depends entirely on what you need fixed. I can't quote you without understanding your situation. That's what the 15 minutes is for."

"Send me some information / email me" →
Emails get ignored. Push for live demo.
Example: "I could, but honestly it won't make sense without context. It takes longer to read an email than to just show you on a screen share. How about tomorrow at 3?"
Alternative: "Sure, but you'll delete it. Everyone does. Let me just show you live what I'm talking about, then I'll send a follow-up if it makes sense."

"We don't have the budget right now" →
Separate demo from commitment. Discovery first.
Example: "That's fair. But you don't need a budget to see what's broken. The demo's free. You might find out it's a cheap fix, or something you can handle yourself. Either way, you'll know what the problem is."

"I need to think about it" →
What is there to think about? It's just a demo.
Example: "Think about what? It's 15 minutes to see if there's a problem. Nothing to commit to. If you see it and don't care, we're done. If you do care, then you can think about what to do next."

"We're getting good results already" →
Plant doubt. Challenge complacency.
Example: "That's great. But if your phone number's not showing up on mobile Google searches, you're still losing calls you don't even know about. Takes 15 minutes to see if that's actually happening or not."

"Call me back in a few months" →
The problem exists now. Future call = never.
Example: "I can, but this issue is costing you money today. If I call you in three months, you've lost three more months of leads. Let me just show you what I mean tomorrow and you decide if it's urgent or not."

"Not interested" →
Respect it but challenge the premise.
Example: "Fair enough. But you're not interested in something you haven't seen yet. I'm just asking for 15 minutes to show you one thing that's broken. If I'm wrong, you kick me off the call. Deal?"

Cost Question Deep Handling:

When they push hard on price:
"What's the ballpark?" →
"Anywhere from a few hundred to a few thousand depending on what needs fixing. I genuinely can't tell you more without seeing your full setup. That's the point of the demo."

"Is this going to be expensive?" →
"Compared to what? Losing customers to your competitors every week? Probably not. But I can't give you a number until I see what we're working with."

"What do you typically charge?" →
"Depends on the business. Some clients spend $500 a month, others spend $3,000. But that's after we know what the problem is. Let me show you what I found first."

Hard Rules:
- Total script: 60-75 seconds when read aloud
- Objection responses: 10-20 seconds each, max
- Use contractions (I'm, you're, doesn't)
- No exclamation points
- No words like: revolutionary, game-changer, guaranteed, exclusive, limited-time
- No fake scarcity
- No asking "how are you" or "is this a good time"
- Every sentence should move toward the demo or disqualify
- Never quote specific pricing on the cold call
- Never apologize for calling

Tone Calibration:
- Confident but not cocky
- Helpful but not desperate  
- Direct but not aggressive
- Challenging but not argumentative
- You're a peer calling with useful information, not a vendor begging for attention
- When handling objections: calm, unshaken, matter-of-fact

Output Format:
[OPENER]
Clear dialogue

[CONTEXT]
Clear dialogue

[HOOK]
Clear dialogue

[PERMISSION QUESTION]
Clear dialogue

[CLOSE]
Clear dialogue

---
OBJECTION RESPONSES:

[OBJECTION: I'm busy/No time]
Response

[OBJECTION: We work with someone already]
Response

[OBJECTION: How much does this cost?]
Response

[OBJECTION: Send me information]
Response

[OBJECTION: No budget right now]
Response

[OBJECTION: Need to think about it]
Response

[OBJECTION: Getting good results already]
Response

[OBJECTION: Call back later]
Response

[OBJECTION: Not interested]
Response

[COST QUESTION: What's the ballpark?]
Response

[COST QUESTION: Is this expensive?]
Response

[COST QUESTION: What do you typically charge?]
Response

---

The script should sound like you're pointing at something specific on their porch that's broken, not trying to sell them a whole new house. Objections are not roadblocks—they're opportunities to reframe the demo as low-risk and high-value.
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
    });
    return response.text || "Could not generate script.";
  } catch (e) {
    console.error("Script generation failed", e);
    return "Error generating script.";
  }
};
