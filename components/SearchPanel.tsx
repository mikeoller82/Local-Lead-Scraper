import React, { useState } from 'react';
import { SearchParams } from '../types';
import { CATEGORIES } from '../constants';
import { Search, MapPin, Sliders, PlayCircle, Loader2 } from 'lucide-react';

interface SearchPanelProps {
  onSearch: (params: SearchParams) => void;
  isLoading: boolean;
}

export const SearchPanel: React.FC<SearchPanelProps> = ({ onSearch, isLoading }) => {
  const [keyword, setKeyword] = useState('Landscaper');
  const [location, setLocation] = useState('Austin, TX');
  const [radius, setRadius] = useState(10);
  const [showFilters, setShowFilters] = useState(false);

  // Filters
  const [minReviews, setMinReviews] = useState(0);
  const [maxReviews, setMaxReviews] = useState(1000);
  const [minRating, setMinRating] = useState(0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch({
      keyword,
      location,
      radius,
      minReviews,
      maxReviews,
      minRating,
      maxRating: 5
    });
  };

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newKeyword = e.target.value;
    setKeyword(newKeyword);
    // Automatically trigger search when category is selected
    onSearch({
      keyword: newKeyword,
      location,
      radius,
      minReviews,
      maxReviews,
      minRating,
      maxRating: 5
    });
  };

  return (
    <div className="bg-white border-b border-gray-200 p-6 sticky top-0 z-20 shadow-sm">
      <div className="max-w-7xl mx-auto">
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col lg:flex-row gap-4">
            
            {/* Main Inputs */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="Keyword (e.g. Plumber)"
                  required
                />
              </div>

              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <MapPin className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder="City, State or Zip"
                  required
                />
              </div>

              <div className="relative">
                 {/* Suggestion dropdown could go here, for now just a select or simple input */}
                 <select
                   value={CATEGORIES.includes(keyword) ? keyword : ""}
                   onChange={handleCategoryChange}
                   className="block w-full pl-3 pr-10 py-2.5 border border-gray-300 rounded-lg leading-5 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                 >
                   <option value="" disabled>Select Category</option>
                   {CATEGORIES.map(cat => (
                     <option key={cat} value={cat}>{cat}</option>
                   ))}
                 </select>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3">
               <button
                 type="button"
                 onClick={() => setShowFilters(!showFilters)}
                 className={`p-2.5 rounded-lg border ${showFilters ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-gray-300 text-gray-600'} hover:bg-gray-50 transition-colors`}
                 title="Advanced Filters"
               >
                 <Sliders className="h-5 w-5" />
               </button>
               
               <button
                 type="submit"
                 disabled={isLoading}
                 className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 px-6 rounded-lg transition-colors shadow-sm disabled:opacity-70 disabled:cursor-not-allowed min-w-[140px]"
               >
                 {isLoading ? <Loader2 className="animate-spin h-5 w-5" /> : <PlayCircle className="h-5 w-5" />}
                 {isLoading ? 'Scraping...' : 'Find Leads'}
               </button>
            </div>
          </div>

          {/* Expanded Filters */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 animate-fadeIn">
              
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Max Reviews</label>
                <div className="flex items-center gap-2">
                   <input 
                     type="range" 
                     min="0" 
                     max="500" 
                     step="10" 
                     value={maxReviews} 
                     onChange={(e) => setMaxReviews(parseInt(e.target.value))}
                     className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                   />
                   <span className="text-sm font-medium w-12 text-right">{maxReviews === 1000 ? 'Any' : `<${maxReviews}`}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Min Rating</label>
                <select 
                  value={minRating}
                  onChange={(e) => setMinRating(parseFloat(e.target.value))}
                  className="block w-full py-1.5 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                >
                  <option value="0">Any Rating</option>
                  <option value="3">3.0+</option>
                  <option value="4">4.0+</option>
                  <option value="4.5">4.5+</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Search Radius</label>
                <select 
                  value={radius}
                  onChange={(e) => setRadius(parseInt(e.target.value))}
                  className="block w-full py-1.5 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                >
                  <option value="5">5 miles</option>
                  <option value="10">10 miles</option>
                  <option value="25">25 miles</option>
                  <option value="50">50 miles</option>
                </select>
              </div>

              <div className="flex items-end">
                 <p className="text-xs text-gray-400 italic">
                   Filters are applied to the results found by Google Maps.
                 </p>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};