import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { ConstellationProvider } from '@/features/constellation/ConstellationProvider';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <ConstellationProvider>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#020510' } }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="explore" />
          <Stack.Screen name="create" options={{ animation: 'fade', gestureEnabled: false }} />
        </Stack>
      </ConstellationProvider>
    </ThemeProvider>
  );
}
