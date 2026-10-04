(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  const STORAGE_SETTINGS = "zzx-4-4-settings-v1";
  const STORAGE_STATS = "zzx-4-4-stats-v1";

  const DEFAULTS = Object.freeze({
    inhale: 4,
    hold1: 4,
    exhale: 4,
    hold2: 4,
    cycles: 4,
    scale: 0.55,
    audio: true,
    haptics: true,
    voice: false,
    wakeLock: true
  });

  const state = {
    settings: { ...DEFAULTS },
    status: "idle",
    phaseIndex: 0,
    cycle: 0,
    phaseStartedAt: 0,
    phaseElapsedBeforePause: 0,
    sessionStartedAt: 0,
    pausedSessionElapsed: 0,
    raf: 0,
    audioContext: null,
    wakeLock: null,
    stats: {
      completedSessions: 0,
      completedCycles: 0,
      totalSeconds: 0,
      lastCompleted: null
    }
  };

  const PHASES = [
    { key: "inhale", label: "INHALE", hint: "Breathe in", className: "phase-inhale" },
    { key: "hold1", label: "HOLD", hint: "Hold full", className: "phase-hold" },
    { key: "exhale", label: "EXHALE", hint: "Breathe out", className: "phase-exhale" },
    { key: "hold2", label: "HOLD", hint: "Hold empty", className: "phase-hold" }
  ];

  function safeParse(value, fallback) {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? parsed : fallback;
    } catch {
      return fallback;
    }
  }

  function loadLocalState() {
    const storedSettings = safeParse(localStorage.getItem(STORAGE_SETTINGS), {});
    state.settings = sanitizeSettings({ ...DEFAULTS, ...storedSettings });

    const storedStats = safeParse(localStorage.getItem(STORAGE_STATS), {});
    state.stats = {
      completedSessions: Math.max(0, Number(storedStats.completedSessions) || 0),
      completedCycles: Math.max(0, Number(storedStats.completedCycles) || 0),
      totalSeconds: Math.max(0, Number(storedStats.totalSeconds) || 0),
      lastCompleted: storedStats.lastCompleted || null
    };
  }

  function saveSettings() {
    localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(state.settings));
  }

  function saveStats() {
    localStorage.setItem(STORAGE_STATS, JSON.stringify(state.stats));
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function sanitizeSettings(raw) {
    return {
      inhale: clamp(Number(raw.inhale) || 4, 1, 60),
      hold1: clamp(Number(raw.hold1) || 0, 0, 60),
      exhale: clamp(Number(raw.exhale) || 4, 1, 60),
      hold2: clamp(Number(raw.hold2) || 0, 0, 60),
      cycles: Math.round(clamp(Number(raw.cycles) || 4, 1, 100)),
      scale: clamp(Number(raw.scale) || 0.55, 0.35, 0.8),
      audio: Boolean(raw.audio),
      haptics: Boolean(raw.haptics),
      voice: Boolean(raw.voice),
      wakeLock: Boolean(raw.wakeLock)
    };
  }

  function phaseDuration(index) {
    return Number(state.settings[PHASES[index].key]) || 0;
  }

  function cycleDuration() {
    return PHASES.reduce((sum, _, index) => sum + phaseDuration(index), 0);
  }

  function sessionDuration() {
    return cycleDuration() * state.settings.cycles;
  }

  function protocolName() {
    const s = state.settings;
    return `${s.inhale}-${s.hold1}-${s.exhale}-${s.hold2}`;
  }

  function formatClock(seconds, includeHours = false) {
    const total = Math.max(0, Math.round(seconds));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;

    if (includeHours || h > 0) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }

    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function currentPhaseElapsed(now = performance.now()) {
    if (state.status === "paused") return state.phaseElapsedBeforePause;
    if (state.status !== "running") return 0;
    return state.phaseElapsedBeforePause + (now - state.phaseStartedAt) / 1000;
  }

  function totalElapsed(now = performance.now()) {
    if (state.status === "idle") return 0;
    if (state.status === "complete") return sessionDuration();

    const completedCycles = state.cycle;
    const completedPhaseSeconds = PHASES
      .slice(0, state.phaseIndex)
      .reduce((sum, _, index) => sum + phaseDuration(index), 0);

    return clamp(
      completedCycles * cycleDuration() +
      completedPhaseSeconds +
      currentPhaseElapsed(now),
      0,
      sessionDuration()
    );
  }

  async function ensureAudioContext() {
    if (!state.audioContext) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      state.audioContext = new Ctx();
    }

    if (state.audioContext.state === "suspended") {
      try { await state.audioContext.resume(); } catch {}
    }

    return state.audioContext;
  }

  async function tone(frequency = 440, duration = 0.09, gainValue = 0.06) {
    if (!state.settings.audio) return;

    const ctx = await ensureAudioContext();
    if (!ctx) return;

    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = frequency;

    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(gainValue, ctx.currentTime + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    oscillator.start();
    oscillator.stop(ctx.currentTime + duration + 0.02);
  }

  function vibrate(pattern) {
    if (!state.settings.haptics || !navigator.vibrate) return;
    try { navigator.vibrate(pattern); } catch {}
  }

  function speak(text) {
    if (!state.settings.voice || !("speechSynthesis" in window)) return;

    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.volume = 0.55;
    speechSynthesis.speak(utterance);
  }

  async function cuePhase(index) {
    const phase = PHASES[index];

    const frequencies = [520, 660, 390, 610];
    tone(frequencies[index], 0.105, 0.055).catch(() => {});

    const hapticPatterns = [
      [40],
      [22, 28, 22],
      [70],
      [22, 28, 22]
    ];

    vibrate(hapticPatterns[index]);
    speak(phase.label.toLowerCase());

    window.ZZXHooks?.emit("4-4:phase", {
      index,
      phase: phase.key,
      label: phase.label,
      cycle: state.cycle + 1,
      duration: phaseDuration(index)
    });
  }

  async function acquireWakeLock() {
    if (!state.settings.wakeLock || !navigator.wakeLock?.request) return;
    if (state.wakeLock) return;

    try {
      state.wakeLock = await navigator.wakeLock.request("screen");
      state.wakeLock.addEventListener("release", () => {
        state.wakeLock = null;
      });
    } catch {}
  }

  async function releaseWakeLock() {
    if (!state.wakeLock) return;
    try { await state.wakeLock.release(); } catch {}
    state.wakeLock = null;
  }

  function updateRuntimeStatus() {
    const audio = $("status-audio");
    const haptics = $("status-haptics");
    const fullscreen = $("status-fullscreen");

    const hasAudio = Boolean(window.AudioContext || window.webkitAudioContext);
    audio.textContent = `AUDIO: ${hasAudio ? "YES" : "NO"}`;
    audio.className = `runtime-badge ${hasAudio ? "ok" : "no"}`;

    const hasHaptics = Boolean(navigator.vibrate);
    haptics.textContent = `HAPTICS: ${hasHaptics ? "YES" : "NO"}`;
    haptics.className = `runtime-badge ${hasHaptics ? "ok" : "partial"}`;

    const hasFullscreen = Boolean(document.documentElement.requestFullscreen);
    fullscreen.textContent = `FULLSCREEN: ${hasFullscreen ? "YES" : "NO"}`;
    fullscreen.className = `runtime-badge ${hasFullscreen ? "ok" : "partial"}`;
  }

  function syncSettingsForm() {
    const s = state.settings;

    $("setting-inhale").value = String(s.inhale);
    $("setting-hold1").value = String(s.hold1);
    $("setting-exhale").value = String(s.exhale);
    $("setting-hold2").value = String(s.hold2);
    $("setting-cycles").value = String(s.cycles);
    $("setting-scale").value = String(s.scale);

    $("setting-audio").checked = s.audio;
    $("setting-haptics").checked = s.haptics;
    $("setting-voice").checked = s.voice;
    $("setting-wakelock").checked = s.wakeLock;
  }

  function readSettingsForm() {
    return sanitizeSettings({
      inhale: $("setting-inhale").value,
      hold1: $("setting-hold1").value,
      exhale: $("setting-exhale").value,
      hold2: $("setting-hold2").value,
      cycles: $("setting-cycles").value,
      scale: $("setting-scale").value,
      audio: $("setting-audio").checked,
      haptics: $("setting-haptics").checked,
      voice: $("setting-voice").checked,
      wakeLock: $("setting-wakelock").checked
    });
  }

  function updateStaticDisplay() {
    const s = state.settings;

    $("display-inhale").textContent = `${s.inhale}s`;
    $("display-hold1").textContent = `${s.hold1}s`;
    $("display-exhale").textContent = `${s.exhale}s`;
    $("display-hold2").textContent = `${s.hold2}s`;
    $("cycle-total").textContent = String(s.cycles);

    $("stat-protocol").textContent = protocolName();
    $("stat-duration").textContent = formatClock(sessionDuration());

    $("cue-audio").textContent = s.audio ? "AUDIO ON" : "AUDIO OFF";
    $("cue-haptics").textContent = s.haptics ? "HAPTICS ON" : "HAPTICS OFF";

    updateStatsDisplay();
    updateIdleDisplay();
  }

  function updateIdleDisplay() {
    if (state.status !== "idle") return;

    $("phase-label").textContent = "READY";
    $("phase-countdown").textContent = state.settings.inhale.toFixed(1);
    $("phase-hint").textContent = "Press START";
    $("cycle-current").textContent = "0";
    $("elapsed-time").textContent = "00:00";
    $("remaining-time").textContent = formatClock(sessionDuration());
    $("session-progress").style.width = "0%";
    $("cue-breath").textContent = "READY";

    const ring = $("breath-ring");
    ring.className = "four-ring";
    ring.style.transform = `scale(${state.settings.scale})`;
    ring.style.transitionDuration = "0s";

    $("start-pause").textContent = "START";
  }

  function updateStatsDisplay() {
    $("stat-sessions").textContent = String(state.stats.completedSessions);
    $("stat-cycles").textContent = String(state.stats.completedCycles);
    $("stat-time").textContent = formatClock(state.stats.totalSeconds, true);
    $("stat-last").textContent = state.stats.lastCompleted
      ? new Date(state.stats.lastCompleted).toLocaleString()
      : "—";

    $("stats-output").textContent = JSON.stringify({
      protocol: protocolName(),
      currentSessionSeconds: sessionDuration(),
      ...state.stats
    }, null, 2);
  }

  function setRingForPhase(index, remainingSeconds) {
    const phase = PHASES[index];
    const ring = $("breath-ring");
    const duration = phaseDuration(index);

    ring.className = `four-ring ${phase.className}`;

    if (phase.key === "inhale") {
      ring.style.transitionDuration = `${Math.max(0, remainingSeconds)}s`;
      ring.style.transform = "scale(1)";
    } else if (phase.key === "exhale") {
      ring.style.transitionDuration = `${Math.max(0, remainingSeconds)}s`;
      ring.style.transform = `scale(${state.settings.scale})`;
    } else {
      ring.style.transitionDuration = "0.15s";
    }
  }

  function render(now = performance.now()) {
    if (state.status !== "running" && state.status !== "paused") return;

    const phase = PHASES[state.phaseIndex];
    const duration = phaseDuration(state.phaseIndex);
    const elapsed = currentPhaseElapsed(now);
    const remaining = Math.max(0, duration - elapsed);

    $("phase-label").textContent = phase.label;
    $("phase-countdown").textContent = remaining.toFixed(1);
    $("phase-hint").textContent = phase.hint;
    $("cue-breath").textContent = phase.label;
    $("cycle-current").textContent = String(Math.min(state.cycle + 1, state.settings.cycles));

    const elapsedTotal = totalElapsed(now);
    $("elapsed-time").textContent = formatClock(elapsedTotal);
    $("remaining-time").textContent = formatClock(sessionDuration() - elapsedTotal);
    $("session-progress").style.width = `${sessionDuration() ? (elapsedTotal / sessionDuration()) * 100 : 0}%`;

    if (state.status === "running" && elapsed >= duration) {
      advancePhase();
      return;
    }

    if (state.status === "running") {
      state.raf = requestAnimationFrame(render);
    }
  }

  function skipZeroLengthPhases() {
    let guard = 0;

    while (phaseDuration(state.phaseIndex) <= 0 && guard < PHASES.length + 2) {
      guard++;
      state.phaseIndex++;

      if (state.phaseIndex >= PHASES.length) {
        state.phaseIndex = 0;
        state.cycle++;

        if (state.cycle >= state.settings.cycles) {
          completeSession();
          return false;
        }
      }
    }

    return true;
  }

  function beginCurrentPhase() {
    if (!skipZeroLengthPhases()) return;

    state.phaseElapsedBeforePause = 0;
    state.phaseStartedAt = performance.now();

    cuePhase(state.phaseIndex).catch(() => {});
    setRingForPhase(state.phaseIndex, phaseDuration(state.phaseIndex));
    cancelAnimationFrame(state.raf);
    state.raf = requestAnimationFrame(render);
  }

  function advancePhase() {
    cancelAnimationFrame(state.raf);
    state.phaseIndex++;

    if (state.phaseIndex >= PHASES.length) {
      state.phaseIndex = 0;
      state.cycle++;

      if (state.cycle >= state.settings.cycles) {
        completeSession();
        return;
      }
    }

    beginCurrentPhase();
  }

  async function startSession() {
    if (state.status === "running") {
      pauseSession();
      return;
    }

    if (state.status === "paused") {
      resumeSession();
      return;
    }

    state.status = "running";
    state.phaseIndex = 0;
    state.cycle = 0;
    state.phaseElapsedBeforePause = 0;
    state.phaseStartedAt = performance.now();
    state.sessionStartedAt = Date.now();

    $("start-pause").textContent = "PAUSE";

    await ensureAudioContext();
    await acquireWakeLock();

    window.ZZXHooks?.emit("4-4:start", {
      protocol: protocolName(),
      cycles: state.settings.cycles,
      seconds: sessionDuration()
    });

    beginCurrentPhase();
  }

  function pauseSession() {
    if (state.status !== "running") return;

    state.phaseElapsedBeforePause = currentPhaseElapsed(performance.now());
    state.status = "paused";
    cancelAnimationFrame(state.raf);

    $("start-pause").textContent = "RESUME";
    $("phase-hint").textContent = "Paused";

    const ring = $("breath-ring");
    const style = getComputedStyle(ring);
    const transform = style.transform;
    ring.style.transitionDuration = "0s";
    ring.style.transform = transform === "none" ? ring.style.transform : transform;

    window.ZZXHooks?.emit("4-4:pause", {
      phase: PHASES[state.phaseIndex].key,
      cycle: state.cycle + 1
    });
  }

  async function resumeSession() {
    if (state.status !== "paused") return;

    state.status = "running";
    state.phaseStartedAt = performance.now();
    $("start-pause").textContent = "PAUSE";
    $("phase-hint").textContent = PHASES[state.phaseIndex].hint;

    await acquireWakeLock();

    const remaining = Math.max(
      0,
      phaseDuration(state.phaseIndex) - state.phaseElapsedBeforePause
    );

    setRingForPhase(state.phaseIndex, remaining);
    cancelAnimationFrame(state.raf);
    state.raf = requestAnimationFrame(render);

    window.ZZXHooks?.emit("4-4:resume", {
      phase: PHASES[state.phaseIndex].key,
      cycle: state.cycle + 1
    });
  }

  function resetSession() {
    cancelAnimationFrame(state.raf);
    state.status = "idle";
    state.phaseIndex = 0;
    state.cycle = 0;
    state.phaseElapsedBeforePause = 0;
    state.sessionStartedAt = 0;

    if ("speechSynthesis" in window) speechSynthesis.cancel();
    if (navigator.vibrate) navigator.vibrate(0);

    releaseWakeLock().catch(() => {});
    updateIdleDisplay();

    window.ZZXHooks?.emit("4-4:reset", {});
  }

  function completeSession() {
    cancelAnimationFrame(state.raf);
    state.status = "complete";

    const seconds = sessionDuration();
    state.stats.completedSessions++;
    state.stats.completedCycles += state.settings.cycles;
    state.stats.totalSeconds += seconds;
    state.stats.lastCompleted = new Date().toISOString();
    saveStats();

    $("phase-label").textContent = "COMPLETE";
    $("phase-countdown").textContent = "✓";
    $("phase-hint").textContent = "Session finished";
    $("cycle-current").textContent = String(state.settings.cycles);
    $("elapsed-time").textContent = formatClock(seconds);
    $("remaining-time").textContent = "00:00";
    $("session-progress").style.width = "100%";
    $("cue-breath").textContent = "COMPLETE";
    $("start-pause").textContent = "START AGAIN";

    const ring = $("breath-ring");
    ring.className = "four-ring";
    ring.style.transitionDuration = ".5s";
    ring.style.transform = "scale(0.7)";

    tone(784, 0.16, 0.07).catch(() => {});
    setTimeout(() => tone(988, 0.18, 0.06).catch(() => {}), 180);
    vibrate([80, 80, 80]);
    speak("Complete");
    releaseWakeLock().catch(() => {});
    updateStatsDisplay();

    window.ZZXHooks?.emit("4-4:complete", {
      protocol: protocolName(),
      cycles: state.settings.cycles,
      seconds
    });
  }

  function applySettings(settings) {
    const wasActive = state.status === "running" || state.status === "paused";
    if (wasActive) resetSession();

    state.settings = sanitizeSettings(settings);
    saveSettings();
    syncSettingsForm();
    updateStaticDisplay();

    $("settings-output").textContent = JSON.stringify({
      saved: true,
      protocol: protocolName(),
      cycleSeconds: cycleDuration(),
      sessionSeconds: sessionDuration(),
      settings: state.settings
    }, null, 2);

    window.ZZXHooks?.emit("4-4:settings", { ...state.settings });
  }

  function applyBoxPreset() {
    applySettings({
      ...state.settings,
      inhale: 4,
      hold1: 4,
      exhale: 4,
      hold2: 4
    });
  }

  function apply478Preset() {
    applySettings({
      ...state.settings,
      inhale: 4,
      hold1: 7,
      exhale: 8,
      hold2: 0
    });
  }

  function resetDefaults() {
    applySettings({ ...DEFAULTS });
  }

  async function toggleFullscreen() {
    const stage = $("four-stage");

    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    if (stage.requestFullscreen) {
      await stage.requestFullscreen();
    }
  }

  function toggleMute() {
    state.settings.audio = !state.settings.audio;
    saveSettings();
    syncSettingsForm();
    updateStaticDisplay();
  }

  function downloadJson(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json"
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportStats() {
    downloadJson({
      project: "4⁴",
      version: "1.0.0-web",
      exportedAt: new Date().toISOString(),
      protocol: protocolName(),
      settings: state.settings,
      statistics: state.stats
    }, `4-4-stats-${Date.now()}.json`);
  }

  function clearStats() {
    state.stats = {
      completedSessions: 0,
      completedCycles: 0,
      totalSeconds: 0,
      lastCompleted: null
    };

    saveStats();
    updateStatsDisplay();
  }

  function bind(id, event, handler) {
    const element = $(id);
    if (!element) return;

    element.addEventListener(event, async (evt) => {
      try {
        await handler(evt);
      } catch (error) {
        console.error(error);
      }
    });
  }

  function bindEvents() {
    bind("start-pause", "click", startSession);
    bind("reset-session", "click", resetSession);
    bind("fullscreen-session", "click", toggleFullscreen);

    bind("apply-settings", "click", () => applySettings(readSettingsForm()));
    bind("preset-box", "click", applyBoxPreset);
    bind("preset-relax", "click", apply478Preset);
    bind("clear-settings", "click", resetDefaults);

    bind("export-stats", "click", exportStats);
    bind("clear-stats", "click", clearStats);

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" &&
          state.status === "running" &&
          state.settings.wakeLock) {
        acquireWakeLock().catch(() => {});
      }
    });

    document.addEventListener("keydown", (event) => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;

      if (event.code === "Space") {
        event.preventDefault();
        startSession().catch(() => {});
      } else if (event.key.toLowerCase() === "r") {
        resetSession();
      } else if (event.key.toLowerCase() === "f") {
        toggleFullscreen().catch(() => {});
      } else if (event.key.toLowerCase() === "m") {
        toggleMute();
      }
    });

    window.addEventListener("beforeunload", () => {
      cancelAnimationFrame(state.raf);
      if (state.wakeLock) {
        try { state.wakeLock.release(); } catch {}
      }
    });
  }

  function exposeApi() {
    window.FourFour = Object.freeze({
      version: "1.0.0-web",
      start: startSession,
      pause: pauseSession,
      resume: resumeSession,
      reset: resetSession,
      applySettings,
      getSettings: () => ({ ...state.settings }),
      getStats: () => ({ ...state.stats }),
      getState: () => ({
        status: state.status,
        phase: PHASES[state.phaseIndex]?.key || null,
        phaseLabel: PHASES[state.phaseIndex]?.label || null,
        cycle: state.cycle,
        elapsedSeconds: totalElapsed(),
        sessionSeconds: sessionDuration(),
        protocol: protocolName()
      }),
      exportStats
    });
  }

  loadLocalState();
  updateRuntimeStatus();
  syncSettingsForm();
  updateStaticDisplay();
  bindEvents();
  exposeApi();

  window.ZZXHooks?.emit("4-4:ready", {
    version: "1.0.0-web",
    protocol: protocolName()
  });
})();
