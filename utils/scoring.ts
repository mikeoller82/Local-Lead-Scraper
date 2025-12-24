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
  const headers = [
    "Business Name", "Score", "Category", "City", "State", 
    "Phone", "Website", "Reviews", "Rating", "Google Maps URL", 
    "SSL Secure", "Mobile Friendly", "Speed", "Reachability", "Broken Links", "Tags", "Opportunity Notes"
  ];

  const rows = leads.map(lead => [
    lead.name,
    lead.score,
    lead.category,
    lead.city,
    lead.state,
    lead.phone || "",
    lead.website || "N/A",
    lead.reviewCount,
    lead.rating,
    lead.mapsUri,
    lead.sslSecure === false ? "No" : "Yes/Unknown",
    lead.hasMobileFriendlySite === false ? "No" : "Yes/Unknown",
    lead.pageLoadSpeed || "N/A",
    lead.isWebsiteReachable === false ? "Unreachable" : "Active",
    lead.hasBrokenLinks ? "Yes" : "No",
    lead.tags.join(", "),
    `"${lead.opportunitySummary}"` // Wrap in quotes to handle commas
  ]);

  const csvContent = "data:text/csv;charset=utf-8," 
    + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `leads_export_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};