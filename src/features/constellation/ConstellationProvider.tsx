import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import type { CameraState } from '@/features/exploration/domain/camera';
import { phaseOneSky } from '@/features/sky/domain/sampleSky';
import { loadSkySave, saveSkySave } from '@/services/storage/skyRepository';
import { normalizeConstellationName, type SkySaveData } from './domain/saveData';
import { sanitizeDraft, replaceFinished } from './domain/saveData';
import { artworkId, periodKey, type Draft } from './domain/artwork';
import { validateConnections } from './domain/ownership';

type Store = {
  data: SkySaveData;
  sessionCamera: CameraState | null;
  sessionTarget: string | null;
  sessionPeriod: string;
  beginSession: (camera: CameraState, constellationId?: string) => void;
  endSession: () => void;
  updateRegisteredStars: (ids: string[]) => void;
  completeDraft: (draft: Draft, name: string, editingId: string | null) => Promise<void>;
  deleteConstellation: (id: string) => void;
  currentPeriod: string;
  saveStatus: 'saving' | 'saved' | 'error';
  retrySave: () => void;
};
const Context = createContext<Store | null>(null);

export function ConstellationProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<SkySaveData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saveAttempt, setSaveAttempt] = useState(0);
  const [savedData, setSavedData] = useState<SkySaveData | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [sessionCamera, setSessionCamera] = useState<CameraState | null>(null);
  const [sessionTarget, setSessionTarget] = useState<string | null>(null);
  const [sessionPeriod, setSessionPeriod] = useState(() => periodKey(new Date()));
  const dataRef = useRef(data);
  useLayoutEffect(() => { dataRef.current = data; }, [data]);
  const committing = useRef(false);
  const writes = useRef(Promise.resolve());
  const [currentPeriod, setCurrentPeriod] = useState(() => periodKey(new Date()));
  useEffect(() => {
    const timer = setInterval(() => setCurrentPeriod(periodKey(new Date())), 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let current = true;
    loadSkySave(phaseOneSky).then((saved) => { if (current) setData({ ...saved, connections: [], artwork: null, name: '', editingId: null }); })
      .catch(() => { if (current) setLoadError(true); });
    return () => { current = false; };
  }, [loadAttempt]);

  useEffect(() => {
    if (!data) return;
    let current = true;
    // Serialize writes so a slower old edit cannot overwrite a newer one.
    writes.current = writes.current.catch(() => {}).then(() => saveSkySave(data));
    writes.current.then(() => { if (current) { setSavedData(data); setSaveError(false); } })
      .catch(() => { if (current) setSaveError(true); });
    return () => { current = false; };
  }, [data, saveAttempt]);

  const updateRegisteredStars = useCallback((ids: string[]) => setData((old) => {
    if (!old || (old.registeredStarIds.length === ids.length && old.registeredStarIds.every((id, index) => id === ids[index]))) return old;
    return { ...old, registeredStarIds: ids };
  }), []);
  const completeDraft = useCallback(async (draft: Draft, value: string, editingId: string | null) => {
    if (committing.current) throw new Error('保存中です');
    const old = dataRef.current;
    if (!old) throw new Error('保存データを読み込み中です');
    const name = normalizeConstellationName(value);
    if (!name) throw new Error('星座名を入力してください');
    const now = new Date(), month = periodKey(now);
    if (month !== sessionPeriod) throw new Error('月が変わりました。探索に戻って制作を開始してください');
    const previous = old.library.find((item) => item.id === editingId);
    const skyId = `${phaseOneSky.id}:${month}`;
    if (editingId && (!previous || previous.skyId !== skyId)) throw new Error('この星座は現在編集できません');
    const stars = phaseOneSky.stars.filter((star) => old.registeredStarIds.includes(star.id));
    validateConnections(draft, stars, old.library, skyId, editingId);
    const clean = sanitizeDraft(draft, stars);
    const starIds = [...new Set(clean.connections.flatMap((edge) => [edge.from, edge.to]))];
    const finished = { ...clean, id: previous?.id ?? artworkId(), skyId, periodKey: month,
      stars: stars.filter((star) => starIds.includes(star.id)), starIds, name, createdAt: previous?.createdAt ?? now.toISOString() };
    const next = { ...old, name: '', connections: [], artwork: null, editingId: null, library: replaceFinished(old.library, finished) };
    committing.current = true;
    try {
      // Publish the new ownership and artwork only after the explicit save succeeds.
      const write = writes.current.catch(() => {}).then(() => saveSkySave(next));
      writes.current = write;
      await write;
      dataRef.current = next;
      setData(next); setSavedData(next); setSaveError(false);
    } finally { committing.current = false; }
  }, [sessionPeriod]);

  const deleteConstellation = useCallback((id: string) => setData((old) => old
    ? { ...old, ...(old.editingId === id ? { editingId: null, artwork: null, connections: [], name: '' } : {}), library: old.library.filter((item) => item.id !== id) } : old), []);
  const endSession = useCallback(() => { setSessionCamera(null); setSessionTarget(null); }, []);

  if (!data) return <View style={styles.loading}>
    {loadError ? <Pressable accessibilityRole="button" onPress={() => { setLoadError(false); setLoadAttempt((value) => value + 1); }}>
      <ThemedText style={styles.message}>保存データを読み込めませんでした。再試行</ThemedText>
    </Pressable> : <ActivityIndicator color="#d9e2e5" />}
  </View>;

  return <Context.Provider value={{
    data, sessionCamera, sessionTarget, sessionPeriod, currentPeriod, completeDraft, deleteConstellation, saveStatus: saveError ? 'error' : savedData === data ? 'saved' : 'saving', updateRegisteredStars,
    beginSession: (camera, constellationId) => {
      setSessionTarget(constellationId ?? null);
      setSessionPeriod(periodKey(new Date()));
      setSessionCamera({ ...camera, mode: 'normal', zoom: 1 });
    },
    endSession,
    retrySave: () => { setSaveError(false); setSaveAttempt((value) => value + 1); },
  }}>{children}</Context.Provider>;
}

export function useConstellationStore(): Store {
  const store = useContext(Context);
  if (!store) throw new Error('ConstellationProvider is missing');
  return store;
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#020510', padding: 24 },
  message: { color: '#ffffff', textAlign: 'center' },
});
