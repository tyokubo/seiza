import { StyleSheet, Text, View } from 'react-native';
import { gameConfig } from '@/config/gameConfig';
import { projectDirectionToScreen, type CameraState, type ScreenSize } from '@/features/exploration/domain/camera';

const labels = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export function HorizonCompass({ camera, size }: { camera: CameraState; size: ScreenSize }) {
  const config = gameConfig.compass;
  const direction = (heading: number, elevation: number) => ({
    x: Math.sin(heading) * Math.cos(elevation), y: Math.sin(elevation), z: -Math.cos(heading) * Math.cos(elevation),
  });
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    {labels.map((label, index) => {
      const heading = index * Math.PI / 4;
      const elevation = (config.ridgeElevationDegrees[index] + config.elevationOffsetDegrees) * Math.PI / 180;
      const point = projectDirectionToScreen(direction(heading, elevation), camera, size);
      const beside = projectDirectionToScreen(direction(heading + 0.01, elevation), camera, size);
      if (!point || !beside || point.x < 12 || point.x > size.width - 12 || point.y < 12 || point.y > size.height - 12) return null;
      const fade = Math.min(1, Math.min(point.x, size.width - point.x, point.y, size.height - point.y) / config.edgeFade);
      let rotation = Math.atan2(beside.y - point.y, beside.x - point.x);
      if (rotation > Math.PI / 2) rotation -= Math.PI;
      if (rotation < -Math.PI / 2) rotation += Math.PI;
      return <Text key={label} style={[styles.label, {
        left: point.x - 18, top: point.y - 10, color: config.color,
        fontSize: config.fontSize, opacity: config.opacity * fade,
        transform: [{ rotate: `${rotation}rad` }],
      }]}>{label}</Text>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  label: { position: 'absolute', width: 36, height: 22, textAlign: 'center', lineHeight: 22,
    fontWeight: '600', textShadowColor: '#000000', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
});
