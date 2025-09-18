import React from "react";

export default function Transactions() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Shipment Transactions</h1>
        <div className="flex space-x-3">
          <button className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50">Filter</button>
          <button className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50">Export</button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Shipment ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Route</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mode</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Value</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {[1,2,3,4,5].map(i => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600">#SH{String(i).padStart(4,'0')}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">Global Corp {i}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">Shanghai → LA</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">Ocean</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">Sep {10+i}, 2025</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${(125000 + i*5000).toLocaleString()}</td>
                  <td className="px-6 py-4 whitespace-nowrap"><span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Delivered</span></td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button className="text-blue-600 hover:text-blue-800 mr-3">View</button>
                    <button className="text-green-600 hover:text-green-800">Export</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

