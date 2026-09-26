import { useLayoutEffect, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { PanResponder, type GestureResponderEvent } from 'react-native';
import type { MultiPolygon } from 'polygon-clipping';
import { gameConfig } from '@/config/gameConfig';
import { moveCameraBySwipe, type CameraState, type ScreenSize } from '@/features/exploration/domain/camera';
import type { Point2D } from '@/features/sky/domain/types';
import { artworkId, planeToScreen, screenToPlane, type Draft, type FaceStamp, type Stroke } from '../domain/artwork';
import { clipPath, fitStampAt, stampFits } from '../domain/drawingRegion';
import { distanceToSegment } from '../domain/editor';
import { stampAt, touchPair, transformCanvas, transformStamp, type TouchPair } from '../domain/touchTransform';
import { smoothBrush, type BrushSample } from '../domain/brush';

export type ArtTool = 'draw' | 'erase' | 'pan' | 'stamp';
type Props = { camera: CameraState; size: ScreenSize; origin: RefObject<Point2D>; draft: Draft; region: MultiPolygon;
  tool: ArtTool; selectedStampId: string | null; onSelectStamp: (id: string | null) => void; onInvalid: () => void;
  setCamera: Dispatch<SetStateAction<CameraState>>; commit: (draft: Draft) => void };
type Gesture = { kind: 'draw'; id: string; points: Point2D[]; brush: BrushSample } | { kind: 'erase'; ids: Set<string> } |
  { kind: 'pan'; start: Point2D; camera: CameraState } | { kind: 'stamp'; start: Point2D; stamp: FaceStamp; candidate: FaceStamp } |
  { kind: 'place'; start: Point2D; moved: boolean } |
  { kind: 'pinch'; pair: TouchPair; planePair: TouchPair | null; camera: CameraState; stamp: FaceStamp | null; candidate: FaceStamp | null };

export function useArtworkGestures(props: Props) {
  const [preview, setPreview] = useState<Stroke | null>(null);
  const [stampPreview, setStampPreview] = useState<FaceStamp | null>(null);
  const [erasedIds, setErasedIds] = useState<string[]>([]);
  const [controller] = useState(() => {
    let latest = props, active: Gesture | null = null;
    const pointOf = (event: GestureResponderEvent) => ({ x: event.nativeEvent.pageX - latest.origin.current.x, y: event.nativeEvent.pageY - latest.origin.current.y });
    const planeOf = (p: Point2D) => screenToPlane(p, latest.camera, latest.size, latest.draft.artwork.frame);
    const pairOf = (event: GestureResponderEvent, plane = false) => {
      const [a, b] = event.nativeEvent.touches;
      if (!a || !b) return null;
      const p = { x: a.pageX - latest.origin.current.x, y: a.pageY - latest.origin.current.y };
      const q = { x: b.pageX - latest.origin.current.x, y: b.pageY - latest.origin.current.y };
      const first = plane ? planeOf(p) : p, second = plane ? planeOf(q) : q;
      return first && second ? touchPair(first, second) : null;
    };
    const reset = () => { active = null; setPreview(null); setStampPreview(null); setErasedIds([]); };
    const pinch = (event: GestureResponderEvent) => {
      if (event.nativeEvent.touches.length < 2 || active?.kind === 'pinch') return;
      const pair = pairOf(event), planePair = pairOf(event, true);
      if (!pair) return;
      const stamp = latest.tool === 'stamp' ? (active?.kind === 'stamp' ? active.stamp : stampAt(planePair?.center ?? null, latest.draft.artwork.stamps)) : null;
      if (stamp) latest.onSelectStamp(stamp.id);
      active = { kind: 'pinch', pair, planePair, camera: latest.camera, stamp, candidate: stamp };
      setPreview(null); setStampPreview(null); setErasedIds([]);
    };
    const eraseAt = (point: Point2D, ids: Set<string>) => {
      const before = ids.size;
      for (const stroke of latest.draft.artwork.strokes) {
        if (stroke.paths.some((path) => path.some((p, i) => {
          if (!i) return false;
          const a = planeToScreen(path[i - 1], latest.draft.artwork.frame, latest.camera, latest.size);
          const b = planeToScreen(p, latest.draft.artwork.frame, latest.camera, latest.size);
          return a && b && distanceToSegment(point, a, b) <= 16;
        }))) ids.add(stroke.id);
      }
      if (ids.size !== before) setErasedIds([...ids]);
    };
    const move = (event: GestureResponderEvent) => {
      pinch(event);
      const gesture = active;
      if (!gesture) return;
      if (gesture.kind === 'pinch') {
        if (event.nativeEvent.touches.length < 2) return;
        const pair = pairOf(event), planePair = pairOf(event, true);
        if (gesture.stamp && gesture.planePair && planePair) {
          const candidate = transformStamp(gesture.stamp, gesture.planePair, planePair);
          if (stampFits(candidate, latest.region)) { gesture.candidate = candidate; setStampPreview(candidate); }
        } else if (!gesture.stamp && pair) latest.setCamera(transformCanvas(gesture.camera, gesture.pair, pair));
        return;
      }
      const p = pointOf(event);
      if (gesture.kind === 'place') { gesture.moved ||= Math.hypot(p.x - gesture.start.x, p.y - gesture.start.y) > gameConfig.constellationEditor.tapSlop; return; }
      if (gesture.kind === 'draw') gesture.brush = smoothBrush(gesture.brush, p, Date.now());
      const plane = planeOf(gesture.kind === 'draw' ? gesture.brush.point : p);
      if (gesture.kind === 'draw' && plane) {
        const previous = gesture.points.at(-1);
        if (!previous || Math.hypot(plane.x - previous.x, plane.y - previous.y) >= gameConfig.constellationEditor.pointSpacing) {
          gesture.points.push(plane);
          setPreview({ id: gesture.id, paths: clipPath(gesture.points, latest.region) });
        }
      } else if (gesture.kind === 'pan') {
        latest.setCamera(moveCameraBySwipe(gesture.camera, { x: (p.x - gesture.start.x) / (gesture.camera.zoom ?? 1), y: (p.y - gesture.start.y) / (gesture.camera.zoom ?? 1) }));
      } else if (gesture.kind === 'erase') eraseAt(p, gesture.ids);
      else if (gesture.kind === 'stamp' && plane) {
        const candidate = { ...gesture.stamp, position: { x: gesture.stamp.position.x + plane.x - gesture.start.x, y: gesture.stamp.position.y + plane.y - gesture.start.y } };
        if (stampFits(candidate, latest.region)) { gesture.candidate = candidate; setStampPreview(candidate); }
      }
    };
    const responder = PanResponder.create({
      onStartShouldSetPanResponder: () => true, onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => {
        const p = pointOf(event), plane = planeOf(p);
        if (latest.tool === 'pan') active = { kind: 'pan', start: p, camera: latest.camera };
        else if (latest.tool === 'draw') active = { kind: 'draw', id: artworkId(), points: plane ? [plane] : [], brush: { point: p, time: Date.now() } };
        else if (latest.tool === 'erase') { const ids = new Set<string>(); eraseAt(p, ids); active = { kind: 'erase', ids }; }
        else if (plane) {
          const stamp = stampAt(plane, latest.draft.artwork.stamps);
          latest.onSelectStamp(stamp?.id ?? null);
          active = stamp ? { kind: 'stamp', start: plane, stamp, candidate: stamp } : { kind: 'place', start: p, moved: false };
        }
        pinch(event);
      },
      onPanResponderStart: pinch, onPanResponderMove: move,
      onPanResponderRelease: (event) => {
        if (active?.kind !== 'pinch') move(event);
        const gesture = active, draft = latest.draft;
        if (gesture?.kind === 'draw') {
          const endpoint = planeOf(pointOf(event));
          if (endpoint) gesture.points.push(endpoint);
          const paths = clipPath(gesture.points, latest.region);
          if (paths.length) latest.commit({ ...draft, artwork: { ...draft.artwork, strokes: [...draft.artwork.strokes, { id: gesture.id, paths }] } });
        } else if (gesture?.kind === 'erase' && gesture.ids.size) latest.commit({ ...draft, artwork: { ...draft.artwork, strokes: draft.artwork.strokes.filter((s) => !gesture.ids.has(s.id)) } });
        else if ((gesture?.kind === 'stamp' || gesture?.kind === 'pinch') && gesture.candidate && gesture.candidate !== gesture.stamp) {
          const candidate = gesture.candidate;
          latest.commit({ ...draft, artwork: { ...draft.artwork, stamps: draft.artwork.stamps.map((s) => s.id === candidate.id ? candidate : s) } });
        } else if (gesture?.kind === 'place' && !gesture.moved) {
          const position = planeOf(pointOf(event));
          const stamp = position && fitStampAt({ id: artworkId(), assetId: 'nikoniko', position,
            size: gameConfig.constellationEditor.stampSize, rotation: 0 }, latest.region);
          if (stamp) {
            latest.commit({ ...draft, artwork: { ...draft.artwork, stamps: [...draft.artwork.stamps, stamp] } });
            latest.onSelectStamp(stamp.id);
          } else latest.onInvalid();
        }
        reset();
      },
      onPanResponderTerminate: reset, onPanResponderTerminationRequest: () => false,
    });
    return { panHandlers: responder.panHandlers, update: (next: Props) => { if (next.tool !== latest.tool) reset(); latest = next; } };
  });
  useLayoutEffect(() => controller.update(props));
  return { panHandlers: controller.panHandlers, preview, stampPreview, erasedIds };
}
