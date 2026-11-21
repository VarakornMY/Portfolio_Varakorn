let audio;
let startupPending = false;
let muted = false;
try {
  muted = localStorage.getItem('vk-xp-muted') === 'yes';
} catch {}

const cues = {
  boot: [
    [392, 0, 0.2],
    [494, 0.1, 0.22],
    [587, 0.2, 0.28],
    [784, 0.32, 0.4],
  ],
  select: [[700, 0, 0.042]],
  open: [
    [523, 0, 0.075],
    [698, 0.055, 0.1],
  ],
  close: [
    [494, 0, 0.06],
    [392, 0.04, 0.07],
  ],
};
export function play(name) {
  if (muted || !audio || audio.state !== 'running') return;
  const handheld = matchMedia('(max-width:700px), (hover:none) and (max-height:540px)').matches;
  for (const [frequency, offset, length] of cues[name] || []) {
    const oscillator = audio.createOscillator();
    const level = audio.createGain();
    const start = audio.currentTime + offset;
    oscillator.frequency.value = frequency;
    oscillator.type = handheld ? 'square' : 'sine';
    level.gain.setValueAtTime(0.0001, start);
    level.gain.exponentialRampToValueAtTime(handheld ? 0.023 : 0.08, start + 0.012);
    level.gain.exponentialRampToValueAtTime(0.0001, start + length);
    oscillator.connect(level).connect(audio.destination);
    oscillator.start(start);
    oscillator.stop(start + length + 0.02);
  }
}
export function queueStartupSound() {
  if (muted) return;
  if (audio?.state === 'running') play('boot');
  else startupPending = true;
}
export function enableAudio() {
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio || muted) return;
  audio ||= new Audio();
  const welcome = () => {
    if (startupPending && audio.state === 'running') {
      startupPending = false;
      play('boot');
    }
  };
  if (audio.state === 'suspended')
    audio
      .resume()
      .then(welcome)
      .catch(() => {});
  else welcome();
}
export function toggleSound() {
  muted = !muted;
  try {
    localStorage.setItem('vk-xp-muted', muted ? 'yes' : 'no');
  } catch {}
  if (!muted) {
    enableAudio();
    play('select');
  }
  renderSound();
}
export function renderSound() {
  for (const button of document.querySelectorAll('[data-sound]')) {
    button.setAttribute('aria-pressed', String(!muted));
    button.title = button.ariaLabel = muted ? 'Enable sound' : 'Mute sound';
    button.innerHTML = '<img alt="" src="/retro/icons/sound-' + (muted ? 'off' : 'on') + '.png">';
  }
}
