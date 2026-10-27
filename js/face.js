// Drawn face used in demo mode and as a placeholder. Real scans show the user's own photo.
// dryness and redness are 0–1 and control how much of the skin map is drawn.

const FOREHEAD = [[118,112],[128,106],[138,110],[150,104],[162,110],[172,106],[182,112],[124,118],[144,116],[158,117],[176,118],[134,122],[166,123],[150,124]];
const CHEEKS = [[96,176],[102,184],[94,192],[104,198],[98,206],[204,176],[198,184],[206,192],[196,198],[202,206]];
const EXTRA = [[112,128],[190,128],[100,140],[200,140],[90,170],[210,170],[92,214],[208,214],[100,224],[200,224],[118,210],[182,210],[140,240],[160,240],[150,246],[108,182],[192,182]];
const MESH = [[110,120],[130,112],[150,110],[170,112],[190,120],[100,150],[124,160],[176,160],[200,150],[150,175],[140,198],[160,198],[96,190],[204,190],[116,214],[184,214],[134,222],[166,222],[150,232],[126,244],[174,244],[150,254],[108,236],[192,236]];

let uid = 0;

export function faceSVG({ skin = "#E9C3A6", hair = "#2B1E1C", sweater = "#8E83C0", dryness = 0, redness = 0, mesh = false, guide = null, labels = false, width = "100%" } = {}) {
  const id = `f${++uid}`;
  const shade = darken(skin);
  const dots = [];
  if (dryness > 0.25) dots.push(...FOREHEAD);
  if (dryness > 0.4) dots.push(...CHEEKS);
  if (dryness > 0.6) dots.push(...EXTRA);
  const red = Math.max(0, Math.min(1, redness));
  const map = `
    ${red > 0.2 ? `<g filter="url(#b${id})" opacity="${(0.25 + red * 0.6).toFixed(2)}">
      <ellipse cx="112" cy="196" rx="24" ry="18" fill="#E2405F"/><ellipse cx="188" cy="196" rx="24" ry="18" fill="#E2405F"/>
      <ellipse cx="150" cy="186" rx="9" ry="10" fill="#E2405F" opacity=".6"/></g>` : ""}
    <g fill="#7FD3F5">${dots.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.2"/>`).join("")}</g>`;
  const meshDots = mesh ? MESH.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.3" fill="#fff" opacity=".85"/>`).join("") : "";
  const ring = guide ? `<ellipse cx="150" cy="166" rx="88" ry="112" fill="none" stroke="${guide}" stroke-width="3"/>` : "";
  const vb = labels ? "-10 0 440 360" : "0 0 300 360";
  const shift = labels ? ' transform="translate(70 0)"' : "";
  return `<svg viewBox="${vb}" width="${width}" style="display:block;overflow:visible" role="img" aria-label="Skin map">
  <defs><filter id="b${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7"/></filter></defs>
  <g${shift}>
  <path d="M70 150 C60 70 110 32 150 32 C200 32 240 70 230 150 C235 220 242 272 226 304 L74 304 C58 272 65 220 70 150 Z" fill="${hair}"/>
  <path d="M28 360 C40 300 92 286 150 286 C208 286 260 300 272 360 Z" fill="${sweater}"/>
  <path d="M126 236 L126 292 C136 304 164 304 174 292 L174 236 Z" fill="${shade}"/>
  <ellipse cx="82" cy="172" rx="9" ry="16" fill="${shade}"/><ellipse cx="218" cy="172" rx="9" ry="16" fill="${shade}"/>
  <path d="M150 72 C200 72 222 112 220 162 C218 216 190 256 150 260 C110 256 82 216 80 162 C78 112 100 72 150 72 Z" fill="${skin}"/>
  <path d="M80 150 C80 92 114 60 150 60 C192 60 222 92 222 150 C210 112 186 94 160 96 C150 106 120 118 80 150 Z" fill="${hair}"/>
  <path d="M106 146 Q122 138 138 145" stroke="${hair}" stroke-width="4.5" fill="none" stroke-linecap="round"/>
  <path d="M162 145 Q178 138 194 146" stroke="${hair}" stroke-width="4.5" fill="none" stroke-linecap="round"/>
  <path d="M110 166 Q122 158 136 166 Q122 171 110 166 Z" fill="#2A1E1E"/><path d="M164 166 Q178 158 190 166 Q178 171 164 166 Z" fill="#2A1E1E"/>
  <path d="M150 170 Q147 194 141 202 Q150 207 159 202" stroke="${shade}" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M132 224 Q141 217 150 221 Q159 217 168 224 Q150 236 132 224 Z" fill="#B9636B"/>
  ${map}${meshDots}${ring}
  </g>
  ${labels ? labelsSVG(labels) : ""}
</svg>`;
}

function labelsSVG(l) {
  const box = (x, y, w, t1, t2, c) => `<g><rect x="${x}" y="${y}" width="${w}" height="54" rx="16" fill="#fff"/>
    <circle cx="${x + 14}" cy="${y + 19}" r="5.5" fill="${c}"/>
    <text x="${x + 25}" y="${y + 24}" font-family="Onest, sans-serif" font-weight="600" font-size="16" fill="#2B2742">${esc(t1)}</text>
    <text x="${x + 14}" y="${y + 43}" font-family="Onest, sans-serif" font-size="13.5" fill="#625C7A">${esc(t2)}</text></g>`;
  const lines = `<g stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round">
    <path d="M220 112 L300 70"/><circle cx="220" cy="112" r="4" fill="#fff"/>
    <path d="M183 198 L102 250"/><circle cx="183" cy="198" r="4" fill="#fff"/></g>`;
  return lines + box(244, 22, 186, l.dry[0], l.dry[1], "#7FD3F5") + box(-10, 244, 170, l.red[0], l.red[1], "#E2405F");
}

function darken(hex) {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return `rgb(${Math.round(r * 0.88)},${Math.round(g * 0.86)},${Math.round(b * 0.85)})`;
}

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
