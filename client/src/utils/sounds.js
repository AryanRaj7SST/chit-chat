let audio;
export async function playTone(tone = "bell") {
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    audio ||= new Audio(); await audio.resume();
    if (audio.state !== "running") return;
    const notes = tone === "chime" ? [660, 880] : tone === "soft" ? [440] : [784];
    notes.forEach((frequency, index) => {
      const oscillator = audio.createOscillator(), gain = audio.createGain(), at = audio.currentTime + index * .12;
      oscillator.type = "sine"; oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(.06, at + .015); gain.gain.exponentialRampToValueAtTime(.0001, at + .18);
      oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(at); oscillator.stop(at + .2);
    });
  } catch { /* Autoplay restrictions never interrupt chat. */ }
}
