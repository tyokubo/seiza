import type { CameraState, ScreenSize } from '../../exploration/domain/camera.ts';
import type { Star } from '../../sky/domain/types.ts';
import { getCraftableStars, connectionKey } from './editor.ts';
import type { Draft, FinishedConstellation } from './artwork.ts';

export function availableStars(stars: Star[], library: FinishedConstellation[], skyId: string, editingId: string | null = null) {
  const used = new Set(library.filter((item) => item.skyId === skyId && item.id !== editingId).flatMap((item) => item.starIds));
  return stars.filter((star) => !used.has(star.id));
}

export function creationChoices(stars: Star[], library: FinishedConstellation[], skyId: string, camera: CameraState, size: ScreenSize) {
  const inRange = new Set(getCraftableStars(stars, camera, size).map((star) => star.id));
  return {
    canCreate: availableStars(stars, library, skyId).filter((star) => inRange.has(star.id)).length >= 2,
    candidates: library.filter((item) => item.skyId === skyId && item.starIds.some((id) => inRange.has(id))),
  };
}

export function validateConnections(draft: Draft, stars: Star[], library: FinishedConstellation[], skyId: string, editingId: string | null) {
  const allowed = new Set(availableStars(stars, library, skyId, editingId).map((star) => star.id));
  const keys = new Set<string>();
  if (!draft.connections.length) throw new Error('星を2つ以上結んでください');
  for (const edge of draft.connections) {
    if (!allowed.has(edge.from) || !allowed.has(edge.to)) throw new Error('別の星座に所属する星、または未登録の星は使用できません');
    const key = connectionKey(edge);
    if (edge.from === edge.to || keys.has(key)) throw new Error('接続線が重複しています');
    keys.add(key);
  }
}
