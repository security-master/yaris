/**
 * Tropical Ink — committed NPR palette.
 * High saturation, limited set. Never drift into PBR neutrals or purple haze.
 */
export const Palette = {
  // Water bands (deep → crest)
  waterDeep: 0x0a3550,
  waterMid: 0x12809a,
  waterShallow: 0x2eb8c9,
  waterCrest: 0x9aefe8,
  foam: 0xf5fffd,
  sparkle: 0xfff6c8,

  // Sky
  skyZenith: 0x1e4a8c,
  skyHorizon: 0x7ec8e8,
  skyGlow: 0xffd978,
  sunCore: 0xfff3a8,
  sunRim: 0xffb84a,
  cloudLit: 0xfff8ef,
  cloudShade: 0xc5d8ef,
  cloudRim: 0xffffff,

  // Hulls
  playerHull: 0xe85d4c,
  playerAccent: 0xffd24a,
  aiHulls: [0x2f8fff, 0xf0a020, 0x2ecf8a] as const,
  deck: 0xf2efe6,
  ink: 0x141018,
  metalBand: 0xffe08a,

  // Course / UI
  racingLine: 0x39ff7f,
  racingLineGlow: 0xa8ffd0,
  gate: 0x5dff9a,
  gateWrong: 0xff5a5a,
  hudInk: 0x101820,
  hudPanel: 0x0c2430,
  hudAccent: 0xffd93d,
  hudGood: 0x39ff7f,
  hudWarn: 0xff6b4a,
  white: 0xffffff,
} as const;

export const LightDir = { x: 0.45, y: 0.82, z: 0.35 };
