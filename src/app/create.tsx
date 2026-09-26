import { useCallback, useEffect, useMemo } from 'react';
import { Redirect, router } from 'expo-router';
import { useWindowDimensions } from 'react-native';
import { useConstellationStore } from '@/features/constellation/ConstellationProvider';
import { ConstellationDraft } from '@/features/constellation/components/ConstellationDraft';
import { availableStars, creationChoices, preferredCreationTarget } from '@/features/constellation/domain/ownership';
import { emptyArtwork } from '@/features/constellation/domain/artwork';
import { phaseOneSky } from '@/features/sky/domain/sampleSky';

export default function CreateScreen() {
  const store = useConstellationStore();
  const { endSession } = store;
  useEffect(() => () => endSession(), [endSession]);
  const dimensions = useWindowDimensions();
  const close = useCallback(() => router.dismissTo('/explore'), []);
  const stars = useMemo(() => phaseOneSky.stars.filter((star) => store.data.registeredStarIds.includes(star.id)), [store.data.registeredStarIds]);
  const skyId = `${phaseOneSky.id}:${store.sessionPeriod}`;
  const items = useMemo(() => store.data.library.filter((item) => item.skyId === skyId), [store.data.library, skyId]);
  const camera = store.sessionCamera;
  const targetId = camera ? store.sessionTarget ?? preferredCreationTarget(creationChoices(stars, items, skyId, camera, dimensions), camera, dimensions) : undefined;
  if (!camera || targetId === undefined) return <Redirect href="/explore" />;
  const item = items.find((entry) => entry.id === targetId);
  return <ConstellationDraft initialCamera={camera} stars={availableStars(stars, items, skyId, targetId)} allStars={stars}
    initialDraft={item ? { connections: item.connections, artwork: item.artwork } : { connections: [], artwork: emptyArtwork(camera.orientation) }}
    initialName={item?.name ?? ''} editingId={targetId} surroundings={items.filter((entry) => entry.id !== targetId)} onClose={close} />;
}
