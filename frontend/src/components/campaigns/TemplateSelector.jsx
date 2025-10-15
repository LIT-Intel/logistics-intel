
import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CampaignTemplate } from '@/api/entities';
import { FileText, Users, Target, ArrowRight, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

export default function TemplateSelector({ onSelectTemplate, onClose }) {
  const [templates, setTemplates] = useState([]);
  const [filteredTemplates, setFilteredTemplates] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [isLoading, setIsLoading] = useState(true);

  const categories = [
    { value: 'all', label: 'All Templates' },
    { value: 'prospecting', label: 'Prospecting' },
    { value: 'nurturing', label: 'Nurturing' },
    { value: 'demo', label: 'Demo & Discovery' },
    { value: 'closing', label: 'Closing' },
    { value: 'followup', label: 'Follow-up' }
  ];

  const loadTemplates = async () => {
    try {
      const templatesData = await CampaignTemplate.filter({ is_active: true }, 'name');
      const validTemplates = Array.isArray(templatesData) ? templatesData : 
                            (templatesData?.data && Array.isArray(templatesData.data)) ? templatesData.data : [];
      setTemplates(validTemplates);
    } catch (error) {
      console.error('Error loading templates:', error);
      setTemplates([]);
    }
    setIsLoading(false);
  };

  const filterTemplates = useCallback(() => {
    let filtered = templates;

    if (searchQuery) {
      filtered = filtered.filter(template => 
        template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        template.objective.toLowerCase().includes(searchQuery.toLowerCase()) ||
        template.audience.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    if (selectedCategory !== 'all') {
      filtered = filtered.filter(template => template.category === selectedCategory);
    }

    setFilteredTemplates(filtered);
  }, [templates, searchQuery, selectedCategory]); // Dependencies for useCallback

  useEffect(() => {
    loadTemplates();
  }, []);

  useEffect(() => {
    filterTemplates();
  }, [filterTemplates]); // Now depends on the memoized filterTemplates function

  const getCategoryColor = (category) => {
    const colors = {
      prospecting: 'bg-blue-100 text-blue-800',
      nurturing: 'bg-green-100 text-green-800', 
      demo: 'bg-purple-100 text-purple-800',
      closing: 'bg-orange-100 text-orange-800',
      followup: 'bg-gray-100 text-gray-800'
    };
    return colors[category] || 'bg-gray-100 text-gray-800';
  };

  const getStepTypeIcon = (type) => {
    switch (type) {
      case 'email': return '📧';
      case 'linkedin_connect': return '🔗';
      case 'linkedin_message': return '💼';
      default: return '📄';
    }
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-center">Loading templates...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl h-[90vh] flex flex-col">
        <div className="p-6 border-b">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-900">Choose Campaign Template</h2>
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>

          {/* Search and Filter */}
          <div className="flex gap-4 mb-4">
            <div className="flex-1 relative">
              <Input
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            </div>
            <div className="flex gap-2">
              {categories.map((category) => (
                <Button
                  key={category.value}
                  variant={selectedCategory === category.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedCategory(category.value)}
                >
                  {category.label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {filteredTemplates.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-4">No templates found matching your criteria.</p>
              <Button variant="outline" onClick={() => { setSearchQuery(''); setSelectedCategory('all'); }}>
                Clear Filters
              </Button>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredTemplates.map((template) => (
                <Card key={template.id} className="hover:shadow-lg transition-shadow cursor-pointer border-2 hover:border-blue-300"
                      onClick={() => onSelectTemplate(template)}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg mb-2">{template.name}</CardTitle>
                        <Badge className={getCategoryColor(template.category)}>
                          {template.category}
                        </Badge>
                      </div>
                      <ArrowRight className="w-5 h-5 text-gray-400" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-600 mb-3">{template.objective}</p>
                    <p className="text-xs text-gray-500 mb-4">{template.audience}</p>
                    
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-gray-700">Sequence ({template.steps.length} steps):</p>
                      <div className="flex flex-wrap gap-1">
                        {template.steps.slice(0, 4).map((step, idx) => (
                          <span key={idx} className="text-xs bg-gray-100 px-2 py-1 rounded" title={step.subject || step.message}>
                            {getStepTypeIcon(step.type)} Day {step.day_offset}
                          </span>
                        ))}
                        {template.steps.length > 4 && (
                          <span className="text-xs text-gray-500">+{template.steps.length - 4} more</span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
