export interface BusinessLead {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip?: string;
  phone?: string;
  website?: string | null;
  rating: number;
  reviewCount: number;
  category?: string;
  mapsUri?: string;
  
  // Qualification Data
  score: number;
  tags: LeadTag[];
  opportunitySummary: string;
  
  // Deep Analysis (Optional)
  hasMobileFriendlySite?: boolean;
  pageLoadSpeed?: 'Slow' | 'Average' | 'Fast';
  visualQualityScore?: 'Poor' | 'Average' | 'Good';
  isWebsiteReachable?: boolean;
  sslSecure?: boolean;
  contentStatus?: 'Outdated' | 'Fresh' | 'Unknown';
  hasBrokenLinks?: boolean;
}

export type LeadTag = 
  | 'No Website'
  | 'Low Reviews'
  | 'Poor Rating'
  | 'High Opportunity'
  | 'Needs Reputation Mgmt'
  | 'Solid Business'
  | 'Broken Website'
  | 'Not Secure'
  | 'Outdated Content'
  | 'Slow Site'
  | 'Broken Links';

export interface SearchParams {
  keyword: string;
  location: string;
  radius: number; // in miles
  minReviews: number;
  maxReviews: number;
  minRating: number;
  maxRating: number;
}

export interface SearchState {
  isLoading: boolean;
  isAnalyzing: boolean;
  error: string | null;
  results: BusinessLead[];
  progress: string;
}

export interface ChartData {
  name: string;
  value: number;
  color: string;
}