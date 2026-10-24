/**
 * CaseBoard AI - Live Interview Simulator
 * Plays audio-visual transcript simulation line-by-line every 2-3 seconds,
 * triggering real-time fact extraction and live contradiction cards.
 */

class LiveInterviewPlayer {
  constructor(app) {
    this.app = app;
    this.chunks = [];
    this.currentIndex = 0;
    this.isPlaying = false;
    this.timer = null;
    this.intervalMs = 2500; // 2.5 seconds per line

    // Web Audio Synthesizer for subtle investigation room UI audio
    this.audioCtx = null;
  }

  initAudio() {
    if (!this.audioCtx && (window.AudioContext || window.webkitAudioContext)) {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
  }

  playSubtleChime(freq = 660, type = 'sine', duration = 0.15) {
    try {
      this.initAudio();
      if (!this.audioCtx) return;
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
      gain.gain.setValueAtTime(0.08, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + duration);
    } catch (e) {
      // Audio autoplay policy fallback
    }
  }

  playAlertSound() {
    this.playSubtleChime(440, 'triangle', 0.12);
    setTimeout(() => this.playSubtleChime(330, 'triangle', 0.25), 140);
  }

  async loadChunks() {
    try {
      const res = await fetch(this.app.getApiUrl('/api/live-chunks'));
      if (!res.ok) throw new Error('API unavailable');
      const data = await res.json();
      this.chunks = data.chunks || [];
      this.updateUI();
    } catch (e) {
      this.chunks = [
        {
          index: 1,
          speaker: "Sara (Night Guard)",
          timestamp: "20:00 Shift Start",
          text: "I was stationed at the south gate starting 8:00 PM."
        },
        {
          index: 2,
          speaker: "Sara (Night Guard)",
          timestamp: "Gate Surveillance",
          text: "The gate camera was working perfectly throughout my entire shift."
        },
        {
          index: 3,
          speaker: "Sara (Night Guard)",
          timestamp: "22:30 Sighting",
          text: "Around 10:30 PM, I looked outside towards the west parking bay and saw Ali's silver Honda Civic parked outside near the loading dock. I recognized the license plate."
        }
      ];
      this.updateUI();
    }
  }

  async start() {
    if (this.chunks.length === 0) await this.loadChunks();
    if (this.currentIndex >= this.chunks.length) {
      this.currentIndex = 0;
      const feed = document.getElementById('live-transcript-feed');
      if (feed) feed.innerHTML = '';
    }
    this.isPlaying = true;
    this.updateControls();
    this.scheduleNext();
  }

  pause() {
    this.isPlaying = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.updateControls();
  }

  reset() {
    this.pause();
    this.currentIndex = 0;
    this.updateUI();
    const liveTranscriptEl = document.getElementById('live-transcript-feed');
    if (liveTranscriptEl) liveTranscriptEl.innerHTML = '';
  }

  scheduleNext() {
    if (!this.isPlaying) return;
    this.timer = setTimeout(async () => {
      await this.stepForward();
      if (this.currentIndex < this.chunks.length && this.isPlaying) {
        this.scheduleNext();
      } else {
        this.pause();
      }
    }, this.intervalMs);
  }

  async stepForward() {
    if (this.currentIndex >= this.chunks.length) return;
    const chunk = this.chunks[this.currentIndex];
    this.currentIndex++;
    this.playSubtleChime(800, 'sine', 0.08);

    // Display line in the live transcript box
    this.appendLiveLine(chunk);

    // Send chunk to backend or simulate locally
    try {
      const res = await fetch(this.app.getApiUrl('/api/intake-chunk'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk)
      });
      if (!res.ok) throw new Error('API failed');
      const result = await res.json();

      if (result.new_contradictions && result.new_contradictions.length > 0) {
        this.playAlertSound();
      }

      await this.app.fetchCaseData();
    } catch (e) {
      // In offline / client-only mode, simulate intake
      this.app.simulateLiveChunk(chunk);
    }

    this.updateUI();
  }

  appendLiveLine(chunk) {
    const feed = document.getElementById('live-transcript-feed');
    if (!feed) return;

    const line = document.createElement('div');
    line.className = 'p-3 rounded border border-gray-800 bg-gray-900/80 mb-2 transition-all transform duration-300';
    line.innerHTML = `
      <div class="flex items-center justify-between text-xs text-blue-400 mb-1 font-mono">
        <span class="font-semibold flex items-center gap-1.5">
          <span class="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
          ${chunk.speaker}
        </span>
        <span class="text-gray-500">${chunk.timestamp}</span>
      </div>
      <p class="text-sm text-gray-200 pl-3 border-l-2 border-blue-500/40">"${chunk.text}"</p>
    `;
    feed.appendChild(line);
    feed.scrollTop = feed.scrollHeight;
  }

  updateControls() {
    const btnPlay = document.getElementById('btn-play-interview');
    const waveEl = document.getElementById('interview-wave-indicator');
    if (btnPlay) {
      btnPlay.innerHTML = this.isPlaying
        ? '<svg class="w-4 h-4 inline mr-1" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"></path></svg> Pause Live'
        : '<svg class="w-4 h-4 inline mr-1" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"></path></svg> Play Live Interview';
      btnPlay.className = this.isPlaying
        ? 'px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-medium flex items-center transition shadow-sm'
        : 'px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium flex items-center transition shadow-sm';
    }
    if (waveEl) {
      waveEl.style.display = this.isPlaying ? 'flex' : 'none';
    }
  }

  updateUI() {
    const progressEl = document.getElementById('interview-progress');
    const countEl = document.getElementById('interview-chunk-count');
    if (countEl) {
      countEl.innerText = `${this.currentIndex} / ${this.chunks.length} lines`;
    }
    if (progressEl) {
      const pct = this.chunks.length > 0 ? (this.currentIndex / this.chunks.length) * 100 : 0;
      progressEl.style.width = `${pct}%`;
    }
  }
}
