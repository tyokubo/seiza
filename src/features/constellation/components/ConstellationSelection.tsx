import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { ThemedText } from '@/components/themed-text';
import type { CameraState, ScreenSize } from '@/features/exploration/domain/camera';
import { SkyPanoramaView } from '@/features/sky/components/SkyPanoramaView';
import type { Star } from '@/features/sky/domain/types';
import type { FinishedConstellation } from '../domain/artwork';
import { projectEditorStars } from '../domain/editor';
import { useConstellationGestures } from '../hooks/useConstellationGestures';
import { FinishedArtwork } from './ConstellationsInSky';

export function ConstellationSelection({ initialCamera, stars, items, candidates, canCreate, onSelect, onClose }: {
  initialCamera: CameraState; stars: Star[]; items: FinishedConstellation[]; candidates: FinishedConstellation[]; canCreate: boolean;
  onSelect: (id: string | null, camera: CameraState) => void; onClose: () => void;
}) {
  const [camera, setCamera] = useState(initialCamera);
  const [size, setSize] = useState<ScreenSize>({ width: 1, height: 1 });
  const origin = useRef({ x: 0, y: 0 }), canvas = useRef<View>(null);
  const gestures = useConstellationGestures({ camera, setCamera, origin, points: [], visiblePoints: [], connections: [], dispatch: () => {} });
  const targets = useMemo(() => candidates.flatMap((item) => {
    const points = projectEditorStars(item.stars, camera, size).filter((p) => p.x >= 0 && p.x <= size.width && p.y > 100 && p.y < size.height - 160);
    if (!points.length) return [];
    return [{ item, x: points.reduce((n, p) => n + p.x, 0) / points.length, y: points.reduce((n, p) => n + p.y, 0) / points.length }];
  }), [candidates, camera, size]);
  return <View style={styles.screen}>
    <View ref={canvas} style={{ flex: 1, touchAction: 'none' }} {...gestures.panHandlers} onLayout={(event) => {
      setSize(event.nativeEvent.layout); canvas.current?.measureInWindow((x, y) => { origin.current = { x, y }; });
    }}>
      <SkyPanoramaView camera={camera} stars={stars} size={size} discoveredStarIds={[]} />
      {items.map((item) => <FinishedArtwork key={item.id} item={item} camera={camera} size={size} />)}
      {targets.map(({ item, x, y }) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.name}を選択`}
        onPress={() => onSelect(item.id, camera)} style={[styles.target, { left: Math.max(4, Math.min(size.width - 148, x - 72)), top: y - 24 }]}>
        <ThemedText numberOfLines={2} style={styles.text}>{item.name}</ThemedText>
      </Pressable>)}
    </View>
    <SafeAreaView pointerEvents="box-none" style={[StyleSheet.absoluteFill, { justifyContent: 'space-between' }]}>
      <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="探索に戻る" onPress={onClose} style={styles.back}><MaterialCommunityIcons name="arrow-left" size={26} color="#fff" /></Pressable><ThemedText style={styles.title}>星座制作</ThemedText></View>
      <ScrollView style={styles.options} contentContainerStyle={{ padding: 12, gap: 8 }}>
        {canCreate && <Pressable accessibilityRole="button" accessibilityLabel="新しい星座を作る" onPress={() => onSelect(null, camera)} style={styles.option}>
          <MaterialCommunityIcons name="plus" color="#fff" size={24} /><ThemedText style={styles.text}>星座を作る</ThemedText>
        </Pressable>}
        {candidates.map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${item.name}を編集する`} onPress={() => onSelect(item.id, camera)} style={styles.option}>
          <MaterialCommunityIcons name="pencil-outline" color="#fff" size={24} /><View style={{ flex: 1 }}><ThemedText numberOfLines={1} style={styles.text}>{item.name}</ThemedText><ThemedText style={styles.caption}>星座を編集する</ThemedText></View>
        </Pressable>)}
      </ScrollView>
    </SafeAreaView>
  </View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#020510' }, header: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(5,12,30,0.8)' },
  back: { width: 56, height: 56, justifyContent: 'center', alignItems: 'center' }, title: { fontSize: 18, color: '#fff' },
  target: { position: 'absolute', width: 144, minHeight: 48, borderColor: '#bccbdc', borderWidth: 1, borderRadius: 6, backgroundColor: 'rgba(15,28,51,0.6)', padding: 8, justifyContent: 'center' },
  text: { fontSize: 14, color: '#fff' }, caption: { fontSize: 11, color: '#b8c9df' },
  options: { flexGrow: 0, maxHeight: 190, backgroundColor: 'rgba(5,12,30,0.9)' }, option: { flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 56, paddingHorizontal: 12 },
});
