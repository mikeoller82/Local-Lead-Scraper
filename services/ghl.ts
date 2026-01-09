import { BusinessLead } from "../types";

const GHL_API_BASE = "https://api.highlaunchpad.com/v1";

/**
 * Syncs a qualified lead to GoHighLevel via the provided API Key.
 */
export const syncLeadToGHL = async (lead: BusinessLead, apiKey: string): Promise<boolean> => {
  if (!apiKey) return false;

  // Map BusinessLead to GHL Contact Fields
  // We use the Company Name for the contact Name if no person is identified, 
  // or we leave first/last blank and just use companyName.
  const payload = {
    companyName: lead.name,
    phone: lead.phone || "",
    email: "", // We don't scrape email by default in the Maps scraping
    address1: lead.address,
    city: lead.city,
    state: lead.state,
    postalCode: lead.zip || "",
    website: lead.website || "",
    source: "Local Lead Scraper",
    tags: [
      "Lead Score 50+", 
      `Score: ${lead.score}`,
      ...lead.tags
    ]
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    // Direct fetch attempt
    let response = await fetch(`${GHL_API_BASE}/contacts/`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    // If Direct fetch fails (likely CORS), try Proxy
    if (!response.ok && response.status === 0) { // status 0 usually means network error/CORS
       console.log("Direct GHL fetch failed, trying proxy...");
       const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(`${GHL_API_BASE}/contacts/`)}`;
       response = await fetch(proxyUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    }

    clearTimeout(timeoutId);

    if (response.ok) {
      return true;
    } else {
      const errText = await response.text();
      console.error("GHL Sync Error:", errText);
      return false;
    }
  } catch (error) {
    console.error("GHL Network Error:", error);
    return false;
  }
};