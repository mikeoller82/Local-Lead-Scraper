export const CATEGORIES = [
  "Plumber",
  "Electrician",
  "HVAC Contractor",
  "Roofer",
  "Landscaper",
  "General Contractor",
  "Painter",
  "Cleaning Service",
  "Pest Control",
  "Locksmith",
  "Moving Company",
  "Garage Door Service",
  "Window Installation",
  "Solar Installer"
];

export const MOCK_LEADS = []; // We will use live API, but keep this if needed for UI testing

// Color coding for scores
export const getScoreColor = (score: number) => {
  if (score >= 80) return "text-red-600 bg-red-50"; // High urgency/opportunity
  if (score >= 50) return "text-orange-600 bg-orange-50";
  return "text-green-600 bg-green-50";
};

export const getScoreBadgeColor = (score: number) => {
  if (score >= 80) return "bg-red-100 text-red-800 border-red-200";
  if (score >= 50) return "bg-orange-100 text-orange-800 border-orange-200";
  return "bg-green-100 text-green-800 border-green-200";
};
