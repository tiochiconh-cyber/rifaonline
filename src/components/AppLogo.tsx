import React from "react";

interface AppLogoProps {
  settings?: {
    logoUrl?: string;
    logoBase64?: string;
  };
  className?: string; // custom classes
  size?: "sm" | "md" | "lg" | "xl";
}

export default function AppLogo({ settings, className = "", size = "md" }: AppLogoProps) {
  // If the admin uploaded a custom logo, we render it
  if (settings?.logoBase64 || settings?.logoUrl) {
    const src = settings.logoBase64 || settings.logoUrl;
    
    const sizeClasses = {
      sm: "h-9 w-9 rounded-full object-contain bg-slate-900 border border-amber-400 p-0.5",
      md: "h-14 w-14 rounded-full object-contain bg-slate-100 dark:bg-slate-900 border-2 border-amber-400 p-1",
      lg: "h-24 w-24 rounded-full object-contain bg-slate-100 dark:bg-slate-900 border-2 border-amber-400 p-1.5",
      xl: "h-40 w-40 rounded-full object-contain bg-slate-100 dark:bg-slate-900 border-4 border-amber-400 p-2"
    };

    return (
      <img
        src={src}
        alt="Rifa do Chiquinho"
        className={`${sizeClasses[size]} ${className} shadow-md`}
        referrerPolicy="no-referrer"
      />
    );
  }

  // Fallback high-fidelity vector illustration logo for Rifa do Chiquinho
  // Styled identically to their uploaded logo: circular gold/black badge with yellow/black title text, and ticket icon
  const dims = {
    sm: { box: "w-10 h-10", svg: "w-10 h-10", text: "text-[7px]", labelY: 31 },
    md: { box: "w-16 h-16", svg: "w-16 h-16", text: "text-[10px]", labelY: 48 },
    lg: { box: "w-28 h-28", svg: "w-28 h-28", text: "text-[16px]", labelY: 82 },
    xl: { box: "w-44 h-44", svg: "w-44 h-44", text: "text-[24px]", labelY: 130 }
  };

  const selectedSize = dims[size];

  return (
    <div className={`relative flex items-center justify-center shrink-0 ${selectedSize.box} ${className} select-none`}>
      <svg 
        viewBox="0 0 100 100" 
        className={`${selectedSize.svg} drop-shadow-md`}
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Background Shield/Circle */}
        <circle cx="50" cy="50" r="46" fill="#111827" stroke="#fbbf24" strokeWidth="3" />
        <circle cx="50" cy="50" r="41" fill="none" stroke="#f59e0b" strokeWidth="1" strokeDasharray="3,3" />

        {/* Outer Highlight Ring */}
        <circle cx="50" cy="50" r="48" fill="none" stroke="#fef08a" strokeWidth="1.2" className="opacity-80" />

        {/* Illustration of Three Tickets - Centered and fanned out similar to their logo */}
        <g transform="translate(18, 10)">
          {/* Ticket 1 Left */}
          <g transform="rotate(-20 15 35)">
            <rect x="5" y="10" width="20" height="34" rx="2" fill="#eab308" stroke="#111827" strokeWidth="1.5" />
            <line x1="8" y1="14" x2="22" y2="14" stroke="#111827" strokeWidth="1" strokeDasharray="1,1" />
            <line x1="8" y1="40" x2="22" y2="40" stroke="#111827" strokeWidth="1" strokeDasharray="1,1" />
            <circle cx="5" cy="27" r="2.5" fill="#111827" />
            <circle cx="25" cy="27" r="2.5" fill="#111827" />
            <text x="15" y="30" fontSize="7" fill="#111827" fontWeight="900" textAnchor="middle" transform="rotate(-90 15 28)">RIFA</text>
          </g>

          {/* Ticket 2 Center */}
          <g transform="rotate(0 32 35)">
            <rect x="22" y="7" width="20" height="34" rx="2" fill="#fbbf24" stroke="#111827" strokeWidth="1.5" />
            <line x1="25" y1="11" x2="39" y2="11" stroke="#111827" strokeWidth="1" strokeDasharray="1,1" />
            <line x1="25" y1="37" x2="39" y2="37" stroke="#111827" strokeWidth="1" strokeDasharray="1,1" />
            <circle cx="22" cy="24" r="2.5" fill="#111827" />
            <circle cx="42" cy="24" r="2.5" fill="#111827" />
            <text x="32" y="27" fontSize="7" fill="#111827" fontWeight="900" textAnchor="middle" transform="rotate(-90 32 25)">RIFA</text>
          </g>

          {/* Ticket 3 Right */}
          <g transform="rotate(20 49 35)">
            <rect x="39" y="10" width="20" height="34" rx="2" fill="#f59e0b" stroke="#111827" strokeWidth="1.5" />
            <line x1="42" y1="14" x2="56" y2="14" stroke="#111827" strokeWidth="1" strokeDasharray="1,1" />
            <line x1="42" y1="40" x2="56" y2="40" stroke="#111827" strokeWidth="1" strokeDasharray="1,1" />
            <circle cx="39" cy="27" r="2.5" fill="#111827" />
            <circle cx="59" cy="27" r="2.5" fill="#111827" />
            <text x="49" y="30" fontSize="7" fill="#111827" fontWeight="900" textAnchor="middle" transform="rotate(-90 49 28)">RIFA</text>
          </g>
        </g>

        {/* Avatar/Mascot representation in the middle: Friendly smiley face with gold headphones/airpods */}
        <g transform="translate(0, 5)">
          {/* Collar of red t-shirt */}
          <path d="M35 65 Q50 72 65 65 L60 80 Q50 82 40 80 Z" fill="#dc2626" stroke="#111827" strokeWidth="1" />
          
          {/* Head & neck */}
          <rect x="46" y="52" width="8" height="15" fill="#b45309" stroke="#111827" strokeWidth="1" />
          <ellipse cx="50" cy="46" rx="12" ry="14" fill="#d97706" stroke="#111827" strokeWidth="1.5" />
          
          {/* Hair and Beard */}
          <path d="M38 42 Q50 35 62 42 Q62 34 50 34 Q38 34 38 42 Z" fill="#1c1917" />
          <path d="M38 46 Q40 58 50 60 Q60 58 62 46 Q64 54 50 61 Q36 54 38 46 Z" fill="#1c1917" />
          
          {/* Smile/Teeth */}
          <path d="M44 49 Q50 54 56 49 Z" fill="#ffffff" stroke="#111827" strokeWidth="0.8" />
          
          {/* Eyes */}
          <circle cx="46" cy="43" r="1.5" fill="#111827" />
          <circle cx="54" cy="43" r="1.5" fill="#111827" />

          {/* AirPods */}
          <circle cx="37" cy="46" r="1.8" fill="#ffffff" stroke="#111827" strokeWidth="0.6" />
          <line x1="37" y1="47.5" x2="35.5" y2="52" stroke="#ffffff" strokeWidth="1" />
          <circle cx="63" cy="46" r="1.8" fill="#ffffff" stroke="#111827" strokeWidth="0.6" />
          <line x1="63" y1="47.5" x2="64.5" y2="52" stroke="#ffffff" strokeWidth="1" />
        </g>

        {/* Stylized Badge for the brand on top of the circle base */}
        <path d="M10 72 L90 72 L85 91 L15 91 Z" fill="#111827" stroke="#fbbf24" strokeWidth="1.5" />
        
        {/* 'RIFA DO' small label badge */}
        <rect x="35" y="66" width="30" height="9" rx="1.5" fill="#dc2626" stroke="#000000" strokeWidth="0.8" />
        <text x="50" y="72.5" fontSize="5.5" fill="#ffffff" fontWeight="900" textAnchor="middle" fontFamily="sans-serif" letterSpacing="0.5">
          RIFA DO
        </text>

        {/* 'CHIQUINHO' main label text */}
        <text 
          x="50" 
          y="85.5" 
          fontSize="8.5" 
          fill="#fbbf24" 
          stroke="#000000" 
          strokeWidth="0.8" 
          fontWeight="900" 
          textAnchor="middle" 
          fontFamily="sans-serif" 
          letterSpacing="0.8"
        >
          CHIQUINHO
        </text>
      </svg>
    </div>
  );
}
