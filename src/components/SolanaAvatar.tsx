import { FC } from 'react';

/**
 * Solana-gradient default avatar: person silhouette with "?" in Solana colors.
 * Used when a user hasn't set their profile picture yet.
 */
export const SolanaAvatar: FC<{ size?: number; className?: string }> = ({ size = 32, className = '' }) => {
  const uid = `solGrad_${size}`;
  const clipId = `solClip_${size}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className} style={{ borderRadius: '50%' }}>
      <defs>
        <linearGradient id={uid} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#9945FF" />
          <stop offset="50%" stopColor="#14F195" />
          <stop offset="100%" stopColor="#E839F6" />
        </linearGradient>
        <clipPath id={clipId}><circle cx="32" cy="32" r="32" /></clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <circle cx="32" cy="32" r="32" fill={`url(#${uid})`} />
        <circle cx="32" cy="22" r="11" fill="rgba(255,255,255,0.92)" />
        <ellipse cx="32" cy="54" rx="17" ry="14" fill="rgba(255,255,255,0.92)" />
        <text x="32" y="40" textAnchor="middle" fontSize="16" fontWeight="bold" fill="#7C3AED" fontFamily="sans-serif">?</text>
      </g>
    </svg>
  );
};
