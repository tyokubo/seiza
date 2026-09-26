import { useMemo } from 'react';
import { View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { getApertureDiameter, type CameraState, type ScreenSize } from '@/features/exploration/domain/camera';
import { planeStars, planeToScreen, stampCorners, type FinishedConstellation } from '../domain/artwork';
import { buildDrawingRegion } from '../domain/drawingRegion';
import { projectEditorStars } from '../domain/editor';
import { ArtworkLayer } from './ArtworkLayer';
import { ConstellationLines } from './ConstellationLines';

export function ConstellationsInSky({ items, camera, size }: { items: FinishedConstellation[]; camera: CameraState; size: ScreenSize }) {
  const aperture = getApertureDiameter(size);
  const clipped = camera.mode === 'telescope';
  const left = clipped ? (size.width - aperture) / 2 : 0, top = clipped ? (size.height - aperture) / 2 : 0;
  return <View pointerEvents="none" testID="finished-constellations" style={{ position: 'absolute', left, top,
    width: clipped ? aperture : size.width, height: clipped ? aperture : size.height, borderRadius: clipped ? aperture / 2 : 0, overflow: 'hidden' }}>
    <View style={{ position: 'absolute', left: -left, top: -top, width: size.width, height: size.height }}>
      {items.map((item) => <FinishedArtwork key={item.id} item={item} camera={camera} size={size} showName />)}
    </View>
  </View>;
}
export function FinishedArtwork({ item, camera, size, showName = false }: { item: FinishedConstellation; camera: CameraState; size: ScreenSize; showName?: boolean }) {
  const region = useMemo(() => buildDrawingRegion(item.connections, planeStars(item.stars, item.artwork.frame)), [item]);
  const points = useMemo(() => projectEditorStars(item.stars, camera, size), [item.stars, camera, size]);
  const anchor = useMemo(() => {
    const all = [...planeStars(item.stars, item.artwork.frame), ...item.artwork.strokes.flatMap((s) => s.paths.flat()), ...item.artwork.stamps.flatMap(stampCorners)];
    if (!all.length) return null;
    const bounds = all.reduce((b, p) => ({ left: Math.min(b.left, p.x), right: Math.max(b.right, p.x), bottom: Math.max(b.bottom, p.y) }),
      { left: Infinity, right: -Infinity, bottom: -Infinity });
    return { x: (bounds.left + bounds.right) / 2, y: bounds.bottom + 0.035 };
  }, [item]);
  const label = showName && anchor ? planeToScreen(anchor, item.artwork.frame, camera, size) : null;
  return <>
    <ConstellationLines connections={item.connections} points={points} preview={null} size={size} markers={false} />
    <ArtworkLayer artwork={item.artwork} camera={camera} size={size} region={region} />
    {label && label.x >= 0 && label.x <= size.width && label.y >= 0 && label.y <= size.height &&
      <ThemedText testID="constellation-sky-name" numberOfLines={1} style={{ position: 'absolute', left: Math.max(4, Math.min(size.width - 156, label.x - 76)), top: label.y,
        width: 152, fontSize: 11, lineHeight: 16, color: '#dce4ed', textAlign: 'center',
        textShadowColor: '#050a16', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 }}>{item.name}</ThemedText>}
  </>;
}
