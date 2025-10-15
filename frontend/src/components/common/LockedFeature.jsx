import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Lock, Crown } from 'lucide-react';
import { motion } from 'framer-motion';

export default function LockedFeature({ 
  children, 
  isLocked, 
  onUpgradeClick, 
  title = "Premium Feature",
  description = "Upgrade to access this feature",
  blurContent = true,
  showSnippet = false
}) {
  if (!isLocked) {
    return children;
  }

  return (
    <div className="relative">
      {/* Blurred/dimmed content */}
      {showSnippet && (
        <div className={`${blurContent ? 'filter blur-sm' : 'opacity-50'} pointer-events-none`}>
          {children}
        </div>
      )}
      
      {/* Overlay */}
      <div className={`${showSnippet ? 'absolute inset-0' : ''} flex items-center justify-center ${!showSnippet ? 'min-h-[200px]' : ''}`}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center p-6 bg-white rounded-xl shadow-lg border-2 border-dashed border-gray-300 max-w-md mx-auto"
        >
          <div className="w-12 h-12 mx-auto mb-4 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full flex items-center justify-center">
            <Lock className="w-6 h-6 text-white" />
          </div>
          
          <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
          <p className="text-sm text-gray-600 mb-4">{description}</p>
          
          <Button
            onClick={onUpgradeClick}
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
          >
            <Crown className="w-4 h-4 mr-2" />
            Upgrade Now
          </Button>
        </motion.div>
      </div>
    </div>
  );
}