import React from "react";

// Repli statique et léger du baobab (SVG, aucune animation, ~1 ko) : affiché
// pendant le chargement du chunk de TreeNetwork, si ce chunk échoue à charger
// et partout où un canvas n'est pas souhaité. Même remplissage que le canvas
// (100 % de son parent) : aucun saut de mise en page au remplacement.
const BRANCHES =
  "M172 172C160 140 130 120 96 104M96 104C80 92 68 78 58 58M96 104C96 86 104 70 116 56" +
  "M190 172C184 140 170 110 150 84M150 84C140 70 136 56 138 40M150 84C158 70 168 58 182 48" +
  "M200 172V70M200 70C192 56 186 44 184 30M200 70C208 56 214 44 216 30" +
  "M210 172C216 140 230 110 250 84M250 84C260 70 264 56 262 40M250 84C242 70 232 58 218 48" +
  "M228 172C240 140 270 120 304 104M304 104C320 92 332 78 342 58M304 104C304 86 296 70 284 56";
const BRANCH_DOTS =
  "M58 58h0M116 56h0M138 40h0M182 48h0M184 30h0M216 30h0M218 48h0M262 40h0M284 56h0M342 58h0M96 104h0M150 84h0M200 70h0M250 84h0M304 104h0";
const ROOTS =
  "M160 280C150 300 130 316 104 326M104 326C92 330 80 338 70 350M180 280C176 304 164 326 150 346" +
  "M200 280V340M200 340C196 352 190 360 184 368M200 340C206 352 214 360 218 368" +
  "M220 280C224 304 236 326 250 346M240 280C250 300 270 316 296 326M296 326C308 330 320 338 330 350";
const ROOT_DOTS = "M70 350h0M150 346h0M184 368h0M218 368h0M250 346h0M330 350h0M104 326h0M296 326h0M200 340h0";
const TRUNK = "M150 280L164 172H236L250 280M155 240H245M159 205H241M175 172L170 280M200 172V280M225 172L230 280M164 172L200 240L236 172";
const TRUNK_DOTS = "M164 172h0M236 172h0M150 280h0M250 280h0M200 240h0M155 240h0M245 240h0M159 205h0M241 205h0";

export default function TreeFallback({ ariaLabel }) {
  return (
    <svg
      viewBox="0 0 400 400"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={ariaLabel}
      style={{ display: "block", width: "100%", height: "100%" }}
    >
      <line x1="30" x2="370" y1="280" y2="280" stroke="#F2A33A" strokeOpacity=".5" />
      <g fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.2">
        <path d={ROOTS} stroke="#F2A33A" strokeOpacity=".55" />
        <path d={TRUNK} stroke="#F3EEE4" strokeOpacity=".4" />
        <path d={BRANCHES} stroke="#62F0BA" strokeOpacity=".55" />
      </g>
      <g fill="none" strokeLinecap="round" strokeWidth="5">
        <path d={ROOT_DOTS} stroke="#F2A33A" strokeOpacity=".9" />
        <path d={TRUNK_DOTS} stroke="#F3EEE4" strokeOpacity=".85" />
        <path d={BRANCH_DOTS} stroke="#62F0BA" strokeOpacity=".9" />
      </g>
    </svg>
  );
}
