import { BusinessLead, LeadTag } from "../types";

export const calculateLeadScore = (lead: Partial<BusinessLead>): { score: number, summary: string } => {
  let score = 0;
  const reasons: string[] = [];

  // --- BASE SCORING (Pre-Deep Analysis) ---

  // 1. Website Presence (Base: 40 points)
  if (!lead.website) {
    score += 40;
    reasons.push("No Website detected");
  } else {
    score += 5; // Small opportunity baseline
  }

  // 2. Reviews (Base: 30 points)
  const count = lead.reviewCount || 0;
  if (count < 10) {
    score += 30;
    reasons.push("Very low review count (<10)");
  } else if (count < 50) {
    score += 15;
    reasons.push("Low review count (<50)");
  }

  // 3. Rating (Base: 20 points)
  const rating = lead.rating || 0;
  if (rating > 0 && rating < 4.0) {
    score += 20;
    reasons.push("Low Rating (< 4.0)");
  } else if (rating >= 4.0 && rating < 4.4) {
    score += 10;
  }

  // --- DEEP ANALYSIS SCORING (Post-Analysis) ---
  
  // 4. Website Reachability (Huge Opportunity)
  if (lead.isWebsiteReachable === false && lead.website) {
    score += 50; // Broken website is often a better lead than no website
    reasons.push("Website Unreachable/Broken");
  }

  // 5. SSL / Security
  if (lead.sslSecure === false && lead.website && lead.isWebsiteReachable !== false) {
    score += 20;
    reasons.push("Not Secure (No SSL)");
  }

  // 6. Mobile Friendliness
  if (lead.hasMobileFriendlySite === false) {
    score += 25;
    reasons.push("Not Mobile Friendly");
  }

  // 7. Page Speed
  if (lead.pageLoadSpeed === 'Slow') {
    score += 15;
    reasons.push("Slow Page Speed");
  }

  // 8. Visual Quality
  if (lead.visualQualityScore === 'Poor') {
    score += 20;
    reasons.push("Poor Visual Quality");
  }

  // 9. Content Freshness
  if (lead.contentStatus === 'Outdated') {
    score += 10;
    reasons.push("Outdated Content");
  }
  
  // 10. Broken Links
  if (lead.hasBrokenLinks) {
    score += 15;
    reasons.push("Broken links detected");
  }

  // Cap score at 100
  score = Math.min(score, 100);

  // Filter unique reasons
  const uniqueReasons = Array.from(new Set(reasons));

  return {
    score,
    summary: uniqueReasons.join(", ") || "Maintains a stable online presence.",
  };
};

export const determineTags = (lead: Partial<BusinessLead>): LeadTag[] => {
  const tags: LeadTag[] = [];

  // Basic Tags
  if (!lead.website) tags.push("No Website");
  if ((lead.reviewCount || 0) < 20) tags.push("Low Reviews");
  if ((lead.rating || 0) > 0 && (lead.rating || 0) < 4.2) tags.push("Poor Rating");
  
  // Deep Analysis Tags
  if (lead.isWebsiteReachable === false && lead.website) tags.push("Broken Website");
  if (lead.sslSecure === false && lead.website) tags.push("Not Secure");
  if (lead.hasMobileFriendlySite === false) tags.push("High Opportunity"); // Not mobile friendly is a key indicator
  if (lead.contentStatus === 'Outdated') tags.push("Outdated Content");
  if (lead.pageLoadSpeed === 'Slow') tags.push("Slow Site");
  if (lead.hasBrokenLinks) tags.push("Broken Links");

  // Composite tags
  if ((lead.rating || 0) < 4.0 || (lead.reviewCount || 0) < 10) {
      tags.push("Needs Reputation Mgmt");
  }

  const { score } = calculateLeadScore(lead);
  if (score > 75) {
    if (!tags.includes("High Opportunity")) tags.push("High Opportunity");
  } else if (score < 30) {
    tags.push("Solid Business");
  }

  return Array.from(new Set(tags));
};

export const exportToCSV = (leads: BusinessLead[]) => {
  // STRICT MAPPING: Includes duplicates as per the GHL snapshot requirements provided
  const headers = [
    "Company Name",
    "Phone",
    "Email",
    "Website",
    "Address",
    "State",
    "City",
    "Description",
    "Postal Code",
    "Country",
    "First Name",
    "Last Name",
    "Email", // Contact Email
    "Phone", // Contact Phone
    "Date Of Birth",
    "Contact Source",
    "Contact Type",
    "Opportunity Name",
    "Your Company Logo (If you don't have one we will make you one)",
    "Company Phone #",
    "Your Official Business Name",
    "Color Scheme Preference For Your Website",
    "Business Instagram Page Link 📷 (if applicable)",
    "Business name as you want it to appear on your website:",
    "Business Facebook Page Link (if applicable)",
    "Link to your current website (IF YOU HAVE ONE)",
    "Business name as it will show on your website",
    "Business Better Business Bureau Page Link (if applicable)",
    "Your “about us” section (this should be 3-5 sentences about yourself and how you got started with the business (remember we are trying to build a personal brand around you)",
    "Business Tiktok Page Link (if applicable)",
    "Do you need us to make you a logo?",
    "Your Hours of operation (so you don’t get bothered when you want to relax)",
    "Yelp Business Page Link (if applicable)",
    "Optional: Discounts you would offer for return customers or friends of past customers (ex $500 off your next roof / 15% off your next driveway wash",
    "All the services you offer and the price for each service",
    "Opportunity Row Number",
    "Give us a few special things about your business that we can show off on your website!",
    "Your social media links (instagram/facebook) (We will link these on your website so people can find you)",
    "Your business's hour of operations (ex: EX: 9 am to 5 pm Mon Friday)",
    "Your Location and the Areas that you service (surrounding cities, suburbs, counties, etc)",
    "Business Phone # (where you want calls forwarded to)",
    "As many before and after pictures as you can get me (For now I will just add a gallery section and leave it blank or include whatever photos you have now, we will add to this over time)",
    "Your Business license # if you have it",
    "Opportunity Status",
    "Will you 100% be able to make your appointment? (*assuming a zombie apocalypse doesn't happen*)",
    "Do You Have a Verified Google My Business Page?",
    "SMS Optin Date",
    "SMS Opt-Out Date",
    "Checkbox 1efu",
    "Business Name",
    "Street Address",
    "City",
    "Country",
    "State",
    "Postal Code",
    "Website",
    "Time Zone",
    "Rate Us"
  ];

  const escape = (val: string | number | undefined | null) => {
      if (val === undefined || val === null) return "";
      const str = String(val);
      // Escape quotes by doubling them, and wrap string in quotes if it contains delimiter/newline
      if (str.includes(",") || str.includes("\n") || str.includes('"')) {
          return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
  };

  const rows = leads.map(lead => {
    // Helper to extract ZIP
    let zip = lead.zip || "";
    if (!zip && lead.address) {
        const match = lead.address.match(/\b\d{5}(?:-\d{4})?\b/);
        if (match) zip = match[0];
    }
    
    // Fallback: If no city/state parsed, try to split from address
    let city = lead.city;
    let state = lead.state;
    if ((!city || !state) && lead.address) {
       const parts = lead.address.split(',');
       if (parts.length >= 2) {
          // Rudimentary parse for "City, State Zip"
          const stateZip = parts[parts.length - 2]?.trim().split(' ');
          if (!state) state = stateZip?.[0] || "";
          if (!city) city = parts[parts.length - 3]?.trim() || "";
       }
    }

    return [
      escape(lead.name), // Company Name
      escape(lead.phone), // Phone
      escape(lead.email), // Email (Updated from "")
      escape(lead.website), // Website
      escape(lead.address), // Address
      escape(state), // State
      escape(city), // City
      escape(lead.opportunitySummary), // Description
      escape(zip), // Postal Code
      "USA", // Country
      "", // First Name (Unknown)
      "", // Last Name (Unknown)
      escape(lead.email), // Email (Contact)
      escape(lead.phone), // Phone (Contact - reused)
      "", // Date Of Birth
      "Local Lead Scraper", // Contact Source
      "Lead", // Contact Type
      escape(lead.name), // Opportunity Name
      "", // Your Company Logo...
      escape(lead.phone), // Company Phone #
      escape(lead.name), // Your Official Business Name
      "", // Color Scheme
      "", // Instagram
      escape(lead.name), // Business name as you want it...
      "", // Facebook
      escape(lead.website), // Link to current website
      escape(lead.name), // Business name as it will show
      "", // BBB
      "", // About us
      "", // Tiktok
      "", // Do you need logo
      "", // Hours
      "", // Yelp
      "", // Discounts
      escape(lead.category), // Services offered
      escape(lead.id), // Opportunity Row Number
      escape(lead.opportunitySummary), // Special things
      "", // Social media links
      "", // Business hours
      escape(`${city}, ${state}`), // Location areas
      escape(lead.phone), // Business Phone # (forwarding)
      "", // Before/after pics
      "", // License
      "Open", // Opportunity Status
      "", // Zombie
      lead.mapsUri ? "Yes" : "No", // Verified GMB
      "", // SMS Optin
      "", // SMS Optout
      "", // Checkbox
      escape(lead.name), // Business Name (General Info)
      escape(lead.address), // Street Address
      escape(city), // City (General Info)
      "USA", // Country (General Info)
      escape(state), // State (General Info)
      escape(zip), // Postal Code (General Info)
      escape(lead.website), // Website (General Info)
      "", // Time Zone
      "" // Rate Us
    ];
  });

  // Use Blob instead of Data URI to prevent size limits and char encoding issues (like # in addresses)
  const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `ghl_leads_export_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // Cleanup
  setTimeout(() => URL.revokeObjectURL(url), 100);
};
