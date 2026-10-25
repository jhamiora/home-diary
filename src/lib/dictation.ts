import { useEffect, useRef, useState } from "react";

// The phone's own speech to text, built into Chrome and Safari. No account or key.

type SpeechRec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: (e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void;
  onend: () => void;
  onerror: () => void;
};

const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;

export const dictationSupported = !!Ctor;

// Adds what was said onto the end of the existing text.
export const appendSaid = (text: string, said: string) =>
  text.trim() ? `${text.trim()} ${said}` : said.charAt(0).toUpperCase() + said.slice(1);

export function useDictation(onSaid: (said: string) => void, onError: () => void) {
  const [listening, setListening] = useState(false);
  const rec = useRef<SpeechRec | null>(null);
  const said = useRef(onSaid);
  const failed = useRef(onError);
  said.current = onSaid;
  failed.current = onError;

  useEffect(() => () => rec.current?.stop(), []);

  const stop = () => rec.current?.stop();
  const toggle = () => {
    if (listening) return stop();
    if (!Ctor) return;
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = false;
    r.lang = "en-NZ";
    r.onresult = (e) => {
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) text += e.results[i][0].transcript;
      if (text.trim()) said.current(text.trim());
    };
    r.onend = () => setListening(false);
    r.onerror = () => {
      setListening(false);
      failed.current();
    };
    rec.current = r;
    r.start();
    setListening(true);
  };
  return { listening, toggle, stop };
}
