# Opening character

The opening uses a real, skinned anime VRM with a humanoid skeleton, facial
expressions, MToon materials, and secondary hair motion. The chains attach to
the animated wrist bones. The character is rendered locally by Three.js.

## Replace the character

1. Export your character as **VRM 1.0** (preferred) or VRM 0.x. VRoid Studio and
   the UniVRM exporter can create this format. A plain GLB without VRM humanoid
   metadata is not a drop-in replacement.
2. Copy it into this folder, for example `public/models/my-character.vrm`.
3. Set `modelUrl: '/models/my-character.vrm'` in `src/js/intro/config.js` and
   update `characterName`, `creditLabel` and `creditUrl` in the same file.
4. Keep standard head, arm, hand, and finger mappings. Eye bones provide exact
   close-up targeting; a head-based fallback is provided. Test your character's
   poses and framing with `/home?intro=1`. Use `eyeTargetOffset` for eye framing
   adjustments, and `facingRotation` if your export faces away from the camera.

The model is normalized to the same stage height automatically. The eye camera
and wrist attachments are derived from its humanoid skeleton. Finger, head,
spine, arm poses and standard facial expressions are set by the scroll timeline.
Character proportions can still require artistic tuning in `scene.js`.

The eyes follow mouse/pen movement with smoothing; `eyeTrackingStrength` in the
config controls the amount. The model's VRM LookAt limits are respected, with
an eye-bone fallback for models without that extension. Touch stays dedicated
to scrolling. The gaze returns to center when the pointer leaves the intro.

`src/js/intro/stance.js` defines the kneeling, foot planting, and standing poses.
Standard hips, thigh, shin and foot bones are required. Ground contact is
calculated from the posed skeleton. The chain release and automatic finale
start as soon as the rise reaches `STAND_COMPLETE`, not while still kneeling.

## Included model and license

- File: `vrm-sample.vrm`
- Name: `VRM1_Constraint_Twist_Sample`, v1.0.1
- Author and copyright: **pixiv Inc., (c) 2022 pixiv Inc.**
- Source (pinned release):
  https://github.com/pixiv/three-vrm/blob/v3.4.2/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm
- License: **VRM Public License 1.0**
  https://vrm.dev/licenses/1.0/
- Model metadata permits redistribution, modification and redistribution of
  modifications, and corporate commercial use. Credit notation is not required;
  the prologue nevertheless credits pixiv. The model file is unmodified.
- The license metadata is embedded inside the VRM. Preserve it when redistributing.

The `@pixiv/three-vrm` loader is independently MIT licensed. Its dependency
license ships with the npm package. The included model is governed by the VRM
license above, not by the loader's MIT license.

## Playback

The prologue is desktop-only: the viewport must be at least 1024px wide, with
hover support and a fine primary pointer. Phones, touch tablets and smaller
layouts bypass it entirely, without loading the intro scene or character. The
replay control is hidden there, and `?intro=1` does not override this restriction.
An active intro exits immediately if the viewport becomes ineligible.

On desktop it runs once per tab session. `?intro=1` or the Replay intro button
plays it again. Scroll, Page Down, arrow keys, or the on-screen advance
button drives the sequence. Escape or Skip intro reveals the home immediately.
Once the character is free, the shatter, staged 404, and home handoff complete
automatically. The 404 is a story beat, not an HTTP error or a new route.

Reduced motion skips the prologue without downloading the character. Model
errors, blocked WebGL, context loss, and a 25 second loading timeout also reveal
the portfolio. Scrolling and focus are restored on exit; a background tab pauses
the animation. No sound plays automatically.

The supplied React Bits ScrollExpand is adapted to this site's existing vanilla
JavaScript architecture in `src/js/intro/ScrollExpand.js`; a React runtime is not
required. Its clipping and smoothing drive the same progress as the 3D rig.
