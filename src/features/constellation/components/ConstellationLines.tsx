import { StyleSheet } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { gameConfig } from '@/config/gameConfig';
import type { ScreenSize } from '@/features/exploration/domain/camera';
import { connectionKey, type Connection, type ProjectedStar } from '../domain/editor';
import type { PreviewLine } from '../hooks/useConstellationGestures';

export function ConstellationLines({ connections, points, preview, size, markers = true }: {
  connections: Connection[]; points: ProjectedStar[]; preview: PreviewLine | null; size: ScreenSize; markers?: boolean;
}) {
  const config = gameConfig.constellationEditor;
  const start = preview && points.find((point) => point.id === preview.from);
  return <Svg width={size.width} height={size.height} pointerEvents="none" style={StyleSheet.absoluteFill}>
    {connections.map((connection) => {
      const from = points.find((point) => point.id === connection.from);
      const to = points.find((point) => point.id === connection.to);
      if (!from || !to) return null;
      return <Line key={connectionKey(connection)} testID="constellation-line"
        x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={config.lineColor} strokeOpacity={config.lineOpacity} strokeWidth={config.lineWidth} strokeLinecap="round" />;
    })}
    {preview && start && <Line testID="preview-line" x1={start.x} y1={start.y} x2={preview.point.x} y2={preview.point.y}
      stroke={config.previewColor} strokeWidth={config.lineWidth} strokeDasharray={preview.snapId ? undefined : '5 5'} />}
    {markers && points.map((point) => <Circle key={point.id} testID={`editor-star-${point.id}`} cx={point.x} cy={point.y} r={preview?.snapId === point.id ? 12 : 9}
      fill="transparent" stroke={preview?.snapId === point.id ? config.previewColor : '#e7f4f7'} strokeOpacity={0.65} strokeWidth={1} />)}
  </Svg>;
}
