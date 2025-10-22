import React from "react";
import { Bookmark, Clock, MapPin, ArrowRight } from "lucide-react";

const CompanyCardCompact = ({ company, onView, onSave, isSaved, isReady }) => {
  const {
    name,
    alias,
    domain,
    total_shipments,
    last_activity,
    top_route,
    id
  } = company;

  return (
    <div className="bg-white rounded-xl p-5 border-t-4 border-[#7F3DFF] shadow-md hover:shadow-lg transition">
      <div className="flex justify-between items-start mb-2">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{name}</h2>
          <p className="text-sm text-gray-500">
            {alias} {domain ? `| ${domain}` : ""}
          </p>
        </div>
        <button
          onClick={onSave}
          className={`text-white text-sm px-3 py-1 rounded-full ${
            isSaved ? "bg-green-500" : "bg-[#7F3DFF]"
          }`}
        >
          {isSaved ? "Saved" : "Save"}
        </button>
      </div>

      <div className="border-y border-gray-200 py-3 grid grid-cols-2 gap-4 text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <Bookmark size={16} className="text-[#7F3DFF]" />
          <span>
            {total_shipments?.toLocaleString() ?? "--"} Shipments (12m)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-gray-500" />
          <span>Activity: {last_activity ?? "--"}</span>
        </div>
        <div className="col-span-2 flex items-center gap-2 mt-2">
          <MapPin size={16} className="text-gray-500" />
          <span className="text-sm">
            Top Route: {top_route || "--"}
          </span>
        </div>
      </div>

      <div className="flex justify-between items-center mt-4">
        {isReady && (
          <span className="text-xs bg-indigo-100 text-indigo-700 rounded-full px-2 py-0.5">
            Ready
          </span>
        )}
        <button
          onClick={onView}
          className="text-gray-700 text-sm flex items-center gap-1 ml-auto"
        >
          Details <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
};

export default CompanyCardCompact;
