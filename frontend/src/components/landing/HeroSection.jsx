import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function HeroSection({ data }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState(data.search_types[0]?.value || "company");
  const navigate = useNavigate();

  const handleSearch = () => {
    if (!searchQuery.trim()) return;
    navigate(createPageUrl(`Dashboard?search=${encodeURIComponent(searchQuery)}&type=${searchType}`));
  };

  return (
    <section className="relative bg-gradient-to-b from-blue-50 via-white to-white text-center py-20 md:py-32 lg:py-40">
      <div className="container mx-auto px-4 z-10 relative">
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight max-w-4xl mx-auto"
          dangerouslySetInnerHTML={{ __html: data.heading || "" }}
        >
        </h1>
        <p className="text-lg md:text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
          {data.subheading}
        </p>

        <div className="max-w-2xl mx-auto bg-white/80 backdrop-blur-sm p-4 rounded-2xl shadow-lg border border-gray-200/60">
          <div className="flex flex-col sm:flex-row gap-3">
            <Select value={searchType} onValueChange={setSearchType}>
              <SelectTrigger className="sm:w-48 bg-gray-50 border-0 rounded-xl h-14">
                <SelectValue placeholder="Search type" />
              </SelectTrigger>
              <SelectContent>
                {data.search_types.map(type => (
                  <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex-1 relative">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={data.search_placeholder}
                className="pl-4 pr-12 h-14 text-base md:text-lg bg-gray-50 border-0 rounded-xl focus:bg-white transition-colors"
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              />
              <Search className="absolute right-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            </div>
            <Button
              onClick={handleSearch}
              className="h-14 px-6 md:px-8 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white text-base md:text-lg font-semibold rounded-xl shadow-lg"
            >
              {data.cta_primary_text}
            </Button>
          </div>
        </div>

        <a href={data.cta_secondary_url} className="mt-8 inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 font-medium transition-colors">
          <span>{data.cta_secondary_text}</span>
          <ArrowRight className="w-4 h-4" />
        </a>
      </div>
      <div className="absolute inset-0 bg-grid-slate-100 [mask-image:linear-gradient(to_bottom,white_0%,transparent_50%)] z-0"></div>
    </section>
  );
}