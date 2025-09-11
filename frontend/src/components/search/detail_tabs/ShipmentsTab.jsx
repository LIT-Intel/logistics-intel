
import React, { useState, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Ship, Plane, Truck, Train, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

export default function ShipmentsTab({ shipments, isLoading }) {
  const [sortField, setSortField] = useState('date');
  const [sortDirection, setSortDirection] = useState('desc');
  const [filterMode, setFilterMode] = useState('all');

  // Helper to format weight
  const formatWeight = (weightKg) => {
    if (weightKg === undefined || weightKg === null) return 'N/A';
    if (weightKg >= 1000000) return `${(weightKg / 1000000).toFixed(1)}M kg`;
    if (weightKg >= 1000) return `${(weightKg / 1000).toFixed(0)}K kg`;
    return `${weightKg.toFixed(0)} kg`;
  };

  // Filter and sort shipments
  const filteredAndSortedShipments = useMemo(() => {
    let filtered = shipments;

    if (filterMode !== 'all') {
      filtered = shipments.filter(s => s.mode?.toLowerCase() === filterMode);
    }

    // Ensure filtered is an array before sorting
    if (!Array.isArray(filtered)) {
      filtered = [];
    }

    return [...filtered].sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      // Handle null/undefined values for sorting
      if (aVal === undefined || aVal === null) aVal = ''; // Treat undefined/null as empty string for consistent string sorting
      if (bVal === undefined || bVal === null) bVal = '';

      if (sortField === 'date') {
        aVal = aVal ? new Date(aVal) : new Date(0); // Use epoch for missing dates
        bVal = bVal ? new Date(bVal) : new Date(0);
      } else if (sortField === 'gross_weight_kg') {
        aVal = aVal || 0; // Treat null/undefined weight as 0
        bVal = bVal || 0;
      }

      if (sortDirection === 'asc') {
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return aVal.localeCompare(bVal);
        }
        return aVal > bVal ? 1 : -1;
      } else {
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return bVal.localeCompare(aVal);
        }
        return aVal < bVal ? 1 : -1;
      }
    });
  }, [shipments, sortField, sortDirection, filterMode]);

  const getModeIcon = (mode) => {
    const icons = {
      ocean: Ship,
      air: Plane,
      truck: Truck,
      rail: Train
    };
    // Default to Ship if mode is not recognized
    const IconComponent = icons[mode?.toLowerCase()] || Ship;
    return <IconComponent className="w-4 h-4" />;
  };

  const getModeColor = (mode) => {
    const colors = {
      ocean: 'bg-blue-100 text-blue-800',
      air: 'bg-purple-100 text-purple-800',
      truck: 'bg-green-100 text-green-800',
      rail: 'bg-orange-100 text-orange-800'
    };
    return colors[mode?.toLowerCase()] || 'bg-gray-100 text-gray-800';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!shipments || shipments.length === 0) {
    return (
      <div className="text-center py-8">
        <Ship className="w-12 h-12 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-600 mb-2">No shipment data</h3>
        <p className="text-gray-500">No shipment records found for this company</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <Select value={filterMode} onValueChange={setFilterMode}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="All Modes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Modes</SelectItem>
                <SelectItem value="ocean">Ocean</SelectItem>
                <SelectItem value="air">Air</SelectItem>
                <SelectItem value="truck">Truck</SelectItem>
                <SelectItem value="rail">Rail</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Sort by:</span>
            <Select value={sortField} onValueChange={setSortField}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Date" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date">Date</SelectItem>
                <SelectItem value="gross_weight_kg">Weight</SelectItem>
                <SelectItem value="carrier_name">Carrier</SelectItem>
                <SelectItem value="origin_country">Origin</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
            >
              {sortDirection === 'asc' ? '↑' : '↓'}
            </Button>
          </div>
        </div>

        <div className="text-sm text-gray-600">
          {filteredAndSortedShipments.length} of {shipments.length} shipments
        </div>
      </div>

      {/* Shipments Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Mode</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Route</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Weight</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Carrier</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Commodity</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredAndSortedShipments.slice(0, 50).map((shipment, index) => (
                <tr key={shipment.id || index} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                    {shipment.date ? format(new Date(shipment.date), 'MMM d, yyyy') : 'N/A'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 whitespace-nowrap">
                      {getModeIcon(shipment.mode)}
                      <Badge className={`text-xs ${getModeColor(shipment.mode)}`}>
                        {shipment.mode || 'Unknown'}
                      </Badge>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    <div className="max-w-xs overflow-hidden">
                      <div className="font-medium truncate">
                        {shipment.origin_country || shipment.origin_port || 'Unknown'}
                      </div>
                      <div className="text-gray-500 text-xs truncate">
                        → {shipment.dest_country || shipment.dest_port || 'Unknown'}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-blue-700 whitespace-nowrap">
                    {formatWeight(shipment.gross_weight_kg)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900">
                    <div className="max-w-xs truncate">
                      {shipment.carrier_name || shipment.carrier || 'Unknown'}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    <div className="max-w-xs truncate">
                      {shipment.commodity_description || shipment.hs_code || 'N/A'}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredAndSortedShipments.length > 50 && (
          <div className="bg-gray-50 px-4 py-3 text-center border-t border-gray-200">
            <p className="text-sm text-gray-600">
              Showing first 50 shipments. {filteredAndSortedShipments.length - 50} more available.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
