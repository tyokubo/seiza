import { gameConfig } from '../../../config/gameConfig.ts';
import type { Sky, Star } from './types';

export const phaseOneSky: Sky = {
  id: 'phase-1-sky',
  periodKey: 'prototype',
  generatorVersion: 1,
  stars: ([
    { id: 'sirius-seed', position: { x: 360, y: -180 }, brightness: 1 },
    { id: 'mintaka-seed', position: { x: 720, y: -420 }, brightness: 0.72 },
    { id: 'rigel-seed', position: { x: 980, y: 120 }, brightness: 0.9 },
    { id: 'vega-seed', position: { x: -460, y: -360 }, brightness: 0.86 },
    { id: 'altair-seed', position: { x: -980, y: 240 }, brightness: 0.65 },
    { id: 'deneb-seed', position: { x: -1160, y: -600 }, brightness: 0.78 },
    { id: 'polaris-seed', position: { x: 80, y: -920 }, brightness: 0.58 },
    { id: 'antares-seed', position: { x: 1340, y: 720 }, brightness: 0.82 },
    { id: 'spica-seed', position: { x: -240, y: 820 }, brightness: 0.68 },
    { id: 'capella-seed', position: { x: 1560, y: -760 }, brightness: 0.75 },
    { id: 'bellatrix-seed', position: { x: 330, y: -80 }, brightness: 0.76 },
    { id: 'meissa-seed', position: { x: 440, y: -180 }, brightness: 0.62 },
    { id: 'saiph-seed', position: { x: 280, y: -220 }, brightness: 0.7 },
    { id: 'alnitak-seed', position: { x: 390, y: -290 }, brightness: 0.82 },
    { id: 'alnilam-seed', position: { x: 190, y: -150 }, brightness: 0.68 },
    { id: 'sheliak-seed', position: { x: -540, y: -300 }, brightness: 0.73 },
    { id: 'sulafat-seed', position: { x: -400, y: -430 }, brightness: 0.64 },
    { id: 'zeta-lyrae-seed', position: { x: -360, y: -330 }, brightness: 0.79 },
    { id: 'west-arc-a', position: { x: -810, y: -80 }, brightness: 0.7 },
    { id: 'west-arc-b', position: { x: -920, y: -150 }, brightness: 0.84 },
    { id: 'west-arc-c', position: { x: -880, y: -280 }, brightness: 0.66 },
    { id: 'west-arc-d', position: { x: -750, y: -240 }, brightness: 0.76 },
    { id: 'north-loop-a', position: { x: 1030, y: -840 }, brightness: 0.68 },
    { id: 'north-loop-b', position: { x: 1140, y: -820 }, brightness: 0.8 },
    { id: 'north-loop-c', position: { x: 1190, y: -950 }, brightness: 0.72 },
    { id: 'north-loop-d', position: { x: 1070, y: -1010 }, brightness: 0.86 },
  ] as Star[]).map((star) => ({
    ...star,
    position: {
      x: star.position.x * gameConfig.prototypeStarSpacingScale,
      y: star.position.y * gameConfig.prototypeStarSpacingScale,
    },
  })),
};
