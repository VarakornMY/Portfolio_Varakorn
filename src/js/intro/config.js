/** Replace this file's modelUrl with your own humanoid VRM 1.0 or VRM 0.x.
 * The camera and wrist attachments are measured from its skeleton at runtime.
 * See public/models/README.md for the character swap instructions and license.
 */
export const openingConfig = {
  modelUrl: '/models/vrm-sample.vrm',
  characterName: 'VRM sample by pixiv',
  creditLabel: 'Character by pixiv',
  creditUrl: 'https://github.com/pixiv/three-vrm',
  modelScale: 1,
  // Set to Math.PI only if a custom model faces away from the camera.
  facingRotation: 0,
  eyeTargetOffset: [0, 0, 0],
  eyeTrackingStrength: 1,
  scrollDistance: 5.8,
  smoothing: 0.14,
  maxPixelRatio: 1.5,
  sessionKey: 'varakorn:unchained:v2',
};
