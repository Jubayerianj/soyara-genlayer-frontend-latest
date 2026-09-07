
// components/portfolio/PortfolioSkeleton.jsx

import React from 'react';
import { motion } from 'framer-motion';

const PortfolioSkeleton = () => {
  return (
    <div className="portfolio-skeleton">
      {/* Header Skeleton */}
      <div className="skeleton-header">
        <div className="skeleton-title"></div>
        <div className="skeleton-refresh"></div>
      </div>

      {/* Summary Cards Skeleton */}
      <div className="skeleton-summary">
        {[1, 2, 3].map(i => (
          <div key={i} className="skeleton-summary-card"></div>
        ))}
      </div>

      {/* Tabs Skeleton */}
      <div className="skeleton-tabs">
        <div className="skeleton-tab"></div>
        <div className="skeleton-tab"></div>
      </div>

      {/* Content Skeleton */}
      <div className="skeleton-content">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="skeleton-card"></div>
        ))}
      </div>

      <style jsx>{`
        .portfolio-skeleton {
          max-width: 1200px;
          margin: 0 auto;
          padding: 2rem 1rem;
        }

        .skeleton-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 2rem;
        }

        .skeleton-title {
          width: 200px;
          height: 40px;
          background: linear-gradient(90deg, #2d2d4d 25%, #3d3d5d 50%, #2d2d4d 75%);
          background-size: 200% 100%;
          border-radius: 8px;
          animation: shimmer 1.5s infinite;
        }

        .skeleton-refresh {
          width: 120px;
          height: 40px;
          background: linear-gradient(90deg, #2d2d4d 25%, #3d3d5d 50%, #2d2d4d 75%);
          background-size: 200% 100%;
          border-radius: 12px;
          animation: shimmer 1.5s infinite;
        }

        .skeleton-summary {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 1.5rem;
          margin-bottom: 2rem;
        }

        .skeleton-summary-card {
          height: 120px;
          background: linear-gradient(90deg, #2d2d4d 25%, #3d3d5d 50%, #2d2d4d 75%);
          background-size: 200% 100%;
          border-radius: 20px;
          animation: shimmer 1.5s infinite;
        }

        .skeleton-tabs {
          display: flex;
          gap: 0.5rem;
          background: #0f0f1f;
          border-radius: 16px;
          padding: 0.5rem;
          margin-bottom: 2rem;
        }

        .skeleton-tab {
          flex: 1;
          height: 50px;
          background: linear-gradient(90deg, #2d2d4d 25%, #3d3d5d 50%, #2d2d4d 75%);
          background-size: 200% 100%;
          border-radius: 12px;
          animation: shimmer 1.5s infinite;
        }

        .skeleton-content {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 1rem;
        }

        .skeleton-card {
          height: 180px;
          background: linear-gradient(90deg, #2d2d4d 25%, #3d3d5d 50%, #2d2d4d 75%);
          background-size: 200% 100%;
          border-radius: 16px;
          animation: shimmer 1.5s infinite;
        }

        @keyframes shimmer {
          0% {
            background-position: -200% 0;
          }
          100% {
            background-position: 200% 0;
          }
        }

        @media (max-width: 768px) {
          .skeleton-summary {
            grid-template-columns: 1fr;
          }

          .skeleton-content {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
};

export default PortfolioSkeleton;