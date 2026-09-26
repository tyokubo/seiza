import { useLayoutEffect, useState, type RefObject } from 'react';
import { PanResponder, type GestureResponderEvent } from 'react-native';
import type { MultiPolygon } from 'polygon-clipping';
import { gameConfig } from '@/config/gameConfig';
import type { CameraState, ScreenSize } from '@/features/exploration/domain/camera';
import type { Point2D } from '@/features/sky/domain/types';
import { artworkId, screenToPlane, type Draft, type FaceStamp } from '../domain/artwork';
import { fitStampAt } from '../domain/drawingRegion';

type Props = { camera: CameraState; size: ScreenSize; origin: RefObject<Point2D>; draft: Draft; region: MultiPolygon;
  onSelect: () => void; onPlaced: (id: string) => void; onInvalid: () => void; commit: (draft: Draft) => void };
export function useStampTray(props: Props) {
  const [preview, setPreview] = useState<{ stamp: FaceStamp; valid: boolean } | null>(null);
  const [controller] = useState(() => {
    let latest = props;
    let start: Point2D | null = null, moved = false, candidate: FaceStamp | null = null;
    let id = '';
    const pointOf = (event: GestureResponderEvent) => ({ x: event.nativeEvent.pageX - latest.origin.current.x, y: event.nativeEvent.pageY - latest.origin.current.y });
    const reset = () => { start = null; moved = false; candidate = null; setPreview(null); };
    const move = (event: GestureResponderEvent) => {
      if (!start) return;
      if (event.nativeEvent.touches.length > 1) { reset(); return; }
      const p = pointOf(event);
      moved ||= Math.hypot(p.x - start.x, p.y - start.y) > 6;
      if (!moved) return;
      const position = screenToPlane(p, latest.camera, latest.size, latest.draft.artwork.frame);
      if (!position) { candidate = null; setPreview(null); return; }
      const stamp: FaceStamp = { id, assetId: 'nikoniko', position, size: gameConfig.constellationEditor.stampSize, rotation: 0 };
      candidate = fitStampAt(stamp, latest.region);
      setPreview({ stamp: candidate ?? stamp, valid: candidate !== null });
    };
    const responder = PanResponder.create({
      onStartShouldSetPanResponder: () => true, onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => { reset(); id = artworkId(); start = pointOf(event); latest.onSelect(); },
      onPanResponderStart: (event) => { if (event.nativeEvent.touches.length > 1) reset(); },
      onPanResponderMove: move,
      onPanResponderRelease: (event) => {
        move(event);
        if (moved && candidate) {
          latest.commit({ ...latest.draft, artwork: { ...latest.draft.artwork, stamps: [...latest.draft.artwork.stamps, candidate] } });
          latest.onPlaced(candidate.id);
        }
        else if (moved) latest.onInvalid();
        reset();
      },
      onPanResponderTerminate: reset, onPanResponderTerminationRequest: () => false,
    });
    return { handlers: responder.panHandlers, update: (next: Props) => { latest = next; } };
  });
  useLayoutEffect(() => controller.update(props));
  return { handlers: controller.handlers, preview };
}
