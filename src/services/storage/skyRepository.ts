import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseSkySave, type SkySaveData } from '@/features/constellation/domain/saveData';
import type { Sky } from '@/features/sky/domain/types';

const keyFor = (skyId: string) => `seiza:sky:${skyId}:v1`;

export async function loadSkySave(sky: Sky): Promise<SkySaveData> {
  return parseSkySave(await AsyncStorage.getItem(keyFor(sky.id)), sky);
}

export async function saveSkySave(data: SkySaveData): Promise<void> {
  await AsyncStorage.setItem(keyFor(data.skyId), JSON.stringify(data));
}
