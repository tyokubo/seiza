import { useId, useMemo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Svg, { ClipPath, Defs, G, Path } from 'react-native-svg';
import type { MultiPolygon } from 'polygon-clipping';
import { gameConfig } from '@/config/gameConfig';
import type { CameraState, ScreenSize } from '@/features/exploration/domain/camera';
import type { Point2D } from '@/features/sky/domain/types';
import { planeToScreen, projectPlaneRing, stampCorners, type Artwork, type FaceStamp, type Stroke } from '../domain/artwork';
import { texturedStroke } from '../domain/brushTexture';

import stampImage from '../../../../assets/images/nikoniko.png';
type Props = { artwork: Artwork; camera: CameraState; size: ScreenSize; region: MultiPolygon; guide?: boolean; preview?: Stroke | null; stampPreview?: FaceStamp | null; selectedStampId?: string | null; placement?: { stamp: FaceStamp; valid: boolean } | null };
export function ArtworkLayer({ artwork, camera, size, region, guide = false, preview, stampPreview, selectedStampId, placement }: Props) {
  const id = useId().replace(/:/g, '');
  const regionPath = region.flatMap((polygon) => polygon.map((ring) => {
    const points = projectPlaneRing(ring.map(([x, y]) => ({ x, y })), artwork.frame, camera, size);
    return points.length >= 3 ? points.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ') + ' Z' : '';
  })).join(' ');
  const visibleStamps = artwork.stamps.map((stamp) => stampPreview?.id === stamp.id ? stampPreview : stamp);
  const visibleStamp = placement?.stamp ?? visibleStamps.find((stamp) => stamp.id === selectedStampId);
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    <Svg pointerEvents="none" width={size.width} height={size.height} style={StyleSheet.absoluteFill}>
      <Defs><ClipPath id={`${id}region`}><Path d={regionPath} fillRule="evenodd" clipRule="evenodd" /></ClipPath></Defs>
      {guide && <Path testID="drawing-region" d={regionPath} fillRule="evenodd" fill={gameConfig.constellationEditor.guideColor}
        fillOpacity={gameConfig.constellationEditor.guideOpacity} stroke={gameConfig.constellationEditor.guideColor} strokeOpacity={0.2} strokeWidth={0.75} />}
      <G clipPath={`url(#${id}region)`}>
        {[...artwork.strokes, ...(preview ? [preview] : [])].map((stroke) => <TexturedStroke key={stroke.id} stroke={stroke} artwork={artwork} camera={camera} size={size} />)}
      </G>
    </Svg>
    {visibleStamps.map((stamp) => <ProjectedStamp key={stamp.id} stamp={stamp} artwork={artwork} camera={camera} size={size} />)}
    {placement && <ProjectedStamp stamp={placement.stamp} artwork={artwork} camera={camera} size={size} />}
    {visibleStamp && <Svg pointerEvents="none" width={size.width} height={size.height} style={StyleSheet.absoluteFill}>
      <Path testID="stamp-selection"
        d={projectPlaneRing(stampCorners(visibleStamp), artwork.frame, camera, size)
          .map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ') + ' Z'} fill="none"
        stroke={placement && !placement.valid ? '#ff8c8c' : '#a8e6ff'} strokeWidth={1.5} strokeDasharray="5 4" />
    </Svg>}
  </View>;
}

function TexturedStroke({ stroke, artwork, camera, size }: { stroke: Stroke; artwork: Artwork; camera: CameraState; size: ScreenSize }) {
  const layers = useMemo(() => texturedStroke(stroke), [stroke]);
  return <G testID="artwork-stroke">{layers.map((layer, index) => <Path key={index} fill={gameConfig.constellationEditor.strokeColor} fillOpacity={layer.opacity}
    d={layer.rings.map((ring) => projectPlaneRing(ring, artwork.frame, camera, size).map((point, i) => `${i ? 'L' : 'M'}${point.x},${point.y}`).join(' ') + ' Z').join(' ')} />)}</G>;
}

function ProjectedStamp({ stamp, artwork, camera, size }: { stamp: FaceStamp; artwork: Artwork; camera: CameraState; size: ScreenSize }) {
  const corners = stampCorners(stamp).map((point) => planeToScreen(point, artwork.frame, camera, size));
  if (corners.some((point) => point === null)) return null;
  const [topLeft, topRight, bottomRight, bottomLeft] = corners as [Point2D, Point2D, Point2D, Point2D];
  const width = Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y);
  const height = Math.hypot(bottomLeft.x - topLeft.x, bottomLeft.y - topLeft.y);
  const center = { x: (topLeft.x + topRight.x + bottomRight.x + bottomLeft.x) / 4,
    y: (topLeft.y + topRight.y + bottomRight.y + bottomLeft.y) / 4 };
  if (!Number.isFinite(width + height + center.x + center.y) || width < 1 || height < 1) return null;
  return <Image testID="face-stamp" source={stampImage} resizeMode="stretch" style={{
    position: 'absolute', left: center.x - width / 2, top: center.y - height / 2,
    width, height, transform: [{ rotate: `${Math.atan2(topRight.y - topLeft.y, topRight.x - topLeft.x)}rad` }],
  }} />;
}
