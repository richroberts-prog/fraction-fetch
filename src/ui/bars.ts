// Fraction bars as SVG, for comparing two values side by side after a near miss.

import type { Display } from '../core/fractions';

/** A bar split into d equal parts with n shaded. Hundredths show as a smooth fill. */
export function barSvg(display: Display, width = 260, height = 34): string {
  const { n, d } = display;
  const parts = d <= 20 ? d : 1;
  const filled = (n / d) * width;
  const lines = Array.from({ length: parts - 1 }, (_, i) => {
    const x = ((i + 1) * width) / parts;
    return `<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="#2b2340" stroke-width="2"/>`;
  }).join('');
  return `<svg viewBox="-2 -2 ${width + 4} ${height + 4}" width="${width}" height="${height}" role="img" aria-label="${n} out of ${d}">
    <rect x="0" y="0" width="${width}" height="${height}" rx="6" fill="#fff4e0"/>
    <rect x="0" y="0" width="${filled}" height="${height}" rx="6" fill="#c9772e"/>
    ${lines}
    <rect x="0" y="0" width="${width}" height="${height}" rx="6" fill="none" stroke="#2b2340" stroke-width="3"/>
  </svg>`;
}
