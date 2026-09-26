import { useLayoutEffect, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { PanResponder, type GestureResponderEvent } from 'react-native';
import { gameConfig } from '@/config/gameConfig';
import { moveCameraBySwipe, type CameraState } from '@/features/exploration/domain/camera';
import type { Point2D } from '@/features/sky/domain/types';
import { clampEditorZoom, connectionAtPoint, nearestStar, type Connection, type EditorAction, type ProjectedStar } from '../domain/editor';

export type PreviewLine = { from: string; point: Point2D; snapId?: string };
type Gesture =
  | { kind: 'line'; from: string }
  | { kind: 'pan'; start: Point2D; camera: CameraState; candidate: Connection | null; moved: boolean }
  | { kind: 'pinch'; distance: number; zoom: number };

type Props = {
  camera: CameraState;
  setCamera: Dispatch<SetStateAction<CameraState>>;
  points: ProjectedStar[];
  visiblePoints: ProjectedStar[];
  connections: Connection[];
  dispatch: Dispatch<EditorAction>;
  origin: RefObject<Point2D>;
};

export function useConstellationGestures(props: Props) {
  const [preview, setPreview] = useState<PreviewLine | null>(null);
  const [controller] = useState(() => createGestureController(props, setPreview));
  useLayoutEffect(() => controller.update(props));
  return { panHandlers: controller.panHandlers, preview };
}

function createGestureController(initial: Props, setPreview: Dispatch<SetStateAction<PreviewLine | null>>) {
    let latest = initial;
    let gesture: Gesture | null = null;
    const config = gameConfig.constellationEditor;
    const pointOf = (event: GestureResponderEvent): Point2D => ({
      x: event.nativeEvent.pageX - latest.origin.current.x,
      y: event.nativeEvent.pageY - latest.origin.current.y,
    });
    const distanceOf = (event: GestureResponderEvent) => {
      const [a, b] = event.nativeEvent.touches;
      return a && b ? Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) : 0;
    };
    const beginPinch = (event: GestureResponderEvent) => {
      if (event.nativeEvent.touches.length < 2 || gesture?.kind === 'pinch') return;
      gesture = { kind: 'pinch', distance: Math.max(1, distanceOf(event)), zoom: latest.camera.zoom ?? 1 };
      setPreview(null);
    };
    const finish = () => { gesture = null; setPreview(null); };
    const responder = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => {
        const point = pointOf(event);
        const star = nearestStar(point, latest.visiblePoints, config.starHitRadius);
        if (star) {
          gesture = { kind: 'line', from: star.id };
          setPreview({ from: star.id, point });
        } else {
          gesture = { kind: 'pan', start: point, camera: latest.camera,
            candidate: connectionAtPoint(point, latest.connections, latest.points), moved: false };
        }
        beginPinch(event);
      },
      onPanResponderStart: beginPinch,
      onPanResponderMove: (event) => {
        beginPinch(event);
        const active = gesture;
        if (!active) return;
        if (active.kind === 'pinch') {
          if (event.nativeEvent.touches.length < 2) return;
          const zoom = clampEditorZoom(active.zoom * distanceOf(event) / active.distance);
          latest.setCamera((camera) => ({ ...camera, zoom }));
          return;
        }
        const point = pointOf(event);
        if (active.kind === 'line') {
          const snap = nearestStar(point, latest.visiblePoints, config.snapRadius, active.from);
          setPreview({ from: active.from, point: snap ?? point, snapId: snap?.id });
        } else {
          const delta = { x: point.x - active.start.x, y: point.y - active.start.y };
          active.moved ||= Math.hypot(delta.x, delta.y) > config.tapSlop;
          if (active.moved) latest.setCamera(moveCameraBySwipe(active.camera, {
            x: delta.x / (active.camera.zoom ?? 1), y: delta.y / (active.camera.zoom ?? 1),
          }));
        }
      },
      onPanResponderRelease: (event) => {
        const active = gesture;
        const point = pointOf(event);
        if (active?.kind === 'line') {
          const target = nearestStar(point, latest.visiblePoints, config.snapRadius, active.from);
          if (target) latest.dispatch({ type: 'connect', from: active.from, to: target.id });
        } else if (active?.kind === 'pan' && !active.moved && active.candidate &&
          Math.hypot(point.x - active.start.x, point.y - active.start.y) <= config.tapSlop) {
          latest.dispatch({ type: 'remove', connection: active.candidate });
        }
        finish();
      },
      onPanResponderTerminate: finish,
      onPanResponderTerminationRequest: () => false,
    });
    return { panHandlers: responder.panHandlers, update: (props: Props) => { latest = props; } };
}
