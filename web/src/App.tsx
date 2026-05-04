import { useState, useEffect, useRef, useCallback } from "react";
import { Shell } from "./components/Shell";

type Mode = "focus" | "short" | "long";

const DURATIONS: Record<Mode, number> = {
  focus: 25 * 60,
  short: 5 * 60,
  long: 15 * 60,
};

const MODE_LABELS: Record<Mode, string> = {
  focus: "Focus",
  short: "Short Break",
  long: "Long Break",
};

const HISTORY_KEY = "pomodoro_history";

interface Session {
  mode: Mode;
  completedAt: string; // ISO timestamp
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadTodaySessions(): Session[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const all: Session[] = JSON.parse(raw);
    const today = todayKey();
    return all.filter((s) => s.completedAt.startsWith(today));
  } catch {
    return [];
  }
}

function saveSession(session: Session) {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    const all: Session[] = raw ? JSON.parse(raw) : [];
    const today = todayKey();
    // Keep only today's sessions + new one
    const todaySessions = all.filter((s) => s.completedAt.startsWith(today));
    todaySessions.push(session);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(todaySessions));
  } catch {
    /* ignore */
  }
}

function playBeep() {
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.frequency.value = 880;
  osc.type = "sine";
  gain.gain.value = 0.3;
  osc.start();
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
  osc.stop(ctx.currentTime + 0.8);
}

export function App() {
  const [mode, setMode] = useState<Mode>("focus");
  const [seconds, setSeconds] = useState(DURATIONS.focus);
  const [running, setRunning] = useState(false);
  const [focusCount, setFocusCount] = useState(0);
  const [history, setHistory] = useState<Session[]>(loadTodaySessions);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoAdvanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (autoAdvanceRef.current) {
      clearTimeout(autoAdvanceRef.current);
      autoAdvanceRef.current = null;
    }
  }, []);

  const switchMode = useCallback(
    (next: Mode) => {
      clearTimer();
      setMode(next);
      setSeconds(DURATIONS[next]);
      setRunning(false);
    },
    [clearTimer],
  );

  const advanceToNext = useCallback(
    (currentMode: Mode, currentFocusCount: number) => {
      if (currentMode === "focus") {
        const newCount = currentFocusCount + 1;
        setFocusCount(newCount);
        const session: Session = { mode: "focus", completedAt: new Date().toISOString() };
        saveSession(session);
        setHistory((prev) => [...prev, session]);

        if (newCount >= 4) {
          setFocusCount(0);
          setMode("long");
          setSeconds(DURATIONS.long);
        } else {
          setMode("short");
          setSeconds(DURATIONS.short);
        }
      } else {
        setMode("focus");
        setSeconds(DURATIONS.focus);
      }
    },
    [],
  );

  const handleTimerEnd = useCallback(() => {
    clearTimer();
    setRunning(false);
    playBeep();
    advanceToNext(mode, focusCount);
    // Auto-start next session after 2 seconds
    autoAdvanceRef.current = setTimeout(() => {
      setRunning(true);
    }, 2000);
  }, [clearTimer, mode, focusCount, advanceToNext]);

  const skip = useCallback(() => {
    clearTimer();
    setRunning(false);
    advanceToNext(mode, focusCount);
  }, [clearTimer, mode, focusCount, advanceToNext]);

  // Tick
  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          handleTimerEnd();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return clearTimer;
  }, [running, handleTimerEnd, clearTimer]);

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  const progress = 1 - seconds / DURATIONS[mode];
  const radius = 120;
  const circumference = 2 * Math.PI * radius;
  const currentSession = Math.min(focusCount + 1, 4);
  const todayFocusSessions = history.filter((s) => s.mode === "focus").length;

  return (
    <Shell>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "1.5rem",
          padding: "1rem 0",
        }}
      >
        {/* Mode tabs */}
        <div
          style={{
            display: "flex",
            gap: "0.25rem",
            padding: "0.25rem",
            background: "var(--color-panel)",
            borderRadius: "var(--radius-btn)",
            border: "1px solid var(--color-line)",
          }}
        >
          {(["focus", "short", "long"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              style={{
                padding: "0.5rem 1rem",
                borderRadius: "0.5rem",
                fontSize: "0.875rem",
                fontWeight: 600,
                cursor: "pointer",
                border: "none",
                fontFamily: "var(--font-body)",
                background: m === mode ? "var(--color-accent)" : "transparent",
                color: m === mode ? "#fff" : "var(--color-muted)",
                transition: "all 150ms",
              }}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>

        {/* Circular timer */}
        <div style={{ position: "relative", width: 272, height: 272 }}>
          <svg width="272" height="272" viewBox="0 0 272 272">
            <circle
              cx="136"
              cy="136"
              r={radius}
              fill="none"
              stroke="var(--color-line)"
              strokeWidth="6"
            />
            <circle
              cx="136"
              cy="136"
              r={radius}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - progress)}
              style={{
                transform: "rotate(-90deg)",
                transformOrigin: "center",
                transition: "stroke-dashoffset 300ms ease",
              }}
            />
          </svg>
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "3.5rem",
                fontWeight: 700,
                lineHeight: 1,
                color: "var(--color-ink)",
              }}
            >
              {mm}:{ss}
            </span>
            <span
              style={{
                fontSize: "0.8rem",
                color: "var(--color-muted)",
                marginTop: "0.5rem",
              }}
            >
              {MODE_LABELS[mode]}
            </span>
          </div>
        </div>

        {/* Session counter */}
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background:
                  n <= focusCount ? "var(--color-accent)" : "var(--color-line)",
                transition: "background 200ms",
              }}
            />
          ))}
          <span
            style={{
              fontSize: "0.875rem",
              color: "var(--color-muted)",
              marginLeft: "0.5rem",
            }}
          >
            {currentSession}/4
          </span>
        </div>

        {/* Controls */}
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button
            onClick={() => setRunning((r) => !r)}
            style={{
              padding: "0.625rem 2rem",
              borderRadius: "var(--radius-btn)",
              border: "none",
              background: "var(--color-accent)",
              color: "#fff",
              fontFamily: "var(--font-body)",
              fontWeight: 600,
              fontSize: "0.95rem",
              cursor: "pointer",
              minWidth: "7rem",
            }}
          >
            {running ? "Pause" : "Start"}
          </button>
          <button
            onClick={() => switchMode(mode)}
            style={{
              padding: "0.625rem 1.25rem",
              borderRadius: "var(--radius-btn)",
              border: "1px solid var(--color-line)",
              background: "var(--color-panel)",
              color: "var(--color-ink)",
              fontFamily: "var(--font-body)",
              fontWeight: 600,
              fontSize: "0.95rem",
              cursor: "pointer",
            }}
          >
            Reset
          </button>
          <button
            onClick={skip}
            style={{
              padding: "0.625rem 1.25rem",
              borderRadius: "var(--radius-btn)",
              border: "1px solid var(--color-line)",
              background: "var(--color-panel)",
              color: "var(--color-ink)",
              fontFamily: "var(--font-body)",
              fontWeight: 600,
              fontSize: "0.95rem",
              cursor: "pointer",
            }}
          >
            Skip
          </button>
        </div>

        {/* Today's stats */}
        <p style={{ color: "var(--color-muted)", fontSize: "0.8rem" }}>
          {todayFocusSessions} focus session{todayFocusSessions !== 1 ? "s" : ""}{" "}
          completed today
        </p>
      </div>
    </Shell>
  );
}
