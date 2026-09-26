import { useEffect, useMemo, useReducer, useRef, useState, type ComponentProps } from 'react';
import { usePreventRemove } from 'expo-router/react-navigation';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import type { CameraState, ScreenSize } from '@/features/exploration/domain/camera';
import { SkyPanoramaView } from '@/features/sky/components/SkyPanoramaView';
import type { Star } from '@/features/sky/domain/types';
import { useConstellationStore } from '../ConstellationProvider';
import { clampEditorZoom, editorReducer, projectEditorStars, type EditorAction } from '../domain/editor';
import { draftHistoryReducer, planeStars, clampStampSize, type Draft, type FinishedConstellation } from '../domain/artwork';
import { buildDrawingRegion, stampFits } from '../domain/drawingRegion';
import { sanitizeDraft } from '../domain/saveData';
import { useConstellationGestures } from '../hooks/useConstellationGestures';
import { useArtworkGestures, type ArtTool } from '../hooks/useArtworkGestures';
import { useStampTray } from '../hooks/useStampTray';
import { ConstellationLines } from './ConstellationLines';
import { ConstellationNameDialog } from './ConstellationNameDialog';
import { ArtworkLayer } from './ArtworkLayer';
import { FinishedArtwork } from './ConstellationsInSky';
import stampImage from '../../../../assets/images/nikoniko.png';

export function ConstellationDraft({ initialCamera, stars, allStars, initialDraft, initialName, editingId, surroundings, onClose }: {
  initialCamera: CameraState; stars: Star[]; allStars: Star[]; initialDraft: Draft; initialName: string;
  editingId: string | null; surroundings: FinishedConstellation[]; onClose: () => void;
}) {
  const store = useConstellationStore();
  const [state, dispatch] = useReducer(draftHistoryReducer, { present: initialDraft, past: [], future: [] });
  const [name, setName] = useState(initialName);
  const [leaving, setLeaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [allowExit, setAllowExit] = useState(false);
  usePreventRemove(!allowExit, () => { if (!saving) setLeaving(true); });
  useEffect(() => { if (allowExit) onClose(); }, [allowExit, onClose]);
  const exit = () => { setLeaving(false); setAllowExit(true); };
  const draft = state.present;
  const [camera, setCamera] = useState(initialCamera);
  const [tool, setTool] = useState<ArtTool | 'connect'>('connect');
  const [selectedStampId, setSelectedStampId] = useState<string | null>(null);
  const selectedStamp = draft.artwork.stamps.find((stamp) => stamp.id === selectedStampId);
  const [guide, setGuide] = useState(true);
  const [naming, setNaming] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [notice, setNotice] = useState('');
  const [size, setSize] = useState<ScreenSize>({ width: 1, height: 1 });
  const origin = useRef({ x: 0, y: 0 }), canvas = useRef<View>(null);
  const points = useMemo(() => projectEditorStars(stars, camera, size), [stars, camera, size]);
  const planePoints = useMemo(() => planeStars(stars, draft.artwork.frame), [stars, draft.artwork.frame]);
  const region = useMemo(() => buildDrawingRegion(draft.connections, planePoints), [draft.connections, planePoints]);
  const visiblePoints = points.filter((point) => point.x >= 0 && point.x <= size.width && point.y >= 0 && point.y <= size.height);
  const commit = (next: Draft) => dispatch({ type: 'commit', draft: next });
  const lineDispatch = (action: EditorAction) => {
    const next = editorReducer({ connections: draft.connections, history: [] }, action);
    if (next.connections === draft.connections) return;
    const available = new Set(planePoints.map((p) => p.id));
    if (next.connections.some((edge) => !available.has(edge.from) || !available.has(edge.to))) { setNotice('この向きの星は別の星座で結んでください'); return; }
    const clean = sanitizeDraft({ ...draft, connections: next.connections }, stars);
    if (JSON.stringify(clean.artwork) !== JSON.stringify(draft.artwork)) setNotice('範囲外の描画を調整しました');
    commit(clean);
  };
  const lines = useConstellationGestures({ camera, setCamera, points, visiblePoints, connections: draft.connections, dispatch: lineDispatch, origin });
  const art = useArtworkGestures({ camera, setCamera, size, draft, region, origin, tool: tool === 'connect' ? 'pan' : tool, commit,
    selectedStampId, onSelectStamp: (id) => { setSelectedStampId(id); setNotice(''); }, onInvalid: () => setNotice('この場所には顔を配置できません') });
  const tray = useStampTray({ camera, size, draft, region, origin, commit,
    onSelect: () => { setTool('stamp'); setNotice(''); }, onPlaced: setSelectedStampId, onInvalid: () => setNotice('この場所には顔を配置できません') });
  const visibleArtwork = art.erasedIds.length ? { ...draft.artwork, strokes: draft.artwork.strokes.filter((s) => !art.erasedIds.includes(s.id)) } : draft.artwork;
  const resizeStamp = (scale: number) => {
    if (!selectedStamp) return;
    const stamp = { ...selectedStamp, size: clampStampSize(selectedStamp.size * scale) };
    if (stampFits(stamp, region)) { commit({ ...draft, artwork: { ...draft.artwork, stamps: draft.artwork.stamps.map((s) => s.id === stamp.id ? stamp : s) } }); setNotice(''); }
    else setNotice('これ以上大きくできません');
  };
  return <View style={styles.screen}>
    <View ref={canvas} style={styles.canvas} {...(tool === 'connect' ? lines.panHandlers : art.panHandlers)} onLayout={(event) => {
      const { width, height } = event.nativeEvent.layout; setSize({ width, height });
      canvas.current?.measureInWindow((x, y) => { origin.current = { x, y }; });
    }}>
      <SkyPanoramaView camera={camera} discoveredStarIds={[]} stars={allStars} size={size} />
      <View testID="reference-constellations" pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: 0.25 }]}>
        {surroundings.map((item) => <FinishedArtwork key={item.id} item={item} camera={camera} size={size} />)}
      </View>
      {(tool === 'connect' || guide) && <ConstellationLines connections={draft.connections} points={points} preview={tool === 'connect' ? lines.preview : null} size={size} markers={tool === 'connect'} />}
      <ArtworkLayer artwork={visibleArtwork} camera={camera} size={size} region={region} guide={guide}
        preview={tool === 'draw' ? art.preview : null} stampPreview={tool === 'stamp' ? art.stampPreview : null}
        selectedStampId={tool === 'stamp' ? selectedStampId : null} placement={tray.preview} />
    </View>
    <SafeAreaView pointerEvents="box-none" style={styles.overlay}>
      <View>
        <View style={styles.header}>
          <Tool label="探索に戻る" icon="arrow-left" onPress={() => setLeaving(true)} />
          <View style={styles.titleBlock}>
            <Pressable accessibilityRole="button" accessibilityLabel="星座名を変更" onPress={() => { setFinishing(false); setNaming(true); }}>
              <ThemedText numberOfLines={1} style={styles.title}>{name || '星座制作'}</ThemedText>
            </Pressable>
            <ThemedText style={styles.status}>{editingId ? '星座を編集' : '新しい星座'}</ThemedText>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="名前を付けて完成" disabled={!draft.connections.length}
            style={[styles.finish, !draft.connections.length && styles.dim]} onPress={() => { setFinishing(true); setNaming(true); }}>
            <ThemedText style={styles.finishText}>完成</ThemedText>
          </Pressable>
        </View>
        <View style={styles.history}>
          <Tool label="一手戻す" icon="undo" large disabled={!state.past.length} onPress={() => dispatch({ type: 'undo' })} />
          <Tool label="やり直す" icon="redo" large disabled={!state.future.length} onPress={() => dispatch({ type: 'redo' })} />
        </View>
      </View>
      <View style={styles.bottom}>
        {!!notice && <ThemedText style={styles.notice}>{notice}</ThemedText>}
        {tool === 'stamp' && selectedStamp && <View style={styles.tools}>
          <ThemedText style={styles.contextLabel}>顔</ThemedText>
          <Tool label="顔を縮小" icon="minus" onPress={() => resizeStamp(0.85)} />
          <Tool label="顔を拡大" icon="plus" onPress={() => resizeStamp(1.15)} />
          <Tool label="顔を削除" icon="trash-can-outline" onPress={() => commit({ ...draft, artwork: { ...draft.artwork, stamps: draft.artwork.stamps.filter((s) => s.id !== selectedStampId) } })} />
        </View>}
        <View style={styles.tools}>
          <Tool label="ガイド表示" icon={guide ? 'eye-outline' : 'eye-off-outline'} selected={guide} onPress={() => setGuide(!guide)} />
          <Tool label="縮小" icon="magnify-minus-outline" onPress={() => setCamera((c) => ({ ...c, zoom: clampEditorZoom((c.zoom ?? 1) / 1.25) }))} />
          <Tool label="拡大" icon="magnify-plus-outline" onPress={() => setCamera((c) => ({ ...c, zoom: clampEditorZoom((c.zoom ?? 1) * 1.25) }))} />
        </View>
        <View style={styles.tools}>
          <Tool label="星を結ぶ" caption="結ぶ" icon="vector-polyline" selected={tool === 'connect'} onPress={() => { setTool('connect'); setNotice(''); }} />
          <Tool label="ペン" caption="描く" icon="pencil" disabled={!draft.connections.length} selected={tool === 'draw'} onPress={() => { setTool('draw'); setNotice(''); }} />
          <Tool label="消しゴム" caption="消す" icon="eraser" disabled={!draft.artwork.strokes.length} selected={tool === 'erase'} onPress={() => setTool('erase')} />
          <Tool label="視点移動" caption="移動" icon="hand-back-right-outline" selected={tool === 'pan'} onPress={() => setTool('pan')} />
          <View {...tray.handlers} testID="face-tray" accessible accessibilityRole="button" accessibilityLabel="顔素材をドラッグ"
            style={[styles.tool, styles.modeTool, tool === 'stamp' && styles.selected, !draft.connections.length && styles.dim]}>
            <View pointerEvents="none"><Image source={stampImage} style={{ width: 32, height: 32 }} resizeMode="contain" /></View>
            <ThemedText pointerEvents="none" style={styles.toolCaption}>顔</ThemedText>
          </View>
        </View>
      </View>
    </SafeAreaView>
    {naming && <ConstellationNameDialog name={name} complete={finishing} onSave={(value) => {
      setName(value);
      if (finishing) {
        setSaving(true);
        store.completeDraft(draft, value, editingId).then(() => { setSaving(false); exit(); }).catch((error: unknown) => {
          setNotice(error instanceof Error ? error.message : '保存に失敗しました。もう一度お試しください');
          setSaving(false);
        });
      }
    }} onClose={() => setNaming(false)} />}
    {leaving && <View style={[StyleSheet.absoluteFill, styles.modalBackdrop]}>
      <View style={styles.dialog} accessibilityViewIsModal>
        <ThemedText style={styles.dialogText}>変更が保存されませんがよろしいですか？</ThemedText>
        <Pressable accessibilityRole="button" onPress={() => setLeaving(false)} style={styles.dialogAction}><ThemedText style={styles.dialogText}>制作に戻る</ThemedText></Pressable>
        <Pressable accessibilityRole="button" onPress={exit} style={styles.dialogAction}><ThemedText style={styles.dialogText}>保存せずに戻る</ThemedText></Pressable>
      </View>
    </View>}
    {saving && <View style={[StyleSheet.absoluteFill, styles.modalBackdrop]}><ActivityIndicator color="#fff" /><ThemedText style={styles.dialogText}>保存中</ThemedText></View>}
  </View>;
}

function Tool({ label, icon, onPress, disabled = false, selected = false, caption, large = false }: {
  label: string; icon: ComponentProps<typeof MaterialCommunityIcons>['name']; onPress: () => void; disabled?: boolean; selected?: boolean; caption?: string; large?: boolean;
}) {
  const [hover, setHover] = useState(false);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected }} disabled={disabled}
    onPress={onPress} onHoverIn={() => setHover(true)} onHoverOut={() => setHover(false)} style={[styles.tool, large && styles.historyButton, caption && styles.modeTool, selected && styles.selected]}>
    <MaterialCommunityIcons name={icon} size={large ? 28 : 23} color={disabled ? '#73808b' : '#f0f7ff'} />
    {caption && <ThemedText style={[styles.toolCaption, disabled && styles.dim]}>{caption}</ThemedText>}
    {hover && <View pointerEvents="none" style={styles.tooltip}><ThemedText style={styles.tooltipText}>{label}</ThemedText></View>}
  </Pressable>;
}
const styles = StyleSheet.create({
  history: { flexDirection: 'row', gap: 8, alignSelf: 'flex-end', margin: 12 },
  historyButton: { width: 56, height: 56, borderRadius: 8, backgroundColor: 'rgba(5,12,30,0.85)' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 360, backgroundColor: '#152340', padding: 20, borderRadius: 8, gap: 12 },
  dialogText: { color: '#fff', fontSize: 15, lineHeight: 24 }, dialogAction: { minHeight: 48, justifyContent: 'center', alignItems: 'center', borderTopWidth: 1, borderColor: '#394a64' },
  screen: { flex: 1, backgroundColor: '#020510' }, canvas: { flex: 1, overflow: 'hidden', touchAction: 'none' },
  overlay: { ...StyleSheet.absoluteFill, justifyContent: 'space-between' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, backgroundColor: 'rgba(5,12,30,0.75)' },
  titleBlock: { flex: 1, padding: 8 }, title: { color: '#eff9ff', fontSize: 18, lineHeight: 25 }, status: { color: '#adbfcc', fontSize: 11, lineHeight: 18 },
  selected: { backgroundColor: '#314c78', borderRadius: 6 }, dim: { opacity: 0.35 },
  bottom: { padding: 12, alignItems: 'center', gap: 8 }, tools: { flexDirection: 'row', backgroundColor: 'rgba(5,12,30,0.88)', borderRadius: 8, padding: 6, maxWidth: '100%' },
  tool: { width: 44, height: 48, alignItems: 'center', justifyContent: 'center' }, notice: { color: '#ffdbac', fontSize: 13 },
  finish: { minHeight: 48, paddingHorizontal: 18, justifyContent: 'center' }, finishText: { color: '#eff9ff', fontSize: 16 },
  modeTool: { width: 52, height: 60, touchAction: 'none' }, toolCaption: { fontSize: 11, lineHeight: 16, color: '#eef6ff', marginTop: 3 },
  contextLabel: { alignSelf: 'center', color: '#c8d8e8', fontSize: 13, paddingHorizontal: 12 },
  tooltip: { position: 'absolute', bottom: 50, backgroundColor: '#101a2d', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, width: 100 },
  tooltipText: { color: '#fff', fontSize: 11, textAlign: 'center' },
});
