// FL5 reference: https://www.honda.com.my/model/type-r/spec
// Geometry is an original visual approximation, not manufacturer CAD.
export const CAR = {
  name: "Civic Type R",
  generation: "FL5",
  length: 4.593,
  width: 1.89,
  height: 1.407,
  wheelbase: 2.735,
  wheelRadius: 0.321,
  frontAxle: 1.385,
  rearAxle: -1.35,
};

export const PAINTS = [
  { name: "Championship White", hex: "#e9e6da" },
  { name: "Rallye Red", hex: "#bd1828" },
  { name: "Boost Blue", hex: "#147bd1" },
  { name: "Sonic Gray", hex: "#889a9d" },
  { name: "Crystal Black", hex: "#181c23" },
  { name: "Satin Titanium", hex: "#857d71" },
];

export const DEFAULTS = Object.freeze({
  paint: PAINTS[0].hex,
  paintName: PAINTS[0].name,
  finish: "gloss",
  hue: 210,
  saturation: 72,
  lightness: 48,
  vlt: 70,
  view: "exterior",
  environment: "studio",
  weather: "day",
  driving: false,
  speed: 60,
  wipers: "auto",
  autoRotate: false,
  paused: false,
});

export function wiperAngle(time, setting, raining) {
  if (setting === "off" || (setting === "auto" && !raining)) return -0.98;
  const frequency = setting === "fast" ? 1.05 : 0.64;
  return -0.98 + (1 - Math.cos(time * Math.PI * 2 * frequency)) * 1.06;
}
