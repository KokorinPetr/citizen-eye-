import type { Query } from "@tanstack/react-query";

/**
 * placeholderData for map layers. Query keys look like [name, bbox, ...filters].
 * Keep the previous results while the map moves (only the bbox changed) so markers don't blink;
 * when a filter changes, show nothing stale.
 */
export function keepWhileMapMoves<T>(currentKey: readonly unknown[]) {
  return (previous: T | undefined, previousQuery?: Query<T, Error, T, readonly unknown[]>) => {
    if (!previousQuery) return undefined;
    const sameFilters =
      JSON.stringify(previousQuery.queryKey.slice(2)) === JSON.stringify(currentKey.slice(2));
    return sameFilters ? previous : undefined;
  };
}
