import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Loader2, TrendingUp, Ship, Building2, Users } from 'lucide-react';
import { enrichCompany } from '@/api/functions';

export default function EnrichmentTab({ 
  company, 
  onCompanyUpdate, 
  user, 
  isGated, 
  onUnlock, 
  isLoading, 
  onEnrich, 
  isEnriching 
}) {
  const [enrichmentData, setEnrichmentData] = useState(null);
  const [error, setError] = useState(null);

  const handleEnrichNow = async () => {
    if (!company?.id) return;
    
    setError(null);
    try {
      const response = await enrichCompany({ company_id: company.id });
      
      if (response.data?.ok) {
        setEnrichmentData({
          profile: response.data.profile,
          score: response.data.score
        });
        if (onCompanyUpdate) {
          onCompanyUpdate({
            ...company,
            enrichment_status: 'enriched',
            enrichment_data: response.data
          });
        }
      } else {
        setError(response.data?.error || "Enrichment failed");
      }
    } catch (err) {
      console.error("Enrichment error:", err);
      setError("Enrichment failed: " + err.message);
    }
  };

  if (isGated) {
    return (
      <div className="text-center py-12">
        <div className="mb-4">
          <Sparkles className="mx-auto h-12 w-12 text-gray-400" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">AI Insights Available</h3>
        <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto">
          Save this company to unlock AI-powered insights including trade patterns, commodities analysis, and business intelligence.
        </p>
        <Button onClick={onUnlock} disabled={isLoading} className="bg-blue-600 hover:bg-blue-700">
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Company to Unlock
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">AI-Powered Business Intelligence</h3>
        <Button 
          onClick={handleEnrichNow}
          disabled={isEnriching}
          className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800"
        >
          {isEnriching && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <Sparkles className="w-4 h-4 mr-2" />
          {isEnriching ? 'Enriching...' : 'Enrich Now'}
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      {enrichmentData ? (
        <div className="space-y-6">
          {enrichmentData.score && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-green-600" />
                  Business Score
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4">
                  <div className="text-3xl font-bold text-green-600">
                    {enrichmentData.score.overall || 'N/A'}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-600">
                      Overall business activity score based on trade patterns and volume
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {enrichmentData.profile && (
            <div className="grid md:grid-cols-2 gap-6">
              {enrichmentData.profile.top_lanes && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Ship className="w-5 h-5 text-blue-600" />
                      Top Trade Lanes
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {enrichmentData.profile.top_lanes.map((lane, idx) => (
                      <div key={idx} className="flex justify-between items-center">
                        <span className="text-sm">{lane.route}</span>
                        <Badge variant="outline">{lane.volume} shipments</Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {enrichmentData.profile.top_commodities && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Building2 className="w-5 h-5 text-purple-600" />
                      Top Commodities
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {enrichmentData.profile.top_commodities.map((commodity, idx) => (
                      <div key={idx} className="flex justify-between items-center">
                        <span className="text-sm">{commodity.name}</span>
                        <Badge variant="outline">{commodity.percentage}%</Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {enrichmentData.profile.top_carriers && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="w-5 h-5 text-orange-600" />
                      Preferred Carriers
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {enrichmentData.profile.top_carriers.map((carrier, idx) => (
                      <div key={idx} className="flex justify-between items-center">
                        <span className="text-sm">{carrier.name}</span>
                        <Badge variant="outline">{carrier.share}%</Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-12">
          <Sparkles className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Generate AI Insights</h3>
          <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto">
            Click "Enrich Now" to generate comprehensive business intelligence using AI analysis of trade patterns.
          </p>
        </div>
      )}
    </div>
  );
}