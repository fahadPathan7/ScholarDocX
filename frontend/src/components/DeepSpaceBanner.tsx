import React from "react";
import "./DeepSpaceBanner.css";

const DeepSpaceBanner: React.FC = () => {
  return (
    <div className="deep-space-banner">
      {/* Nebulas instead of a single rotating galaxy to avoid clipping and look much cooler */}
      <div className="nebula nebula-1"></div>
      <div className="nebula nebula-2"></div>
      <div className="nebula nebula-3"></div>
      
      <div className="star-layer stars-layer-1"></div>
      <div className="star-layer stars-layer-2"></div>
      <div className="star-layer stars-layer-3"></div>

      {/* Shooting Stars */}
      <div className="shooting-star"></div>
      <div className="shooting-star delay-star"></div>
      
      {/* Drifting Glyphs */}
      <div className="glyph glyph-1">Σ</div>
      <div className="glyph glyph-2">∫</div>
      <div className="glyph glyph-3">π</div>
      <div className="glyph glyph-4">φ</div>
      <div className="glyph glyph-5">λ</div>
      <div className="glyph glyph-6">θ</div>
      <div className="glyph glyph-7">Δ</div>
      <div className="glyph glyph-8">∞</div>

      {/* SVG Network Canvas */}
      <svg className="network-canvas" width="100%" height="100%" preserveAspectRatio="none">
        <defs>
          <radialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.8" />
            <stop offset="50%" stopColor="#0d9488" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#0f172a" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Network Lines */}
        <polyline className="anim-line" points="0,60 100,40 250,70 400,30 550,80 700,40 900,60 1100,20 1300,50" />
        <polyline className="anim-line delay-1" points="-50,30 150,80 300,20 450,90 600,50 800,70 1000,30 1200,60 1400,40" />
        <polyline className="anim-line delay-2" points="50,90 200,50 350,80 500,20 650,60 850,40 1050,70 1250,30 1500,80" />

        {/* Network Nodes */}
        <circle cx="100" cy="40" r="4" className="node-dot pulse-1" />
        <circle cx="250" cy="70" r="5" className="node-dot pulse-2" />
        <circle cx="400" cy="30" r="6" className="node-dot pulse-3" />
        <circle cx="550" cy="80" r="4" className="node-dot pulse-1" />
        <circle cx="700" cy="40" r="7" className="node-dot pulse-2" />
        <circle cx="900" cy="60" r="5" className="node-dot pulse-3" />
        
        <circle cx="150" cy="80" r="3" className="node-dot pulse-2" />
        <circle cx="300" cy="20" r="4" className="node-dot pulse-1" />
        <circle cx="450" cy="90" r="5" className="node-dot pulse-3" />
        <circle cx="600" cy="50" r="4" className="node-dot pulse-2" />
        <circle cx="800" cy="70" r="6" className="node-dot pulse-1" />
        
        <circle cx="200" cy="50" r="4" className="node-dot pulse-3" />
        <circle cx="350" cy="80" r="5" className="node-dot pulse-1" />
        <circle cx="500" cy="20" r="3" className="node-dot pulse-2" />
        <circle cx="650" cy="60" r="6" className="node-dot pulse-3" />

        {/* Big glowing hubs */}
        <circle cx="400" cy="30" r="20" fill="url(#nodeGlow)" className="hub-glow pulse-3" />
        <circle cx="700" cy="40" r="24" fill="url(#nodeGlow)" className="hub-glow pulse-2" />
        <circle cx="250" cy="70" r="16" fill="url(#nodeGlow)" className="hub-glow pulse-1" />
        <circle cx="900" cy="60" r="18" fill="url(#nodeGlow)" className="hub-glow pulse-3" />

        {/* Hub Rings */}
        <circle cx="400" cy="30" r="10" className="hub-ring ring-anim-1" />
        <circle cx="700" cy="40" r="12" className="hub-ring ring-anim-2" />
        <circle cx="250" cy="70" r="8" className="hub-ring ring-anim-3" />
      </svg>
      
      {/* Left Edge Fade */}
      <div className="left-fade"></div>
    </div>
  );
};

export default DeepSpaceBanner;
