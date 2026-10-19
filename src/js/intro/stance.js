import { clamp, smoothstep } from './ScrollExpand.js';

// The restraints release only after the knees have fully straightened.
export const STAND_COMPLETE = 0.765;

// Local X rotations: thigh, shin, ankle. Begin seated on both heels, rise to
// the knees, plant the left foot, transfer weight onto it, then straighten.
// The scene grounds the actual knee/toe/ankle bones after applying each pose.
const POSES = [
  { at: 0, left: [-1.05, 2.55, 1.64], right: [-1.05, 2.55, 1.64], lean: .12 },
  { at: .23, left: [-1.05, 2.55, 1.64], right: [-1.05, 2.55, 1.64], lean: .12 },
  { at: .36, left: [-.22, 1.80, 1.55], right: [-.22, 1.80, 1.55], lean: .09 },
  { at: .50, left: [-1.55, 1.55, 0], right: [-.05, 1.62, 1.55], lean: .17 },
  { at: .63, left: [-.68, 1.05, -.37], right: [.08, .85, -.93], lean: .20 },
  { at: STAND_COMPLETE, left: [0, 0, 0], right: [0, 0, 0], lean: 0 },
];

export function standingPose(progress, strain = 0) {
  // Each failed pull briefly yields under the load; the final rise is decisive.
  const p = clamp(progress - strain * .018 * (1 - smoothstep(.70, STAND_COMPLETE, progress)));
  let index = POSES.findIndex((pose) => pose.at >= p);
  if (index < 0) index = POSES.length - 1;
  const to = POSES[index];
  const from = POSES[Math.max(0, index - 1)];
  const t = smoothstep(from.at, to.at, p);
  const blend = (a, b) => a + (b - a) * t;
  return {
    left: from.left.map((angle, i) => blend(angle, to.left[i])),
    right: from.right.map((angle, i) => blend(angle, to.right[i])),
    lean: blend(from.lean, to.lean),
    rise: smoothstep(.23, STAND_COMPLETE, p),
    standing: progress >= STAND_COMPLETE,
  };
}
