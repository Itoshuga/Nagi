'use client';

import { useEffect, useState } from 'react';

const preferenceKey = 'nagi:space-sounds';
let context: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;
let lastHover = -Infinity;

function audioContext() {
  if (!enabled || typeof window === 'undefined') return null;
  try {
    if (!context || context.state === 'closed') {
      const Audio =
        window.AudioContext ??
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Audio) return null;
      context = new Audio({ latencyHint: 'interactive' });
      master = context.createGain();
      master.gain.value = 0.8;
      master.connect(context.destination);
      lastHover = -Infinity;
    }
    return context;
  } catch {
    return null;
  }
}

function setEnabled(value: boolean) {
  enabled = value;
  if (context && master && context.state !== 'closed') {
    master.gain.cancelScheduledValues(context.currentTime);
    master.gain.setTargetAtTime(value ? 0.8 : 0, context.currentTime, 0.012);
  }
}

function unlock() {
  const audio = audioContext();
  if (audio?.state === 'suspended') void audio.resume().catch(() => {});
}

function note(
  audio: AudioContext,
  frequency: number,
  end: number,
  time: number,
  duration: number,
  volume: number,
) {
  if (!master) return;
  const oscillator = audio.createOscillator();
  const envelope = audio.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, time);
  oscillator.frequency.exponentialRampToValueAtTime(end, time + duration);
  envelope.gain.setValueAtTime(0, time);
  envelope.gain.linearRampToValueAtTime(volume, time + 0.015);
  envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  envelope.gain.linearRampToValueAtTime(0, time + duration + 0.018);
  oscillator.connect(envelope);
  envelope.connect(master);
  oscillator.onended = () => {
    oscillator.disconnect();
    envelope.disconnect();
  };
  oscillator.start(time);
  oscillator.stop(time + duration + 0.025);
}

function hover() {
  // A hover never creates or queues a locked context before a real user gesture.
  if (!enabled || !context || context.state !== 'running' || context.currentTime - lastHover < 0.12)
    return;
  lastHover = context.currentTime;
  note(context, 440, 493.88, context.currentTime + 0.004, 0.09, 0.018);
}

function select() {
  const audio = audioContext();
  if (!audio) return;
  const play = () => {
    if (!enabled || audio.state !== 'running') return;
    const time = audio.currentTime + 0.004;
    note(audio, 523.25, 523.25, time, 0.14, 0.032);
    note(audio, 659.25, 659.25, time + 0.045, 0.19, 0.024);
  };
  if (audio.state === 'running') play();
  else
    void audio
      .resume()
      .then(play)
      .catch(() => {});
}

export function useSpaceSounds() {
  const [soundEnabled, setSoundEnabled] = useState(true);
  useEffect(() => {
    function restore() {
      let value = true;
      try {
        value = window.localStorage.getItem(preferenceKey) !== 'off';
      } catch {
        /* Optional browser storage. */
      }
      setEnabled(value);
      setSoundEnabled(value);
    }
    const frame = requestAnimationFrame(restore);
    document.addEventListener('pointerdown', unlock, { capture: true, passive: true });
    document.addEventListener('keydown', unlock, true);
    window.addEventListener('storage', restore);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', unlock, true);
      document.removeEventListener('keydown', unlock, true);
      window.removeEventListener('storage', restore);
    };
  }, []);

  function toggle() {
    const value = !soundEnabled;
    setEnabled(value);
    setSoundEnabled(value);
    try {
      window.localStorage.setItem(preferenceKey, value ? 'on' : 'off');
    } catch {
      /* Keep the in-memory choice. */
    }
    if (value) unlock();
  }
  return { enabled: soundEnabled, toggle, hover, select };
}
