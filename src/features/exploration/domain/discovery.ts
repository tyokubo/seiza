import type { Star } from '../../sky/domain/types.ts';

export function mergeDiscoveredStarIds(currentIds: string[], newlyDiscovered: Star[]): string[] {
  const discovered = new Set(currentIds);

  for (const star of newlyDiscovered) {
    discovered.add(star.id);
  }

  return [...discovered];
}
