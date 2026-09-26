import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { router, usePathname } from 'expo-router';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { SymbolView } from 'expo-symbols';
import { Animated, Platform, Pressable, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ConstellationButton } from '@/features/constellation/components/ConstellationButton';
import { useConstellationStore } from '@/features/constellation/ConstellationProvider';
import { creationChoices } from '@/features/constellation/domain/ownership';
import { useCraftingAvailability } from '@/features/constellation/hooks/useCraftingAvailability';
import { DowsingIndicator } from '@/features/exploration/components/DowsingIndicator';
import {
  ExplorationDebugOverlay,
  screenPointToDirection,
  type MountainDebugMark,
} from '@/features/exploration/components/ExplorationDebugOverlay';
import { getApertureDiameter, projectDirectionToScreen } from '@/features/exploration/domain/camera';
import { useExploration } from '@/features/exploration/hooks/useExploration';
import { getTelescopePreviewScale } from '@/features/exploration/domain/viewDirection';
import { SkyCanvas } from '@/features/sky/components/SkyCanvas';
import { phaseOneSky } from '@/features/sky/domain/sampleSky';
import { isStarAboveHorizon } from '@/features/sky/domain/sphericalCoordinates';

const searchableStarCount = phaseOneSky.stars.filter(isStarAboveHorizon).length;

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const [debugVisible, setDebugVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const store = useConstellationStore();
  const constellations = useMemo(() => store.data.library.filter((item) => item.periodKey === store.currentPeriod), [store.data.library, store.currentPeriod]);
  const pathname = usePathname();
  const [isMarkingMountain, setIsMarkingMountain] = useState(false);
  const [selectedMountainMark, setSelectedMountainMark] = useState<MountainDebugMark | null>(null);
  const [zoomProgress] = useState(() => new Animated.Value(1));
  const {
    camera,
    canvasSize,
    deviceMotionDebug,
    discoveredStarIds,
    focusStar,
    focusingStarId,
    foundStarId,
    dowsingSignal,
    gyroStatus,
    gyroEnabled,
    lastGyroStepDegrees,
    lastSwipe,
    isFocusing,
    panHandlers,
    recenterGyro,
    resetDiscoveredStars,
    registeredStars,
    registrationNotice,
    registerStar,
    setCanvasSize,
    setGyroEnabled,
    setMode,
    skyDensitySignal,
    visibleStars,
  } = useExploration(phaseOneSky, store.data.registeredStarIds, pathname === '/explore');
  const { updateRegisteredStars } = store;
  useEffect(() => updateRegisteredStars(discoveredStarIds), [discoveredStarIds, updateRegisteredStars]);
  const protectedStarIds = useMemo(() => [...new Set(store.data.library.flatMap((item) => item.starIds))], [store.data.library]);
  const resettableCount = discoveredStarIds.filter((id) => !protectedStarIds.includes(id)).length;
  const choices = useMemo(() => creationChoices(registeredStars, constellations, `${phaseOneSky.id}:${store.currentPeriod}`, camera, canvasSize), [registeredStars, constellations, store.currentPeriod, camera, canvasSize]);
  const canEnterEditor = camera.mode === 'normal' && (choices.canCreate || choices.candidates.length > 0);
  const craftingReady = useCraftingAvailability(canEnterEditor);
  const previousMode = useRef(camera.mode);
  useLayoutEffect(() => {
    if (previousMode.current === camera.mode) return;
    previousMode.current = camera.mode;
    zoomProgress.setValue(0);
    const animation = Animated.timing(zoomProgress, {
      toValue: 1,
      duration: 320,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [camera.mode, zoomProgress]);
  const projectedMountainMark = selectedMountainMark
    ? projectDirectionToScreen(selectedMountainMark.direction, camera, canvasSize)
    : null;
  const isMountainMarkVisible =
    projectedMountainMark !== null &&
    projectedMountainMark.x >= 0 &&
    projectedMountainMark.x <= canvasSize.width &&
    projectedMountainMark.y >= 0 &&
    projectedMountainMark.y <= canvasSize.height;
  const aperture = getApertureDiameter(canvasSize);
  const apertureTop = (canvasSize.height - aperture) / 2;
  const apertureLeft = (canvasSize.width - aperture) / 2;
  const modeButtonBottom = Platform.OS === 'web' ? 56 : Math.max(36, insets.bottom + 36);
  const modeButtonLeft = Math.max(12, (canvasSize.width - 160) / 2);
  const enteringTelescope = camera.mode === 'telescope';
  const zoomScale = zoomProgress.interpolate({
    inputRange: [0, 1],
    outputRange: enteringTelescope ? [getTelescopePreviewScale(), 1] : [1, getTelescopePreviewScale()],
  });

  return (
    <View style={styles.screen}>
      <View style={styles.canvasWrapper} {...panHandlers}>
        <SkyCanvas
          constellations={constellations}
          camera={camera}
          discoveredStarIds={discoveredStarIds}
          focusingStarId={focusingStarId}
          onLayoutChange={setCanvasSize}
          onStarPress={focusStar}
          registeredStars={registeredStars}
          modeChromeProgress={zoomProgress}
          size={canvasSize}
          skyDensitySignal={skyDensitySignal}
          visibleStars={visibleStars}
        />
        {__DEV__ && debugVisible && isMarkingMountain ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="山の位置を記録"
            onPress={(event) => {
              const tappedAt = { x: event.nativeEvent.locationX, y: event.nativeEvent.locationY };
              setSelectedMountainMark({
                tappedAt,
                direction: screenPointToDirection(camera, canvasSize, tappedAt),
              });
              setIsMarkingMountain(false);
            }}
            style={styles.debugTapLayer}>
            <ThemedText type="smallBold" style={styles.debugTapHint}>
              山と空の境目をタップ
            </ThemedText>
          </Pressable>
        ) : null}
        {__DEV__ && debugVisible && isMountainMarkVisible && projectedMountainMark ? (
          <View
            pointerEvents="none"
            style={[
              styles.debugMountainMarker,
              { left: projectedMountainMark.x - 10, top: projectedMountainMark.y - 10 },
            ]}
          />
        ) : null}
      </View>

      <Animated.View pointerEvents="none" style={[
        styles.zoomCue,
        {
          left: (canvasSize.width - aperture) / 2,
          top: (canvasSize.height - aperture) / 2,
          width: aperture,
          height: aperture,
          borderRadius: aperture / 2,
          opacity: zoomProgress.interpolate({ inputRange: [0, 0.45, 1], outputRange: [0.55, 0.35, 0] }),
          transform: [{ scale: zoomScale }],
        },
      ]} />

      <SafeAreaView pointerEvents="box-none" style={styles.overlay}>
        <View style={styles.topBar}>
          <View style={styles.titleBlock}>
            <ThemedText type="subtitle" style={styles.title}>
              {camera.mode === 'normal' ? '肉眼モード' : '望遠鏡モード'}
            </ThemedText>
            <View pointerEvents="none" style={styles.inlineMeta}>
              <ThemedText type="smallBold" style={styles.inlineMetaText}>
                {discoveredStarIds.length}/{searchableStarCount}
              </ThemedText>
            </View>
            {store.saveStatus === 'error' && <Pressable accessibilityRole="button" onPress={store.retrySave}>
              <ThemedText style={{ color: '#ffd89e', fontSize: 12 }}>保存を再試行</ThemedText>
            </Pressable>}
          </View>

          <View style={styles.controls}>
            {camera.mode === 'normal' && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="現在の向きに戻す"
                accessibilityHint="スワイプでずらした視点を、現在の端末の向きへ戻します"
                accessibilityState={{ disabled: !gyroEnabled || gyroStatus !== 'active' }}
                disabled={!gyroEnabled || gyroStatus !== 'active'}
                onPress={recenterGyro}
                style={[styles.settingsButton, (!gyroEnabled || gyroStatus !== 'active') && styles.settingsActionDisabled]}>
                <ThemedText type="smallBold" style={styles.settingsText}>
                  ⌖
                </ThemedText>
              </Pressable>
            )}
            <Pressable accessibilityRole="button" accessibilityLabel="設定" onPress={() => setSettingsVisible(true)} style={styles.settingsButton}>
              <MaterialCommunityIcons name="cog-outline" size={22} color="#f4fbff" />
            </Pressable>
          </View>
        </View>

        {enteringTelescope && (foundStarId || registrationNotice) ? (
          <View pointerEvents="none" style={[styles.scopeStatus, { left: apertureLeft, top: apertureTop - 66, width: aperture }]}>
            <ThemedText type="smallBold" style={foundStarId ? styles.foundTitle : styles.registeredNotice}>
              {foundStarId ? '発見！' : '登録しました'}
            </ThemedText>
          </View>
        ) : null}
        {enteringTelescope && !foundStarId && !registrationNotice && !isFocusing ? (
          <View pointerEvents="none" style={{ position: 'absolute', left: apertureLeft, top: apertureTop }}>
            <DowsingIndicator diameter={aperture} signal={dowsingSignal} />
          </View>
        ) : null}
        <View pointerEvents="box-none" style={[styles.modeControl, { left: modeButtonLeft, bottom: modeButtonBottom }]}>
          {enteringTelescope && foundStarId ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="星を登録"
              onPress={registerStar}
              style={[styles.modeButton, styles.registerButton]}>
              <MaterialCommunityIcons name="check" size={30} color="#14212b" />
            </Pressable>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={enteringTelescope ? '望遠鏡を外す' : '望遠鏡を覗く'}
              onPress={() => setMode(enteringTelescope ? 'normal' : 'telescope')}
              style={styles.modeButton}>
              {enteringTelescope ? (
                <SymbolView
                  name={{ ios: 'arrow.uturn.backward', android: 'arrow_back', web: 'arrow_back' }}
                  tintColor="#f4fbff"
                  size={26}
                />
              ) : (
                <MaterialCommunityIcons name="telescope" size={32} color="#f4fbff" />
              )}
            </Pressable>
          )}
          <ThemedText type="smallBold" style={styles.modeButtonText}>
            {enteringTelescope && foundStarId ? '登録' : enteringTelescope ? '望遠鏡を外す' : '望遠鏡を覗く'}
          </ThemedText>
        </View>
        <ConstellationButton
          bottomInset={insets.bottom}
          ready={camera.mode === 'normal' && craftingReady}
          disabled={!canEnterEditor}
          onPress={() => {
            store.beginSession(camera); router.push('/create');
          }}
        />
        <ConstellationButton side="left" bottomInset={insets.bottom} ready={false} onPress={() => router.push('/library')} />
        {__DEV__ && debugVisible ? (
          <ExplorationDebugOverlay
            camera={camera}
            deviceMotionDebug={deviceMotionDebug}
            gyroStatus={gyroStatus}
            isMarkingMountain={isMarkingMountain}
            lastGyroStepDegrees={lastGyroStepDegrees}
            lastSwipe={lastSwipe}
            onClose={() => {
              setDebugVisible(false);
              setIsMarkingMountain(false);
            }}
            onToggleMountainMark={() => setIsMarkingMountain((marking) => !marking)}
            selectedMountainMark={selectedMountainMark}
            size={canvasSize}
          />
        ) : null}
        {settingsVisible && <View style={styles.settingsOverlay}>
          <Pressable accessibilityRole="button" accessibilityLabel="設定を閉じる" onPress={() => setSettingsVisible(false)} style={StyleSheet.absoluteFill} />
          <View style={styles.settingsPanel}>
            <View style={styles.settingsHeader}>
              <ThemedText type="subtitle" style={styles.settingsTitle}>設定</ThemedText>
              <Pressable accessibilityRole="button" accessibilityLabel="閉じる" onPress={() => setSettingsVisible(false)} style={styles.settingsClose}>
                <MaterialCommunityIcons name="close" size={24} color="#f4fbff" />
              </Pressable>
            </View>
            <View style={[styles.settingsAction, styles.settingsGyroRow]}>
              <MaterialCommunityIcons name={gyroEnabled ? 'motion-sensor' : 'motion-sensor-off'} size={22} color="#f4fbff" />
              <ThemedText type="smallBold" style={[styles.settingsActionTitle, { flex: 1 }]}>ジャイロON/OFF</ThemedText>
              <View style={styles.settingsSwitchSlot}>
                <Switch accessibilityLabel="ジャイロON/OFF" value={gyroEnabled && gyroStatus === 'active'} onValueChange={setGyroEnabled}
                  disabled={gyroStatus !== 'active'} trackColor={{ false: '#526073', true: '#57a9d3' }} thumbColor="#f4fbff" />
              </View>
            </View>
            {camera.mode === 'telescope' && <Pressable accessibilityRole="button" accessibilityLabel="望遠鏡を外す"
              onPress={() => { setMode('normal'); setSettingsVisible(false); }} style={styles.settingsAction}>
              <MaterialCommunityIcons name="arrow-left" size={22} color="#f4fbff" />
              <ThemedText type="smallBold" style={styles.settingsActionTitle}>望遠鏡を外す</ThemedText>
            </Pressable>}
            {__DEV__ && <Pressable accessibilityRole="button" accessibilityLabel={debugVisible ? 'デバッグ表示を閉じる' : 'デバッグ表示を開く'}
              onPress={() => { setDebugVisible((visible) => !visible); setIsMarkingMountain(false); setSettingsVisible(false); }}
              style={[styles.settingsAction, debugVisible && styles.debugButtonActive]}>
              <MaterialCommunityIcons name="bug-outline" size={22} color="#f4fbff" />
              <ThemedText type="smallBold" style={styles.settingsActionTitle}>{debugVisible ? 'デバッグ表示を閉じる' : 'デバッグ表示を開く'}</ThemedText>
            </Pressable>}
            {__DEV__ && <Pressable accessibilityRole="button" accessibilityLabel="未使用の発見済み星を未発見に戻す"
              accessibilityState={{ disabled: resettableCount === 0 }} disabled={resettableCount === 0}
              onPress={() => { resetDiscoveredStars(protectedStarIds); setSettingsVisible(false); }}
              style={[styles.settingsAction, resettableCount === 0 && styles.settingsActionDisabled]}>
              <MaterialCommunityIcons name="restore" size={22} color="#f4fbff" />
              <View style={styles.settingsActionText}>
                <ThemedText type="smallBold" style={styles.settingsActionTitle}>発見した星を未発見に戻す</ThemedText>
                <ThemedText style={styles.settingsActionCaption}>星座に使用中の星は残します</ThemedText>
              </View>
            </Pressable>}
          </View>
        </View>}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#020510',
    overflow: 'hidden',
  },
  canvasWrapper: {
    flex: 1,
  },
  zoomCue: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#e9f8ff',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    paddingHorizontal: 16,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingTop: 6,
  },
  titleBlock: {
    flexShrink: 1,
    gap: 4,
  },
  title: {
    color: '#f4fbff',
    fontSize: 25,
    lineHeight: 30,
  },
  inlineMeta: {
    flexDirection: 'row',
    gap: 6,
  },
  inlineMetaText: {
    color: '#d9e8f5',
    backgroundColor: 'rgba(4, 12, 28, 0.34)',
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 7,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  debugButton: {
    height: 28,
    minWidth: 38,
    paddingHorizontal: 5,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  debugButtonActive: {
    backgroundColor: 'rgba(35, 160, 210, 0.55)',
  },
  debugButtonText: {
    color: '#f4fbff',
    fontSize: 10,
  },
  debugTapLayer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    paddingTop: 110,
    backgroundColor: 'rgba(5, 12, 24, 0.08)',
  },
  debugTapHint: {
    color: '#ffffff',
    backgroundColor: 'rgba(3, 12, 24, 0.84)',
    borderRadius: 5,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  debugMountainMarker: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#ffcf72',
    backgroundColor: 'rgba(255, 207, 114, 0.16)',
  },
  settingsButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  settingsText: {
    color: '#f4fbff',
    fontSize: 19,
    lineHeight: 21,
  },
  settingsOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 20,
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'rgba(0, 4, 13, 0.72)',
  },
  settingsPanel: {
    backgroundColor: '#12243a',
    borderRadius: 8,
    padding: 16,
    gap: 12,
  },
  settingsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingsTitle: { color: '#f4fbff' },
  settingsClose: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  settingsAction: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#203d60',
  },
  settingsGyroRow: { height: 64 },
  settingsSwitchSlot: { height: 44, justifyContent: 'center', alignItems: 'center' },
  settingsActionDisabled: { opacity: 0.45 },
  settingsActionText: { flex: 1 },
  settingsActionTitle: { color: '#f4fbff', fontSize: 14 },
  settingsActionCaption: { color: '#b6cada', fontSize: 11 },
  modeControl: {
    position: 'absolute',
    width: 160,
    height: 98,
    alignItems: 'center',
    gap: 6,
  },
  modeButton: {
    width: 68,
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 34,
    borderWidth: 1,
    borderColor: 'rgba(198, 228, 246, 0.48)',
    backgroundColor: 'rgba(10, 28, 48, 0.94)',
  },
  modeButtonText: {
    color: '#f4fbff',
    fontSize: 14,
    lineHeight: 20,
  },
  scopeStatus: {
    position: 'absolute',
    alignItems: 'center',
  },
  foundTitle: {
    color: '#fff0ad',
    fontSize: 20,
    lineHeight: 26,
  },
  registerButton: {
    backgroundColor: '#e9d485',
    borderColor: '#fff1a6',
  },
  registeredNotice: {
    color: '#fff0ad',
    fontSize: 16,
  },
});
