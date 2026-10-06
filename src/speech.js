import { plainText } from './text.js';

export const OPENAI_VOICES = [
  'marin',
  'cedar',
  'coral',
  'alloy',
  'ash',
  'ballad',
  'echo',
  'fable',
  'nova',
  'onyx',
  'sage',
  'shimmer',
  'verse',
];
export const speechText = (text) => {
  const clean = plainText(text);
  if (clean.length <= 4000) return clean;
  const part = clean.slice(0, 4000);
  return part.slice(0, Math.max(part.lastIndexOf(' '), 3800)).trim();
};

export function systemVoices() {
  return speechSynthesis
    .getVoices()
    .slice()
    .sort(
      (a, b) => Number(/^pl/i.test(b.lang)) - Number(/^pl/i.test(a.lang)) || a.name.localeCompare(b.name)
    );
}

export function createSystemSpeech(onState = () => {}) {
  let timer,
    utterance,
    generation = 0;
  const stop = () => {
    generation++;
    clearTimeout(timer);
    speechSynthesis.cancel();
    utterance = null;
    onState('idle');
  };
  return {
    stop,
    speak(text, settings = {}) {
      stop();
      const current = generation;
      onState('loading');
      timer = setTimeout(
        () => {
          if (current !== generation) return;
          const voices = systemVoices();
          utterance = new SpeechSynthesisUtterance(speechText(text));
          utterance.voice =
            voices.find((v) => v.voiceURI === settings.systemVoice) ||
            voices.find((v) => /^pl/i.test(v.lang)) ||
            null;
          utterance.lang = utterance.voice?.lang || 'pl-PL';
          utterance.rate = settings.speechRate || 1;
          utterance.onstart = () => current === generation && onState('playing');
          utterance.onend = () => current === generation && onState('idle');
          utterance.onerror = (e) => {
            if (current === generation && !['canceled', 'interrupted'].includes(e.error))
              onState(
                'error',
                'Odczyt głosowy jest niedostępny. Wybierz inny głos albo uruchom odczyt przyciskiem w panelu.'
              );
          };
          speechSynthesis.resume();
          speechSynthesis.speak(utterance);
        },
        speechSynthesis.getVoices().length ? 0 : 250
      );
    },
  };
}
