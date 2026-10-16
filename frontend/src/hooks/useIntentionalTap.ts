import { useRef, type MouseEvent, type PointerEvent } from "react";

/** A finger moving further than this was scrolling, not tapping. */
const MAX_MOVE_PX = 10;
/** Holding longer than this is a long press (copy text, context menu), not a tap. */
const MAX_PRESS_MS = 500;

/**
 * Makes a whole card tappable (like a tweet) without opening it by accident:
 * ignores taps on links / buttons inside it, scrolls, long presses and text selection.
 * Spread the returned handlers on the card element.
 */
export function useIntentionalTap(onTap: () => void) {
  const start = useRef<{ x: number; y: number; time: number } | null>(null);

  const onPointerDown = (event: PointerEvent) => {
    start.current = { x: event.clientX, y: event.clientY, time: event.timeStamp };
  };

  const onClick = (event: MouseEvent) => {
    const down = start.current;
    start.current = null;
    const target = event.target as HTMLElement;
    if (target.closest("a, button, input, textarea, select, label")) return;
    if (window.getSelection()?.toString()) return;
    if (down) {
      const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
      if (moved > MAX_MOVE_PX || event.timeStamp - down.time > MAX_PRESS_MS) return;
    }
    onTap();
  };

  return { onPointerDown, onClick };
}
