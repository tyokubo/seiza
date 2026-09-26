import { useCallback, useEffect, useMemo, useState } from 'react';
import { Redirect, router } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import { useConstellationStore } from '@/features/constellation/ConstellationProvider';
import { ConstellationDraft } from '@/features/constellation/components/ConstellationDraft';
import { ConstellationSelection } from '@/features/constellation/components/ConstellationSelection';
import { availableStars, creationChoices } from '@/features/constellation/domain/ownership';
import { emptyArtwork } from '@/features/constellation/domain/artwork';
import type { CameraState } from '@/features/exploration/domain/camera';
import { phaseOneSky } from '@/features/sky/domain/sampleSky';

export default function CreateScreen() {
  const store = useConstellationStore();
  const { endSession } = store;
  useEffect(() => () => endSession(), [endSession]);
  const dimensions = useWindowDimensions();
  const close = useCallback(() => router.dismissTo('/explore'), []);
  const [target, setTarget] = useState<{ id: string | null; camera: CameraState } | null>(() =>
    store.sessionTarget && store.sessionCamera ? { id: store.sessionTarget, camera: store.sessionCamera } : null);
  const stars = useMemo(() => phaseOneSky.stars.filter((star) => store.data.registeredStarIds.includes(star.id)), [store.data.registeredStarIds]);
  const skyId = `${phaseOneSky.id}:${store.sessionPeriod}`;
  const items = useMemo(() => store.data.library.filter((item) => item.skyId === skyId), [store.data.library, skyId]);
  if (!store.sessionCamera) return <Redirect href="/explore" />;
  const choices = creationChoices(stars, items, skyId, store.sessionCamera, dimensions);
  if (!target) return <ConstellationSelection initialCamera={store.sessionCamera} stars={stars} items={items}
    candidates={choices.candidates} canCreate={choices.canCreate} onSelect={(id, camera) => setTarget({ id, camera })} onClose={close} />;
  const item = items.find((entry) => entry.id === target.id);
  return <ConstellationDraft initialCamera={target.camera} stars={availableStars(stars, items, skyId, target.id)} allStars={stars}
    initialDraft={item ? { connections: item.connections, artwork: item.artwork } : { connections: [], artwork: emptyArtwork(target.camera.orientation) }}
    initialName={item?.name ?? ''} editingId={target.id} surroundings={items.filter((entry) => entry.id !== target.id)} onClose={close} />;
}
