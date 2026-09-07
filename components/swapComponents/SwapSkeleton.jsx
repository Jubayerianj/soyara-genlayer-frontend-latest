
// components/swapComponents/SwapSkeleton.jsx

import React from 'react';

const SwapSkeleton = () => {
  return (
    <div className="swap-container">
      <div className="swap-card">
        <div className="card-header">
          <div className="flex items-center justify-between">
            <div className="h-6 w-16 bg-gray-800 rounded animate-pulse" />
            <div className="flex items-center space-x-2">
              <div className="h-10 w-10 bg-gray-800 rounded-lg animate-pulse" />
              <div className="h-10 w-10 bg-gray-800 rounded-lg animate-pulse" />
            </div>
          </div>
        </div>

        <div className="token-input-section">
          <div className="animate-pulse">
            <div className="flex justify-between mb-2">
              <div className="h-4 w-12 bg-gray-800 rounded" />
              <div className="h-4 w-24 bg-gray-800 rounded" />
            </div>
            <div className="h-20 bg-gray-800 rounded-xl" />
          </div>
        </div>

        <div className="switch-button-container">
          <div className="h-10 w-10 bg-gray-800 rounded-full" />
        </div>

        <div className="token-input-section">
          <div className="animate-pulse">
            <div className="flex justify-between mb-2">
              <div className="h-4 w-12 bg-gray-800 rounded" />
              <div className="h-4 w-24 bg-gray-800 rounded" />
            </div>
            <div className="h-20 bg-gray-800 rounded-xl" />
          </div>
        </div>

        <div className="swap-details">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="detail-row">
              <div className="h-4 w-24 bg-gray-800 rounded" />
              <div className="h-4 w-32 bg-gray-800 rounded" />
            </div>
          ))}
        </div>

        <div className="action-button-container">
          <div className="h-12 bg-gray-800 rounded-lg animate-pulse" />
        </div>
      </div>
    </div>
  );
};

export default SwapSkeleton;