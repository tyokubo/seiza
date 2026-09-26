import { useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { FlatList, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { ThemedText } from '@/components/themed-text';
import { useConstellationStore } from '@/features/constellation/ConstellationProvider';
import { FinishedArtwork } from '@/features/constellation/components/ConstellationsInSky';
import { planeStars, planeToDirection, type FinishedConstellation } from '@/features/constellation/domain/artwork';
import { clampEditorZoom, projectEditorStars } from '@/features/constellation/domain/editor';
import { useConstellationGestures } from '@/features/constellation/hooks/useConstellationGestures';
import { cameraOrientationToward, type CameraState, type ScreenSize } from '@/features/exploration/domain/camera';
import { SkyPanoramaView } from '@/features/sky/components/SkyPanoramaView';
import { DeleteConstellationDialog } from '@/features/constellation/components/DeleteConstellationDialog';

function fittedCamera(item: FinishedConstellation, size: ScreenSize): CameraState {
  const points = planeStars(item.stars, item.artwork.frame);
  const center = { x: points.reduce((sum, p) => sum + p.x, 0) / Math.max(1, points.length), y: points.reduce((sum, p) => sum + p.y, 0) / Math.max(1, points.length) };
  const initial: CameraState = { orientation: item.artwork.frame, mode: 'normal', zoom: 1 };
  const camera = { ...initial, orientation: cameraOrientationToward(initial, planeToDirection(center, item.artwork.frame)) };
  const projected = projectEditorStars(item.stars, camera, size);
  const extent = Math.max(0.2, ...projected.map((p) => Math.max(Math.abs(p.x - size.width / 2) / (size.width * 0.3), Math.abs(p.y - size.height / 2) / (size.height * 0.3))));
  return { ...camera, zoom: clampEditorZoom(1 / extent) };
}
export default function LibraryScreen() {
  const { data, deleteConstellation, saveStatus, retrySave, beginSession, currentPeriod } = useConstellationStore();
  const [selected, setSelected] = useState<FinishedConstellation | null>(null);
  const [deleting, setDeleting] = useState<FinishedConstellation | null>(null);
  const dimensions = useWindowDimensions();
  const confirmation = deleting && <DeleteConstellationDialog name={deleting.name} onCancel={() => setDeleting(null)} onDelete={() => {
    deleteConstellation(deleting.id); setDeleting(null); setSelected(null);
  }} />;
  if (selected) return <><ArchiveViewer key={selected.id} item={selected} onClose={() => setSelected(null)} onDelete={() => setDeleting(selected)} />{confirmation}</>;
  const previewSize = { width: Math.min(dimensions.width - 32, 520), height: 200 };
  return <SafeAreaView style={styles.screen}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="探索に戻る" style={styles.button} onPress={() => router.canGoBack() ? router.back() : router.replace('/explore')}><MaterialCommunityIcons name="arrow-left" color="#fff" size={25} /></Pressable>
      <ThemedText style={styles.title}>星座図鑑</ThemedText>
    </View>
    {saveStatus === 'error' && <Pressable accessibilityRole="button" onPress={retrySave}><ThemedText style={styles.empty}>変更の保存に失敗しました。再試行</ThemedText></Pressable>}
    <FlatList data={[...data.library].reverse()} keyExtractor={(item) => item.id} contentContainerStyle={styles.list}
      ListEmptyComponent={<ThemedText style={styles.empty}>完成した星座はまだありません</ThemedText>}
      renderItem={({ item }) => <View style={[styles.entry, { width: previewSize.width }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${item.name}を開く`} onPress={() => setSelected(item)}><Preview item={item} size={previewSize} /></Pressable>
        <View style={[styles.caption, { flexDirection: 'row', alignItems: 'center' }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={`${item.name}の詳細`} style={{ flex: 1 }} onPress={() => setSelected(item)}><ThemedText numberOfLines={2} style={styles.name}>{item.name}</ThemedText><ThemedText style={styles.date}>{item.periodKey}</ThemedText></Pressable>
          {item.periodKey === currentPeriod &&
            <Pressable accessibilityRole="button" accessibilityLabel={`${item.name}を編集`} style={styles.button} onPress={() => {
              beginSession(fittedCamera(item, dimensions), item.id); router.push('/create');
            }}><MaterialCommunityIcons name="pencil-outline" color="#c7d4e6" size={23} /></Pressable>}
          <Pressable accessibilityRole="button" accessibilityLabel={`${item.name}を削除`} onPress={() => setDeleting(item)} style={styles.button}><MaterialCommunityIcons name="trash-can-outline" color="#c7d4e6" size={23} /></Pressable>
        </View>
      </View>} />
    {confirmation}
  </SafeAreaView>;
}
function Preview({ item, size }: { item: FinishedConstellation; size: ScreenSize }) {
  const camera = useMemo(() => fittedCamera(item, size), [item, size]);
  return <View pointerEvents="none" style={{ width: size.width, height: size.height, overflow: 'hidden' }}>
    <FinishedArtwork item={item} camera={camera} size={size} />
    <Svg width={size.width} height={size.height}>{projectEditorStars(item.stars, camera, size).map((p) => <Circle key={p.id} cx={p.x} cy={p.y} r={2} fill="#fff7db" />)}</Svg>
  </View>;
}
function ArchiveViewer({ item, onClose, onDelete }: { item: FinishedConstellation; onClose: () => void; onDelete: () => void }) {
  const dimensions = useWindowDimensions();
  const [size, setSize] = useState<ScreenSize>(dimensions);
  const [camera, setCamera] = useState(() => fittedCamera(item, dimensions));
  const origin = useRef({ x: 0, y: 0 }), canvas = useRef<View>(null);
  const { panHandlers } = useConstellationGestures({ camera, setCamera, points: [], visiblePoints: [], connections: [], dispatch: () => {}, origin });
  return <View style={styles.screen}>
    <View ref={canvas} style={{ flex: 1, touchAction: 'none' }} {...panHandlers} onLayout={(event) => { setSize(event.nativeEvent.layout); canvas.current?.measureInWindow((x, y) => { origin.current = { x, y }; }); }}>
      <SkyPanoramaView camera={camera} size={size} stars={item.stars} discoveredStarIds={[]} />
      <FinishedArtwork item={item} camera={camera} size={size} />
    </View>
    <SafeAreaView pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="図鑑に戻る" onPress={onClose} style={styles.button}><MaterialCommunityIcons name="arrow-left" size={25} color="#fff" /></Pressable>
        <View style={{ flex: 1 }}><ThemedText numberOfLines={1} style={styles.title}>{item.name}</ThemedText><ThemedText style={styles.date}>{item.periodKey}</ThemedText></View>
        <Pressable accessibilityRole="button" accessibilityLabel="全体を表示" style={styles.button} onPress={() => setCamera(fittedCamera(item, size))}><MaterialCommunityIcons name="fit-to-screen-outline" size={25} color="#fff" /></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="この星座を削除" onPress={onDelete} style={styles.button}><MaterialCommunityIcons name="trash-can-outline" color="#e3bfc7" size={23} /></Pressable>
      </View>
    </SafeAreaView>
  </View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#080e20' }, header: { flexDirection: 'row', alignItems: 'center', minHeight: 60, paddingHorizontal: 8, backgroundColor: 'rgba(8,14,32,0.8)' },
  button: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }, title: { fontSize: 20, color: '#f1f6ff', lineHeight: 28 },
  list: { padding: 16, gap: 16, alignItems: 'center' }, entry: { borderRadius: 8, backgroundColor: '#152340', overflow: 'hidden', borderWidth: 1, borderColor: '#324361' },
  caption: { padding: 14, gap: 4 }, name: { fontSize: 18, color: '#f1f6ff' }, date: { color: '#a7b9cf', fontSize: 12 }, empty: { marginTop: 40, color: '#a7b9cf', fontSize: 15 },
});
