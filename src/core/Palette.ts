/**
 * The single committed palette for the whole game.
 * High-saturation anime key: indigo ink, tropical blues, hot orange accents.
 * Every material, shader band, HUD stroke and particle pulls from here.
 */
export const Palette = {
  // Ink — never pure black; deep indigo reads as hand-inked line work.
  ink: 0x101a38,
  inkSoft: 0x24356b,

  // Sky
  skyZenith: 0x2c63d8,
  skyMid: 0x5ea4f0,
  skyHorizon: 0xb8ecff,
  sunCore: 0xfff7d6,
  sunHalo: 0xffd98a,
  cloudLit: 0xffffff,
  cloudShade: 0x9cc4f2,

  // Water bands (deep -> crest). Hard steps between these.
  waterDeep: 0x123f9e,
  waterMid: 0x1e6fe0,
  waterLight: 0x3fb7f0,
  waterCrest: 0x8feffa,
  foam: 0xf2feff,
  sparkle: 0xeafcff,

  // Accents
  orange: 0xff7a38,
  yellow: 0xffd23f,
  red: 0xf04a4a,
  raceGreen: 0x3cf2a4,
  purple: 0x7a5cff,
  teal: 0x2ee6c8,
  white: 0xffffff,

  // Boat liveries: [hull, deck, trim]
  liveries: [
    { hull: 0xff7a38, deck: 0xfff1e2, trim: 0x101a38, name: "SUNBURN" }, // player
    { hull: 0x2ee6c8, deck: 0xeafffb, trim: 0x0d4a5e, name: "RIPTIDE" },
    { hull: 0xffd23f, deck: 0x2b2b3a, trim: 0x8a2be2, name: "WASP" },
    { hull: 0xf04a4a, deck: 0xffe9e2, trim: 0x27124a, name: "CORSAIR" },
  ],
} as const;

export function hex(c: number): string {
  return "#" + c.toString(16).padStart(6, "0");
}
