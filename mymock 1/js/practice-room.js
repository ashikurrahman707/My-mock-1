// ============================================================
// My-Mock — practice room engine
// Handles: TTS question reading (once, + manual repeat), camera/
// mic permissions, MediaRecorder, live speech-to-text via the
// Web Speech API (free, no key), and part-specific timers.
// ============================================================

const PART_TIMING = {
  1: { prepMs: 3000, speakMs: 60 * 1000, label: "Part 1" },
  2: { prepMs: 60 * 1000, speakMs: 2 * 60 * 1000, label: "Part 2", extraCountdownMs: 3000 },
  3: { prepMs: 3000, speakMs: 90 * 1000, label: "Part 3" },
};

class PracticeRoom {
  constructor({ onStateChange, onTimerTick, onTranscriptUpdate }) {
    this.onStateChange = onStateChange || (() => {});
    this.onTimerTick = onTimerTick || (() => {});
    this.onTranscriptUpdate = onTranscriptUpdate || (() => {});

    this.mediaStream = null;
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.recognition = null;
    this.words = []; // {word, startMs, endMs, confidence}
    this.recordingStartTime = null;
    this.lastResultTime = null;
    this.state = "idle"; // idle | prep | speaking | stopped | submitted
    this.hasReadQuestionAloud = false;
  }

  // ---------------- text-to-speech ----------------

  _pickBestVoice() {
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;
    // Prefer higher-quality, natural-sounding engines over the default
    // robotic system voice. Google/Microsoft neural-ish voices sound
    // noticeably more human than the OS default "eSpeak"-style voice.
    const preferredNames = [
      "Google US English", "Google UK English Female", "Google UK English Male",
      "Microsoft Aria Online (Natural) - English (United States)",
      "Microsoft Jenny Online (Natural) - English (United States)",
      "Samantha", "Daniel",
    ];
    for (const name of preferredNames) {
      const match = voices.find((v) => v.name === name);
      if (match) return match;
    }
    // Fall back to any English voice flagged as a network/neural voice
    // (localService === false usually means a higher-quality cloud voice).
    const networkEnglish = voices.find((v) => v.lang.startsWith("en") && v.localService === false);
    if (networkEnglish) return networkEnglish;
    return voices.find((v) => v.lang.startsWith("en")) || voices[0];
  }

  speakQuestion(text, { onEnd } = {}) {
    if (!("speechSynthesis" in window)) {
      console.warn("Speech synthesis not supported in this browser.");
      onEnd?.();
      return;
    }
    // Voice list loads asynchronously in some browsers on first use —
    // if it's not ready yet, wait for it once so we don't fall back to
    // the default robotic voice just because we asked too early.
    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.addEventListener(
        "voiceschanged",
        () => this._speakNow(text, onEnd),
        { once: true }
      );
      return;
    }
    this._speakNow(text, onEnd);
  }

  _speakNow(text, onEnd) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = this._pickBestVoice();
    if (voice) utterance.voice = voice;
    utterance.rate = 0.97;
    utterance.pitch = 1.02;
    utterance.onend = () => onEnd?.();
    window.speechSynthesis.speak(utterance);
    this.hasReadQuestionAloud = true;
  }

  repeatQuestion(text) {
    // Explicit re-trigger for the "I couldn't hear it, repeat please" option.
    this.speakQuestion(text);
  }

  // ---------------- camera / mic ----------------

  async requestMedia() {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      return { ok: true, stream: this.mediaStream };
    } catch (err) {
      // Camera might be denied/unavailable but mic could still work — try audio-only.
      try {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        return { ok: true, stream: this.mediaStream, videoUnavailable: true };
      } catch (err2) {
        return { ok: false, error: err2.message || "Microphone/camera permission denied." };
      }
    }
  }

  stopMedia() {
    this.mediaStream?.getTracks().forEach((t) => t.stop());
    this.mediaStream = null;
  }

  // ---------------- recording + live transcript ----------------

  startRecording() {
    if (!this.mediaStream) throw new Error("No media stream — call requestMedia() first.");
    this.recordedChunks = [];
    this.words = [];
    this.recordingStartTime = Date.now();
    this.lastResultTime = this.recordingStartTime;

    this.mediaRecorder = new MediaRecorder(this.mediaStream);
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.recordedChunks.push(e.data);
    };
    this.mediaRecorder.start();

    this._startRecognition();
    this.state = "speaking";
    this.onStateChange(this.state);
  }

  _startRecognition() {
    const SpeechRecognitionImpl = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionImpl) {
      console.warn("Web Speech API not supported in this browser — transcript will be empty. Try Chrome.");
      return;
    }
    this.recognition = new SpeechRecognitionImpl();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = "en-US";

    this.recognition.onresult = (event) => {
      const now = Date.now();
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result.isFinal) continue;
        const text = result[0].transcript.trim();
        const confidence = result[0].confidence || 0.7;
        const wordsInPhrase = text.split(/\s+/).filter(Boolean);
        // The Web Speech API does not expose real per-word timestamps,
        // so we approximate by evenly spreading each phrase's words
        // across the time since the previous final result. This is a
        // best-effort estimate, not precise audio analysis.
        const span = Math.max(now - this.lastResultTime, wordsInPhrase.length * 200);
        const perWord = span / Math.max(wordsInPhrase.length, 1);
        wordsInPhrase.forEach((w, idx) => {
          const startMs = (this.lastResultTime - this.recordingStartTime) + idx * perWord;
          this.words.push({ word: w, startMs, endMs: startMs + perWord, confidence });
        });
        this.lastResultTime = now;
      }
      const fullTranscript = this.words.map((w) => w.word).join(" ");
      this.onTranscriptUpdate(fullTranscript);
    };

    this.recognition.onerror = (e) => {
      console.warn("Speech recognition error:", e.error);
    };
    this.recognition.onend = () => {
      // Auto-restart if we're still supposed to be recording (the API
      // sometimes stops itself after silence).
      if (this.state === "speaking") {
        try { this.recognition.start(); } catch { /* already running */ }
      }
    };

    try { this.recognition.start(); } catch (e) { console.warn(e); }
  }

  stopRecording() {
    return new Promise((resolve) => {
      if (!this.mediaRecorder) return resolve(null);
      this.state = "stopped";
      this.onStateChange(this.state);

      try { this.recognition?.stop(); } catch {}

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.recordedChunks, { type: "audio/webm" });
        const durationMs = Date.now() - this.recordingStartTime;
        const transcript = this.words.map((w) => w.word).join(" ");
        resolve({ blob, durationMs, transcript, words: this.words });
      };
      this.mediaRecorder.stop();
    });
  }

  reset() {
    this.recordedChunks = [];
    this.words = [];
    this.state = "idle";
    this.onStateChange(this.state);
  }
}

// ---------------- timer helper ----------------

function runCountdown(totalMs, { onTick, onComplete }) {
  const startedAt = Date.now();
  const interval = setInterval(() => {
    const elapsed = Date.now() - startedAt;
    const remainingMs = Math.max(totalMs - elapsed, 0);
    onTick(remainingMs);
    if (remainingMs <= 0) {
      clearInterval(interval);
      onComplete();
    }
  }, 250);
  return () => clearInterval(interval); // cancel function
}

function formatMs(ms) {
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

window.MyMock = window.MyMock || {};
window.MyMock.PART_TIMING = PART_TIMING;
window.MyMock.PracticeRoom = PracticeRoom;
window.MyMock.runCountdown = runCountdown;
window.MyMock.formatMs = formatMs;
