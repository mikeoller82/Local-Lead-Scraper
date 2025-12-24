import React from 'react';
import { BusinessLead } from '../types';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';

interface StatsOverviewProps {
  leads: BusinessLead[];
}

export const StatsOverview: React.FC<StatsOverviewProps> = ({ leads }) => {
  if (leads.length === 0) return null;

  // Data for "Opportunity Distribution"
  const highOpp = leads.filter(l => l.score >= 70).length;
  const medOpp = leads.filter(l => l.score >= 40 && l.score < 70).length;
  const lowOpp = leads.filter(l => l.score < 40).length;

  const pieData = [
    { name: 'High Opportunity', value: highOpp, color: '#ef4444' }, // red-500
    { name: 'Medium', value: medOpp, color: '#f97316' }, // orange-500
    { name: 'Low Priority', value: lowOpp, color: '#10b981' }, // green-500
  ].filter(d => d.value > 0);

  // Data for "Missing Websites"
  const missingWeb = leads.filter(l => !l.website).length;
  const hasWeb = leads.length - missingWeb;
  
  const webData = [
    { name: 'Has Website', value: hasWeb },
    { name: 'No Website', value: missingWeb },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      
      {/* Card 1: Total Leads */}
      <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm flex flex-col justify-center items-center">
        <h3 className="text-gray-500 text-sm font-medium uppercase tracking-wider">Total Leads</h3>
        <p className="text-4xl font-bold text-gray-900 mt-2">{leads.length}</p>
        <span className="text-xs text-gray-400 mt-1">Scraped from Google Maps</span>
      </div>

      {/* Card 2: Opportunity Breakdown */}
      <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
        <h3 className="text-gray-500 text-sm font-medium uppercase tracking-wider mb-2">Lead Quality</h3>
        <div className="h-24 w-full">
           <ResponsiveContainer width="100%" height="100%">
             <BarChart data={pieData} layout="vertical">
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 10}} />
                <Tooltip cursor={{fill: 'transparent'}} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
             </BarChart>
           </ResponsiveContainer>
        </div>
      </div>

       {/* Card 3: Website Stats */}
      <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
         <h3 className="text-gray-500 text-sm font-medium uppercase tracking-wider mb-2">Website Status</h3>
         <div className="flex items-center justify-between px-4 h-full pb-4">
            <div className="text-center">
               <div className="text-2xl font-bold text-gray-900">{hasWeb}</div>
               <div className="text-xs text-gray-500">Has Site</div>
            </div>
            <div className="h-10 w-px bg-gray-200"></div>
            <div className="text-center">
               <div className="text-2xl font-bold text-red-600">{missingWeb}</div>
               <div className="text-xs text-gray-500">Missing</div>
            </div>
         </div>
      </div>
    </div>
  );
};
