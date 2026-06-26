/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// =========================================================================
// OFFLINE HIGH-QUALITY VECTOR PRESETS
// Generates beautifully styled architectural and interior illustrations using SVGs.
// This completely eliminates any external image loading dependency and provides
// instant, offline, high-fidelity mockups directly from the admin portal.
// =========================================================================

export interface ImagePreset {
  id: string;
  name: string;
  category: 'property' | 'room';
  dataUrl: string;
}

// Helper to encode SVG strings cleanly for img src
function svgToDataUrl(svgString: string): string {
  const cleaned = svgString
    .replace(/"/g, "'")
    .replace(/%/g, '%25')
    .replace(/#/g, '%23')
    .replace(/{/g, '%7B')
    .replace(/}/g, '%7D')
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E')
    .replace(/\s+/g, ' ');
  return `data:image/svg+xml;utf8,${cleaned}`;
}

const PROPERTY_1_SVG = `
<svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" style="background:#0f172a; font-family:sans-serif;">
  <defs>
    <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1e1b4b"/>
      <stop offset="40%" stop-color="#311042"/>
      <stop offset="100%" stop-color="#1e1b4b"/>
    </linearGradient>
    <linearGradient id="wallGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
    <linearGradient id="accentGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f59e0b"/>
      <stop offset="100%" stop-color="#d97706"/>
    </linearGradient>
    <linearGradient id="glowGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fef08a" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="#f59e0b" stop-opacity="0.1"/>
    </linearGradient>
  </defs>

  <!-- Sky -->
  <rect width="800" height="500" fill="url(#skyGrad)" />
  
  <!-- Stars & Clouds -->
  <circle cx="150" cy="80" r="1.5" fill="#fff" opacity="0.8"/>
  <circle cx="280" cy="120" r="1" fill="#fff" opacity="0.5"/>
  <circle cx="450" cy="70" r="2" fill="#fff" opacity="0.9"/>
  <circle cx="620" cy="100" r="1.5" fill="#fff" opacity="0.6"/>
  <circle cx="710" cy="60" r="1" fill="#fff" opacity="0.4"/>
  
  <path d="M50 150 Q100 130 150 150 T250 150 T350 150 Q400 160 450 150 T550 150 T650 150 Q700 140 750 150" fill="none" stroke="#334155" stroke-width="2" opacity="0.3"/>

  <!-- Moon -->
  <circle cx="680" cy="90" r="30" fill="#fef08a" opacity="0.15"/>
  <circle cx="680" cy="90" r="20" fill="#fef08a" opacity="0.9"/>
  <circle cx="673" cy="83" r="18" fill="url(#skyGrad)"/>

  <!-- Building Silhouette Back -->
  <rect x="50" y="250" width="120" height="200" fill="#0b0f19" />
  <rect x="630" y="200" width="120" height="250" fill="#0b0f19" />

  <!-- Main Samara Stay Villa Structure -->
  <rect x="200" y="160" width="400" height="290" rx="16" fill="url(#wallGrad)" stroke="#334155" stroke-width="2" />
  
  <!-- Wood Accent Siding -->
  <rect x="220" y="180" width="80" height="250" rx="8" fill="#78350f" opacity="0.8"/>
  <line x1="220" y1="210" x2="300" y2="210" stroke="#451a03" stroke-width="2" />
  <line x1="220" y1="240" x2="300" y2="240" stroke="#451a03" stroke-width="2" />
  <line x1="220" y1="270" x2="300" y2="270" stroke="#451a03" stroke-width="2" />
  <line x1="220" y1="300" x2="300" y2="300" stroke="#451a03" stroke-width="2" />
  <line x1="220" y1="330" x2="300" y2="330" stroke="#451a03" stroke-width="2" />
  <line x1="220" y1="360" x2="300" y2="360" stroke="#451a03" stroke-width="2" />
  <line x1="220" y1="390" x2="300" y2="390" stroke="#451a03" stroke-width="2" />

  <!-- Main Entrance Glass Portal -->
  <rect x="440" y="340" width="100" height="110" rx="4" fill="#020617" stroke="#475569" stroke-width="2" />
  <rect x="450" y="350" width="35" height="100" fill="#38bdf8" opacity="0.3" />
  <rect x="495" y="350" width="35" height="100" fill="#38bdf8" opacity="0.3" />
  
  <!-- Warm Entrance Glow -->
  <polygon points="440,450 410,500 570,500 540,450" fill="url(#glowGrad)" opacity="0.3"/>

  <!-- Balcony Floor 2 -->
  <rect x="330" y="240" width="240" height="70" rx="8" fill="#1e293b" stroke="#334155" stroke-width="1.5"/>
  <!-- Glass Window Balcony -->
  <rect x="350" y="250" width="90" height="50" rx="4" fill="#020617" />
  <rect x="355" y="255" width="80" height="40" fill="#fef08a" opacity="0.8" />
  <!-- Window Grid lines & Light Beam -->
  <line x1="395" y1="250" x2="395" y2="300" stroke="#1e293b" />
  <polygon points="355,295 280,420 420,420 435,295" fill="url(#glowGrad)" opacity="0.4"/>

  <rect x="470" y="250" width="80" height="50" rx="4" fill="#020617" />
  <rect x="475" y="255" width="70" height="40" fill="#38bdf8" opacity="0.4" />

  <!-- Premium Roof Deck -->
  <rect x="180" y="140" width="440" height="20" rx="6" fill="url(#accentGrad)" />
  <line x1="200" y1="120" x2="200" y2="140" stroke="#cbd5e1" stroke-width="2" />
  <line x1="600" y1="120" x2="600" y2="140" stroke="#cbd5e1" stroke-width="2" />
  <line x1="200" y1="122" x2="600" y2="122" stroke="#cbd5e1" stroke-width="1.5" />

  <!-- Greenery & Landscaping -->
  <ellipse cx="140" cy="460" rx="80" ry="30" fill="#065f46" />
  <ellipse cx="660" cy="460" rx="90" ry="30" fill="#065f46" />
  <ellipse cx="400" cy="480" rx="300" ry="40" fill="#047857" />
  
  <!-- Cozy Ground Lights -->
  <circle cx="280" cy="450" r="4" fill="#fbbf24" />
  <polygon points="280,450 250,480 310,480" fill="url(#glowGrad)" opacity="0.3"/>
  
  <circle cx="560" cy="450" r="4" fill="#fbbf24" />
  <polygon points="560,450 530,480 590,480" fill="url(#glowGrad)" opacity="0.3"/>

  <!-- Logo Banner Overlay -->
  <rect x="30" y="30" width="220" height="40" rx="10" fill="#000" opacity="0.6"/>
  <text x="45" y="55" fill="#f59e0b" font-weight="900" font-size="14" font-family="monospace" letter-spacing="1">SAMARA STAY PREMIUM</text>
</svg>
`;

const PROPERTY_2_SVG = `
<svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" style="background:#18181b; font-family:sans-serif;">
  <defs>
    <linearGradient id="skyGrad2" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#020617"/>
      <stop offset="100%" stop-color="#180c24"/>
    </linearGradient>
    <linearGradient id="wallGrad2" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#3f3f46"/>
      <stop offset="100%" stop-color="#18181b"/>
    </linearGradient>
    <linearGradient id="glowGrad2" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fca5a5" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="#ec4899" stop-opacity="0.05"/>
    </linearGradient>
  </defs>

  <!-- Sky -->
  <rect width="800" height="500" fill="url(#skyGrad2)" />
  
  <!-- Stars -->
  <circle cx="100" cy="100" r="1" fill="#fff" opacity="0.4"/>
  <circle cx="300" cy="60" r="1.5" fill="#fff" opacity="0.7"/>
  <circle cx="500" cy="110" r="1" fill="#fff" opacity="0.3"/>
  <circle cx="700" cy="70" r="1.5" fill="#fff" opacity="0.6"/>

  <!-- Forest Back Silhouette -->
  <path d="M 0,400 L 50,370 L 100,390 L 150,360 L 200,380 L 250,350 L 300,370 L 350,360 L 400,390 L 450,360 L 500,380 L 550,360 L 600,390 L 650,370 L 700,385 L 750,360 L 800,400 L 800,500 L 0,500 Z" fill="#09090b" />

  <!-- Putri Exclusive Building -->
  <rect x="250" y="150" width="300" height="300" rx="20" fill="url(#wallGrad2)" stroke="#ec4899" stroke-width="1.5" stroke-opacity="0.5"/>
  
  <!-- Architectural Pink Accent Panel -->
  <path d="M 250,200 L 350,150 L 350,450 L 250,450 Z" fill="#9d174d" opacity="0.75" />
  
  <!-- Windows with Cozy Warm Lighting -->
  <rect x="275" y="220" width="50" height="60" rx="6" fill="#09090b" />
  <rect x="280" y="225" width="40" height="50" rx="4" fill="#fca5a5" opacity="0.9" />
  <polygon points="280,275 220,380 340,380 320,275" fill="url(#glowGrad2)" opacity="0.3" />

  <rect x="450" y="220" width="50" height="60" rx="6" fill="#09090b" />
  <rect x="455" y="225" width="40" height="50" rx="4" fill="#fef08a" opacity="0.85" />

  <!-- Floor 1 Large French Window/Door -->
  <rect x="380" y="320" width="120" height="130" rx="8" fill="#18181b" stroke="#ec4899" stroke-width="2" />
  <rect x="390" y="330" width="45" height="120" fill="#fbcfe8" opacity="0.4" />
  <rect x="445" y="330" width="45" height="120" fill="#fbcfe8" opacity="0.4" />
  <line x1="440" y1="320" x2="440" y2="450" stroke="#ec4899" stroke-width="1.5" />

  <!-- Front Fence/Hedge with Cute Flowers -->
  <rect x="150" y="420" width="500" height="30" rx="10" fill="#065f46" />
  <circle cx="180" cy="425" r="5" fill="#f43f5e" />
  <circle cx="280" cy="430" r="4" fill="#f43f5e" />
  <circle cx="380" cy="425" r="5" fill="#fca5a5" />
  <circle cx="480" cy="428" r="4" fill="#f43f5e" />
  <circle cx="580" cy="425" r="6" fill="#fca5a5" />

  <!-- Cozy Yard Grass -->
  <ellipse cx="400" cy="485" rx="350" ry="35" fill="#047857" />

  <!-- Cute Pathway -->
  <path d="M 440,450 L 380,500 L 460,500 L 440,450 Z" fill="#27272a" />

  <!-- Logo Banner -->
  <rect x="30" y="30" width="220" height="40" rx="10" fill="#000" opacity="0.6"/>
  <text x="45" y="55" fill="#ec4899" font-weight="900" font-size="14" font-family="monospace" letter-spacing="1">SAMARA STAY PUTRI</text>
</svg>
`;

const PROPERTY_3_SVG = `
<svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" style="background:#090d16; font-family:sans-serif;">
  <defs>
    <linearGradient id="skyGrad3" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#050b14"/>
      <stop offset="100%" stop-color="#111c30"/>
    </linearGradient>
    <linearGradient id="wallGrad3" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
    <linearGradient id="cyanGlow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#22d3ee" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="#0891b2" stop-opacity="0.05"/>
    </linearGradient>
  </defs>

  <!-- Sky -->
  <rect width="800" height="500" fill="url(#skyGrad3)" />
  
  <!-- Grid Lines Tech Background -->
  <line x1="0" y1="100" x2="800" y2="100" stroke="#1e293b" stroke-dasharray="5 10" opacity="0.3"/>
  <line x1="0" y1="200" x2="800" y2="200" stroke="#1e293b" stroke-dasharray="5 10" opacity="0.3"/>
  <line x1="0" y1="300" x2="800" y2="300" stroke="#1e293b" stroke-dasharray="5 10" opacity="0.3"/>
  
  <line x1="150" y1="0" x2="150" y2="500" stroke="#1e293b" stroke-dasharray="5 10" opacity="0.2"/>
  <line x1="350" y1="0" x2="350" y2="500" stroke="#1e293b" stroke-dasharray="5 10" opacity="0.2"/>
  <line x1="550" y1="0" x2="550" y2="500" stroke="#1e293b" stroke-dasharray="5 10" opacity="0.2"/>

  <!-- Building Silhouette Back -->
  <rect x="80" y="180" width="100" height="320" fill="#0c1322" />
  <rect x="620" y="220" width="120" height="280" fill="#0c1322" />

  <!-- Putra Premium Hub Building -->
  <rect x="230" y="120" width="340" height="330" rx="12" fill="url(#wallGrad3)" stroke="#0ea5e9" stroke-width="2" />
  
  <!-- Tech Structural Columns -->
  <rect x="210" y="100" width="20" height="350" rx="4" fill="#334155" />
  <rect x="570" y="100" width="20" height="350" rx="4" fill="#334155" />
  
  <!-- Windows with Blue/Cyan Tech Vibe -->
  <rect x="260" y="160" width="60" height="60" rx="6" fill="#020617" stroke="#0ea5e9" stroke-width="1"/>
  <rect x="265" y="165" width="50" height="50" rx="4" fill="#22d3ee" opacity="0.8" />
  <polygon points="265,215 190,340 330,340 315,215" fill="url(#cyanGlow)" opacity="0.35"/>

  <rect x="370" y="160" width="60" height="60" rx="6" fill="#020617" stroke="#0ea5e9" stroke-width="1"/>
  <rect x="375" y="165" width="50" height="50" rx="4" fill="#22d3ee" opacity="0.2" />

  <rect x="480" y="160" width="60" height="60" rx="6" fill="#020617" stroke="#0ea5e9" stroke-width="1"/>
  <rect x="485" y="165" width="50" height="50" rx="4" fill="#e0f2fe" opacity="0.4" />

  <!-- Lower level windows -->
  <rect x="260" y="260" width="60" height="60" rx="6" fill="#020617" />
  <rect x="265" y="265" width="50" height="50" rx="4" fill="#22d3ee" opacity="0.3" />

  <rect x="370" y="260" width="60" height="60" rx="6" fill="#020617" />
  <rect x="375" y="265" width="50" height="50" rx="4" fill="#22d3ee" opacity="0.85" />
  <polygon points="375,315 310,430 440,430 425,315" fill="url(#cyanGlow)" opacity="0.35"/>

  <rect x="480" y="260" width="60" height="60" rx="6" fill="#020617" />
  <rect x="485" y="265" width="50" height="50" rx="4" fill="#22d3ee" opacity="0.1" />

  <!-- Ground Landscaping -->
  <ellipse cx="400" cy="470" rx="360" ry="35" fill="#022c22" />
  <ellipse cx="400" cy="480" rx="300" ry="25" fill="#065f46" />

  <!-- Sleek Gate / Pillar Lights -->
  <circle cx="220" cy="420" r="5" fill="#06b6d4" />
  <circle cx="580" cy="420" r="5" fill="#06b6d4" />

  <!-- Logo Banner -->
  <rect x="30" y="30" width="220" height="40" rx="10" fill="#000" opacity="0.6"/>
  <text x="45" y="55" fill="#38bdf8" font-weight="900" font-size="14" font-family="monospace" letter-spacing="1">SAMARA STAY PUTRA</text>
</svg>
`;

const ROOM_1_SVG = `
<svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" style="background:#0f172a; font-family:sans-serif;">
  <defs>
    <linearGradient id="bedGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#334155"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
    <linearGradient id="warmLamp" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fef08a" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#fbbf24" stop-opacity="0.05"/>
    </linearGradient>
  </defs>

  <!-- Wall Background -->
  <rect width="800" height="500" fill="#1e293b" />
  <!-- Accent Wall Color -->
  <rect x="0" y="0" width="300" height="400" fill="#0f172a" />
  
  <!-- Base floor -->
  <rect x="0" y="400" width="800" height="100" fill="#451a03" />
  <!-- Cozy Area Rug -->
  <ellipse cx="400" cy="440" rx="280" ry="40" fill="#1e1b4b" />
  <ellipse cx="400" cy="440" rx="270" ry="35" fill="#311042" />

  <!-- Big Window to Outside Night Sky -->
  <rect x="420" y="50" width="260" height="180" rx="12" fill="#020617" stroke="#475569" stroke-width="6" />
  <circle cx="480" cy="110" r="15" fill="#fef08a" opacity="0.2"/>
  <circle cx="480" cy="110" r="10" fill="#fef08a" opacity="0.9"/>
  <circle cx="475" cy="105" r="9" fill="#020617"/>
  <circle cx="580" cy="90" r="1" fill="#fff" opacity="0.6"/>
  <circle cx="630" cy="130" r="1.5" fill="#fff" opacity="0.8"/>
  <line x1="550" y1="50" x2="550" y2="230" stroke="#475569" stroke-width="2" />

  <!-- Desk & Study Chair Area -->
  <rect x="80" y="280" width="160" height="12" rx="4" fill="#b45309" />
  <rect x="95" y="292" width="10" height="110" fill="#78350f" />
  <rect x="215" y="292" width="10" height="110" fill="#78350f" />
  
  <!-- Desk Lamp -->
  <path d="M 110,280 L 125,240 L 115,235" stroke="#f59e0b" stroke-width="4" fill="none" />
  <path d="M 105,235 Q 115,220 125,235 Z" fill="#f59e0b" />
  <polygon points="115,235 70,280 160,280" fill="url(#warmLamp)" opacity="0.4" />

  <!-- Cozy Laptop on Desk -->
  <rect x="150" y="265" width="45" height="12" rx="2" fill="#94a3b8" />
  <polygon points="152,265 158,250 188,250 193,265" fill="#cbd5e1" />
  <rect x="160" y="253" width="28" height="10" fill="#38bdf8" opacity="0.8" />

  <!-- Bed Structure -->
  <rect x="350" y="280" width="400" height="120" rx="10" fill="url(#bedGrad)" />
  <rect x="330" y="300" width="440" height="100" rx="8" fill="#1e293b" stroke="#334155" />
  
  <!-- Bed Mattress -->
  <rect x="340" y="270" width="420" height="50" rx="12" fill="#f8fafc" />
  
  <!-- Pillows -->
  <rect x="360" y="250" width="80" height="30" rx="6" fill="#fb7185" />
  <rect x="380" y="255" width="70" height="25" rx="6" fill="#f43f5e" />

  <!-- Cozy Blanket / Bedspread -->
  <rect x="450" y="268" width="310" height="54" rx="4" fill="#3b82f6" />
  <path d="M 450,268 C 470,280 490,260 510,268 C 530,280 550,260 570,268 C 590,280 610,260 630,268 L 760,268 L 760,322 L 450,322 Z" fill="#1d4ed8" />

  <!-- Nightstand with Vase -->
  <rect x="290" y="320" width="50" height="80" rx="6" fill="#78350f" />
  <ellipse cx="315" cy="305" rx="10" ry="15" fill="#22d3ee" />
  <line x1="315" y1="290" x2="315" y2="300" stroke="#059669" stroke-width="2" />
  <circle cx="315" cy="285" r="4" fill="#ec4899" />

  <!-- Indoor Houseplant -->
  <path d="M 720,400 Q 730,350 710,320 Q 740,340 760,310 Q 750,360 770,390 Z" fill="#047857" />
  <ellipse cx="740" cy="400" rx="15" ry="12" fill="#b45309" />

  <!-- Heading -->
  <rect x="30" y="30" width="180" height="30" rx="8" fill="#000" opacity="0.6" />
  <text x="45" y="49" fill="#fff" font-weight="bold" font-size="11" font-family="monospace">UNIT STANDARD COZY</text>
</svg>
`;

const ROOM_2_SVG = `
<svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" style="background:#09090b; font-family:sans-serif;">
  <defs>
    <linearGradient id="goldGlow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="#f59e0b" stop-opacity="0.05"/>
    </linearGradient>
  </defs>

  <!-- Wall Background (Premium Dark Theme) -->
  <rect width="800" height="500" fill="#18181b" />
  <rect x="0" y="0" width="800" height="380" fill="#27272a" />
  
  <!-- Wood wall panels paneling -->
  <rect x="100" y="50" width="160" height="330" fill="#3f3f46" opacity="0.5" />
  <line x1="140" y1="50" x2="140" y2="380" stroke="#18181b" stroke-width="2"/>
  <line x1="180" y1="50" x2="180" y2="380" stroke="#18181b" stroke-width="2"/>
  <line x1="220" y1="50" x2="220" y2="380" stroke="#18181b" stroke-width="2"/>

  <!-- Base floor -->
  <rect x="0" y="380" width="800" height="120" fill="#1c1917" />
  <!-- Area Rug -->
  <ellipse cx="400" cy="430" rx="320" ry="50" fill="#3f3f46" opacity="0.3" />
  <ellipse cx="400" cy="430" rx="300" ry="40" fill="#0f172a" opacity="0.7"/>

  <!-- Window overlooking the City Lights -->
  <rect x="440" y="60" width="280" height="160" rx="16" fill="#020617" stroke="#3f3f46" stroke-width="4" />
  <rect x="460" y="100" width="10" height="20" fill="#fef08a" opacity="0.6"/>
  <rect x="480" y="140" width="12" height="15" fill="#f59e0b" opacity="0.5"/>
  <rect x="520" y="80" width="8" height="30" fill="#38bdf8" opacity="0.4"/>
  <rect x="560" y="120" width="15" height="40" fill="#10b981" opacity="0.5"/>
  <rect x="620" y="90" width="12" height="25" fill="#fef08a" opacity="0.8"/>
  <rect x="650" y="110" width="20" height="50" fill="#38bdf8" opacity="0.7"/>
  <line x1="580" y1="60" x2="580" y2="220" stroke="#3f3f46" stroke-width="1.5" />

  <!-- Hanging Pendant Luxury Lights -->
  <line x1="320" y1="0" x2="320" y2="120" stroke="#d4d4d8" stroke-width="2"/>
  <circle cx="320" cy="130" r="12" fill="#fbbf24" stroke="#a1a1aa" stroke-width="2"/>
  <polygon points="320,140 260,250 380,250" fill="url(#goldGlow)" opacity="0.35"/>

  <!-- Bed Frame -->
  <rect x="250" y="250" width="500" height="130" rx="12" fill="#1e1b4b" stroke="#311042" stroke-width="3" />
  <rect x="240" y="270" width="520" height="110" rx="8" fill="#18181b" />
  
  <!-- Luxury Mattress -->
  <rect x="260" y="240" width="480" height="50" rx="14" fill="#fafafa" />
  <rect x="360" y="220" width="90" height="35" rx="6" fill="#e4e4e7" />
  <rect x="440" y="220" width="90" height="35" rx="6" fill="#e4e4e7" />
  
  <!-- Throw Pillows -->
  <rect x="375" y="230" width="60" height="20" rx="4" fill="#f59e0b" />
  <rect x="455" y="230" width="60" height="20" rx="4" fill="#1e1b4b" />

  <!-- Velvet Duvet Cover -->
  <rect x="500" y="240" width="240" height="54" rx="6" fill="#701a75" />
  <rect x="520" y="240" width="220" height="54" rx="4" fill="#4a044e" />

  <!-- Bedside Lounge Couch -->
  <rect x="30" y="270" width="180" height="110" rx="16" fill="#2e1065" />
  <rect x="40" y="320" width="160" height="60" rx="10" fill="#4c1d95" />
  <rect x="50" y="295" width="40" height="40" rx="8" fill="#d946ef" opacity="0.3"/>

  <!-- Logo Banner -->
  <rect x="30" y="30" width="180" height="30" rx="8" fill="#000" opacity="0.6" />
  <text x="45" y="49" fill="#fbbf24" font-weight="bold" font-size="11" font-family="monospace">DELUXE EXCLUSIVE ROOM</text>
</svg>
`;

const ROOM_3_SVG = `
<svg viewBox="0 0 800 500" xmlns="http://www.w3.org/2000/svg" style="background:#020617; font-family:sans-serif;">
  <defs>
    <linearGradient id="neonCyan" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#22d3ee" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="#0891b2" stop-opacity="0.05"/>
    </linearGradient>
  </defs>

  <!-- Modern Loft Suite Wall -->
  <rect width="800" height="500" fill="#0f172a" />
  <rect x="0" y="0" width="800" height="350" fill="#1e293b" />
  
  <!-- Architectural Diagonal Beam -->
  <line x1="0" y1="0" x2="400" y2="350" stroke="#334155" stroke-width="8" opacity="0.4"/>
  <line x1="800" y1="0" x2="400" y2="350" stroke="#334155" stroke-width="8" opacity="0.4"/>

  <!-- Base Floor -->
  <rect x="0" y="350" width="800" height="150" fill="#0f172a" />
  <!-- Circle rug -->
  <ellipse cx="400" cy="410" rx="340" ry="60" fill="#020617" />
  <ellipse cx="400" cy="410" rx="320" ry="50" fill="#22d3ee" opacity="0.15" />

  <!-- Giant Floor-to-Ceiling Skylight Balcony Door -->
  <rect x="50" y="30" width="280" height="320" rx="8" fill="#020617" stroke="#334155" stroke-width="4" />
  <rect x="60" y="40" width="125" height="300" fill="#38bdf8" opacity="0.2" />
  <rect x="195" y="40" width="125" height="300" fill="#38bdf8" opacity="0.2" />
  <!-- Moon View -->
  <circle cx="250" cy="100" r="16" fill="#fef08a" opacity="0.8" />
  
  <!-- Premium Bed Arrangement -->
  <rect x="360" y="220" width="400" height="130" rx="16" fill="#111827" stroke="#06b6d4" stroke-width="2" />
  <rect x="370" y="210" width="380" height="110" rx="12" fill="#f8fafc" />
  <!-- Cushy pillows -->
  <rect x="390" y="180" width="95" height="40" rx="8" fill="#e2e8f0" stroke="#cbd5e1" />
  <rect x="495" y="180" width="95" height="40" rx="8" fill="#e2e8f0" stroke="#cbd5e1" />
  <rect x="405" y="195" width="65" height="20" rx="4" fill="#06b6d4" />
  <rect x="510" y="195" width="65" height="20" rx="4" fill="#0f172a" />
  
  <!-- Premium Satin Cyan Blanket -->
  <rect x="560" y="210" width="190" height="110" rx="8" fill="#0891b2" />
  <path d="M 560,210 C 580,225 600,200 620,210 Q 690,195 750,210 L 750,320 L 560,320 Z" fill="#06b6d4" />

  <!-- Modern Floor Lamp -->
  <path d="M 760,350 L 760,140 M 760,140 L 730,150" stroke="#0ea5e9" stroke-width="4" fill="none" />
  <polygon points="730,150 670,230 790,230" fill="url(#neonCyan)" opacity="0.4"/>
  <ellipse cx="760" cy="350" rx="20" ry="8" fill="#334155" />

  <!-- Bookshelf and plant -->
  <rect x="30" y="320" width="120" height="10" fill="#b45309" />
  <rect x="50" y="280" width="15" height="40" fill="#a855f7" />
  <rect x="70" y="290" width="12" height="30" fill="#ec4899" />
  <rect x="90" y="275" width="20" height="45" fill="#3b82f6" />

  <!-- Logo Banner -->
  <rect x="30" y="30" width="180" height="30" rx="8" fill="#000" opacity="0.6" />
  <text x="45" y="49" fill="#22d3ee" font-weight="bold" font-size="11" font-family="monospace">PREMIUM EXECUTIVE LOFT</text>
</svg>
`;

export const PRESETS: ImagePreset[] = [
  {
    id: 'prop-premium',
    name: 'Preset Samara Premium Campur',
    category: 'property',
    dataUrl: svgToDataUrl(PROPERTY_1_SVG)
  },
  {
    id: 'prop-putri',
    name: 'Preset Samara Putri Exclusive',
    category: 'property',
    dataUrl: svgToDataUrl(PROPERTY_2_SVG)
  },
  {
    id: 'prop-putra',
    name: 'Preset Samara Putra Hub',
    category: 'property',
    dataUrl: svgToDataUrl(PROPERTY_3_SVG)
  },
  {
    id: 'room-standard',
    name: 'Preset Kamar Standard Cozy',
    category: 'room',
    dataUrl: svgToDataUrl(ROOM_1_SVG)
  },
  {
    id: 'room-deluxe',
    name: 'Preset Kamar Deluxe Suite',
    category: 'room',
    dataUrl: svgToDataUrl(ROOM_2_SVG)
  },
  {
    id: 'room-premium',
    name: 'Preset Kamar Premium Loft',
    category: 'room',
    dataUrl: svgToDataUrl(ROOM_3_SVG)
  }
];
