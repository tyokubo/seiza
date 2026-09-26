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
        style={[styles.hitArea, {
          left: side === 'right' ? circleOffset - 64 : circleOffset,
          top: circleOffset + centerBottomInset - Math.max(bottomInset, 16) - 72,
        }]}>
        <View pointerEvents="none">
          <MaterialCommunityIcons name={side === 'right' ? 'creation-outline' : 'book-open-page-variant-outline'} size={32} color={disabled ? '#a3acc3' : '#edf3ff'} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    backgroundColor: '#182f68',
    borderWidth: 1,
    borderColor: '#647fb4',
    overflow: 'hidden',
  },
  hitArea: {
    position: 'absolute',
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
