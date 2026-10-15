import type { CSSProperties } from "react";
import { MapPin } from "lucide-react";

// Pins pop up one after another around the radar, fade, and return on the next
// loop. Positions are percentages of the radar box; `d` staggers the timing.
const PINS: { x: number; y: number; d: number; tone: "red" | "orange" | "blue" | "green" }[] = [
  { x: 22, y: 30, d: 0.4, tone: "red" },
  { x: 74, y: 24, d: 1.6, tone: "blue" },
  { x: 82, y: 58, d: 2.8, tone: "orange" },
  { x: 16, y: 64, d: 4.0, tone: "green" },
  { x: 58, y: 76, d: 5.2, tone: "red" },
  { x: 88, y: 40, d: 6.4, tone: "orange" },
];

/**
 * Decorative emergency radar: expanding rings, a slow sweep and map pins.
 * Pure CSS animation (transform/opacity only), so it costs no React
 * re-renders. Reduced motion shows a static frame (see index.css).
 */
export default function Radar() {
  return (
    <div className="radar" aria-hidden>
      <div className="radar-grid" />
      <div className="radar-sweep" />
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="radar-ring" style={{ "--d": `${i * 1.1}s` } as CSSProperties} />
      ))}
      <span className="radar-core" />
      {PINS.map((p, i) => (
        <span
          key={i}
          className={`radar-pin tone-${p.tone}`}
          style={{ left: `${p.x}%`, top: `${p.y}%`, "--d": `${p.d}s` } as CSSProperties}
        >
          <MapPin size={20} strokeWidth={2.4} />
          <i />
        </span>
      ))}
    </div>
  );
}
