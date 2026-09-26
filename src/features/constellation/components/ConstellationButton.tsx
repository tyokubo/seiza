import { useEffect, useState } from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { gameConfig } from '@/config/gameConfig';

type Props = {
  bottomInset: number;
  onPress: () => void;
  ready: boolean;
  side?: 'left' | 'right';
  disabled?: boolean;
};

export function ConstellationButton({ bottomInset, onPress, ready, side = 'right', disabled = false }: Props) {
  const [progress] = useState(() => new Animated.Value(ready ? 1 : 0));
  const [pressScale] = useState(() => new Animated.Value(1));
  const animatePress = (toValue: number) => Animated.spring(pressScale, {
    toValue, tension: 250, friction: 13, useNativeDriver: true,
  }).start();

  useEffect(() => {
    const spring = Animated.spring(progress, {
      toValue: ready ? 1 : 0,
      tension: gameConfig.constellationButton.springTension,
      friction: gameConfig.constellationButton.springFriction,
      useNativeDriver: true,
    });
    spring.start();
    return () => spring.stop();
  }, [progress, ready]);

  const { diameter, centerBottomInset, centerRightInset } = gameConfig.constellationButton;
  const circleOffset = diameter / 2;

  return (
    <Animated.View pointerEvents="box-none" style={[
      styles.container,
      {
        width: diameter,
        height: diameter,
        borderRadius: circleOffset,
        [side]: centerRightInset - circleOffset,
        bottom: centerBottomInset - circleOffset,
        transform: [
          { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [side === 'right' ? 8 : -8, 0] }) },
          { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
          { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.06] }) },
        ],
      },
    ]}>
      <Pressable
        testID={side === 'right' ? 'constellation-button' : 'library-button'}
        accessibilityRole="button"
        accessibilityLabel={side === 'right' ? '星座を作る' : '星座図鑑'}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        onPressIn={() => animatePress(0.9)}
        onPressOut={() => animatePress(1)}
        style={[styles.hitArea, {
          left: side === 'right' ? circleOffset - 64 : circleOffset,
          top: circleOffset + centerBottomInset - Math.max(bottomInset, 16) - 66,
        }]}>
        <Animated.View pointerEvents="none" style={[styles.buttonContent, { transform: [{ scale: pressScale }] }]}>
          {side === 'right' ? <View style={styles.constellationIcon}>
            <MaterialCommunityIcons name="vector-polyline" size={32} color={disabled ? '#a3acc3' : '#edf3ff'} />
            <MaterialCommunityIcons name="star-four-points" size={12} color={disabled ? '#a3acc3' : '#edf3ff'} style={styles.iconStar} />
          </View> : <MaterialCommunityIcons name="book-open-page-variant-outline" size={32} color="#edf3ff" />}
          <Animated.Text numberOfLines={1} style={[styles.caption, disabled && styles.disabledCaption]}>
            {side === 'right' ? '星座を作る' : '図鑑を見る'}
          </Animated.Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    backgroundColor: '#182f68',
    overflow: 'hidden',
  },
  hitArea: {
    position: 'absolute',
    width: 64,
    height: 78,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonContent: { alignItems: 'center', justifyContent: 'center', gap: 3 },
  constellationIcon: { width: 36, height: 34, alignItems: 'center', justifyContent: 'center' },
  iconStar: { position: 'absolute', right: -1, top: -2 },
  caption: { color: '#edf3ff', fontSize: 10, lineHeight: 14, textAlign: 'center' },
  disabledCaption: { color: '#a3acc3' },
});
