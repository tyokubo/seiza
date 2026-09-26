import { useEffect, useState } from 'react';
import { gameConfig } from '@/config/gameConfig';

export function useCraftingAvailability(eligible: boolean) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setReady(eligible), eligible
      ? gameConfig.constellationButton.showDelayMs
      : gameConfig.constellationButton.hideDelayMs);
    return () => clearTimeout(timer);
  }, [eligible]);
  return ready;
}
