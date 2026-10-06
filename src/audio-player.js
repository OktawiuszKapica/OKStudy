let playback;
const stop = () => {
  if (!playback) return;
  const previous = playback;
  playback = null;
  previous.audio.onended = previous.audio.onerror = null;
  previous.audio.pause();
  previous.audio.removeAttribute('src');
  previous.audio.load();
};
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || sender.tab || message.target !== 'okstudy-audio') return;
  if (message.type === 'stop') {
    if (
      (!message.id || playback?.id === message.id) &&
      (message.tabId === undefined || playback?.tabId === message.tabId)
    )
      stop();
    respond({ ok: true });
    return;
  }
  if (message.type !== 'play') return;
  (async () => {
    if (
      !/^data:audio\/mpeg;base64,[A-Za-z0-9+/=]+$/.test(message.audio || '') ||
      message.audio.length > 12000000
    )
      throw new Error('Nieprawidłowe nagranie.');
    stop();
    const audio = new Audio(message.audio);
    const item = { id: message.id, tabId: message.tabId, audio };
    playback = item;
    const finish = (error) => {
      if (playback !== item) return;
      stop();
      void chrome.runtime.sendMessage({ type: 'speech.finished', id: message.id, error }).catch(() => {});
    };
    audio.onended = () => finish();
    audio.onerror = () => finish('Nie udało się odtworzyć nagrania OpenAI.');
    try {
      await audio.play();
    } catch {
      if (playback === item) stop();
      throw new Error('Przeglądarka nie zezwoliła na odczyt. Uruchom go przyciskiem w panelu OKStudy.');
    }
    return { ok: true };
  })()
    .then(respond)
    .catch((error) => respond({ ok: false, error: error.message }));
  return true;
});
