import React from 'react';

export const CricketBall = ({ size = 24, className = '' }) => (
  <svg viewBox="0 0 100 100" className={className} width={size} height={size}>
    {/* Ball Base */}
    <circle cx="50" cy="50" r="45" fill="#B32428" />
    {/* Inner Seam lines */}
    <path d="M 50 5 Q 70 50 50 95" fill="none" stroke="#FFF" strokeWidth="2" strokeDasharray="4 3" />
    <path d="M 50 5 Q 30 50 50 95" fill="none" stroke="#FFF" strokeWidth="2" strokeDasharray="4 3" />
    {/* Center solid seam */}
    <line x1="50" y1="5" x2="50" y2="95" stroke="#FFF" strokeWidth="1" />
  </svg>
);

export const BatIcon = ({ size = 16, className = '' }) => (
  <svg viewBox="0 0 100 100" className={className} width={size} height={size} style={{ verticalAlign: 'middle', marginRight: '4px' }}>
    {/* Handle Grip */}
    <rect x="44" y="5" width="12" height="30" fill="#8B4513" rx="2" />
    {/* Handle Top Ring */}
    <rect x="42" y="5" width="16" height="4" fill="#000" rx="1" />
    {/* Blade */}
    <path d="M 40 35 L 60 35 L 60 90 Q 50 100 40 90 Z" fill="#DEB887" />
    {/* V splice detail */}
    <path d="M 44 35 L 50 45 L 56 35" fill="none" stroke="#8B4513" strokeWidth="2" />
  </svg>
);
