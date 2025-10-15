import React from 'react';
import { Button } from "@/components/ui/button";
import { Lock, Sparkles } from 'lucide-react';

export default function GatedContentPrompt({ title, description, buttonText, onUnlock, isLoading }) {
  return (
    <div className="text-center p-8 md:p-12 my-8 bg-gray-50 rounded-2xl border border-gray-200/80">
      <div className="w-16 h-16 bg-gradient-to-r from-blue-100 to-purple-100 rounded-full flex items-center justify-center mx-auto mb-6">
        <Lock className="w-8 h-8 text-blue-600" />
      </div>
      <h3 className="text-xl font-bold text-gray-800 mb-2">{title}</h3>
      <p className="text-gray-600 max-w-md mx-auto mb-6">{description}</p>
      <Button
        onClick={onUnlock}
        disabled={isLoading}
        className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg"
      >
        <Sparkles className="w-4 h-4 mr-2" />
        {isLoading ? 'Saving...' : buttonText}
      </Button>
    </div>
  );
}