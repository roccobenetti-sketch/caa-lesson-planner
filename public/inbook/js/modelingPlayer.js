/**
 * Motore di Lettura Condivisa (Modeling) per IN-Book.
 * Gestisce l'indicazione sequenziale dei box simbolici (pointing visivo con cursore 👆)
 * e la sintesi vocale in lingua italiana (Web Speech API).
 */

import { StateStore } from './stateStore.js';

export const ModelingPlayer = {
  activeSessionId: 0,

  stop() {
    this.activeSessionId++;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    StateStore.state.modeling.isPlaying = false;
    StateStore.state.modeling.activeSentenceIndex = -1;
    StateStore.state.modeling.activeTokenIndex = -1;
    StateStore.notify('modeling_stopped');
  },

  /**
   * Pronuncia e indica un singolo box simbolico (quando l'utente clicca in modalità Modeling).
   */
  speakSingleToken(pageIndex, sentenceIndex, tokenIndex) {
    this.stop();
    const token = StateStore.getToken(pageIndex, sentenceIndex, tokenIndex);
    if (!token) return;

    StateStore.state.modeling.isPlaying = true;
    StateStore.state.modeling.activePageIndex = pageIndex;
    StateStore.state.modeling.activeSentenceIndex = sentenceIndex;
    StateStore.state.modeling.activeTokenIndex = tokenIndex;
    StateStore.notify('modeling_step');

    this.utterText(token.label, () => {
      StateStore.state.modeling.isPlaying = false;
      StateStore.notify('modeling_stopped');
    });
  },

  /**
   * Avvia il Modeling sequenziale (parola per parola / box per box) di una frase o di un'intera pagina.
   */
  async playSequence(pageIndex, targetSentenceIndex = null) {
    this.stop();
    const sessionId = ++this.activeSessionId;
    const page = StateStore.state.currentBook.pages[pageIndex];
    if (!page) return;

    const sentencesToPlay =
      targetSentenceIndex !== null
        ? [{ sIdx: targetSentenceIndex, sentence: page.sentences[targetSentenceIndex] }]
        : page.sentences.map((sentence, sIdx) => ({ sIdx, sentence }));

    StateStore.state.modeling.isPlaying = true;
    StateStore.state.modeling.activePageIndex = pageIndex;

    for (const item of sentencesToPlay) {
      if (sessionId !== this.activeSessionId || !item.sentence) break;
      const tokens = item.sentence.tokens || [];

      for (let tIdx = 0; tIdx < tokens.length; tIdx++) {
        if (sessionId !== this.activeSessionId) break;
        const token = tokens[tIdx];

        StateStore.state.modeling.activeSentenceIndex = item.sIdx;
        StateStore.state.modeling.activeTokenIndex = tIdx;
        StateStore.notify('modeling_step');

        await new Promise(resolve => {
          this.utterText(token.label, resolve);
        });
      }
    }

    if (sessionId === this.activeSessionId) {
      StateStore.state.modeling.isPlaying = false;
      StateStore.state.modeling.activeSentenceIndex = -1;
      StateStore.state.modeling.activeTokenIndex = -1;
      StateStore.notify('modeling_finished');
    }
  },

  utterText(text, onEndCallback) {
    if (!('speechSynthesis' in window)) {
      setTimeout(onEndCallback, 550);
      return;
    }

    window.speechSynthesis.cancel();
    const cleanSpeech = String(text || '').toLowerCase();
    const utterance = new SpeechSynthesisUtterance(cleanSpeech);
    utterance.lang = 'it-IT';
    utterance.rate = StateStore.state.modeling.speechRate || 0.88;

    const voices = window.speechSynthesis.getVoices();
    const itVoice = voices.find(v => v.lang.startsWith('it'));
    if (itVoice) {
      utterance.voice = itVoice;
    }

    let settled = false;
    const finish = () => {
      if (!settled) {
        settled = true;
        onEndCallback();
      }
    };

    utterance.onend = finish;
    utterance.onerror = finish;
    window.speechSynthesis.speak(utterance);

    // Salvaguardia non bloccante nel caso il browser non emetta onend
    setTimeout(finish, Math.max(1400, cleanSpeech.length * 160));
  }
};
