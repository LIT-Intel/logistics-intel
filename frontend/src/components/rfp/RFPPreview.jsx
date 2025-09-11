import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mail, FileText, Download, Eye } from 'lucide-react';
import { format } from 'date-fns';

export default function RFPPreview({ quoteData, onSendEmail, onDownloadPDF }) {
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  };

  const getModeIcon = (mode) => {
    const icons = {
      ocean: '🚢',
      air: '✈️',
      truck: '🚚',
      ftl: '🚛'
    };
    return icons[mode] || '🚢';
  };

  const activeModes = quoteData.mode_combo?.split('_') || ['ocean'];

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center bg-white/80 backdrop-blur-sm rounded-xl p-4 shadow-lg border border-gray-200/60">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{quoteData.quote_name}</h2>
          <p className="text-gray-600">{quoteData.origin} → {quoteData.destination}</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={onSendEmail}
            disabled={!quoteData.contact_email}
            className="bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2"
          >
            <Mail className="w-4 h-4" />
            Send via Email
          </Button>
          <Button
            onClick={onDownloadPDF}
            variant="outline"
            className="flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Download PDF
          </Button>
        </div>
      </div>

      {/* Contact Information */}
      {quoteData.contact_email && (
        <Card className="bg-white/80 backdrop-blur-sm shadow-lg border border-gray-200/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Quote Recipient
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-gray-700">Email</p>
                <p className="text-gray-900">{quoteData.contact_email}</p>
              </div>
              {quoteData.contact_name && (
                <div>
                  <p className="text-sm font-medium text-gray-700">Contact Name</p>
                  <p className="text-gray-900">{quoteData.contact_name}</p>
                </div>
              )}
              {quoteData.company_name && (
                <div className="md:col-span-2">
                  <p className="text-sm font-medium text-gray-700">Company</p>
                  <p className="text-gray-900">{quoteData.company_name}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quote Preview */}
      <Card className="bg-white/80 backdrop-blur-sm shadow-lg border border-gray-200/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Quote Preview
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Quote Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h4 className="font-semibold text-gray-900 mb-2">Shipment Details</h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Origin:</span>
                    <span className="font-medium">{quoteData.origin}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Destination:</span>
                    <span className="font-medium">{quoteData.destination}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Commodity:</span>
                    <span className="font-medium">{quoteData.commodity}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Incoterm:</span>
                    <span className="font-medium">{quoteData.incoterm}</span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-gray-900 mb-2">Quote Information</h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Valid Until:</span>
                    <span className="font-medium">
                      {quoteData.valid_until ? format(new Date(quoteData.valid_until), 'MMM dd, yyyy') : 'Not specified'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Cost:</span>
                    <span className="font-bold text-lg text-blue-600">
                      {formatCurrency(quoteData.total_cost)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Mode Breakdown */}
            <div>
              <h4 className="font-semibold text-gray-900 mb-3">Service Breakdown</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeModes.map((mode) => {
                  const modeData = quoteData[`${mode}_json`];
                  if (!modeData || !modeData.rate) return null;

                  return (
                    <div key={mode} className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">{getModeIcon(mode)}</span>
                        <h5 className="font-medium capitalize">{mode} Freight</h5>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Rate:</span>
                          <span className="font-medium">{formatCurrency(modeData.rate)}</span>
                        </div>
                        {modeData.transit_time && (
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Transit:</span>
                            <span className="text-sm">{modeData.transit_time}</span>
                          </div>
                        )}
                        {modeData.notes && (
                          <div className="mt-2">
                            <p className="text-xs text-gray-500">{modeData.notes}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Additional Notes */}
            {quoteData.notes && (
              <div>
                <h4 className="font-semibold text-gray-900 mb-2">Additional Notes</h4>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-gray-700">{quoteData.notes}</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}