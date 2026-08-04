'use client';

import { useState, useCallback } from 'react';

interface SimulationPanelProps {
  sessionId: string;
  slug: string;
}

let simCounter = 0;

export default function SimulationPanel({ sessionId, slug: _slug }: SimulationPanelProps) {
  const [open, setOpen] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);

  const addLog = useCallback((msg: string) => {
    setLog((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 20));
  }, []);

  async function simulateSpin() {
    setRunning(true);
    simCounter++;
    const fakeName = `Player_${simCounter}`;

    try {
      addLog(`Simulating spin for ${fakeName}...`);

      const res = await fetch('/api/simulate/spin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          player_name: fakeName,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        addLog(`Simulation failed: ${err.error}`);
        setRunning(false);
        return;
      }

      const data = await res.json();
      addLog(`Won: ${data.prize_name}${data.is_no_prize ? ' (no prize)' : ''}`);
      addLog('No inventory affected ✓');
    } catch (err) {
      addLog(`Error: ${err instanceof Error ? err.message : 'Unknown'}`);
    } finally {
      setRunning(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="absolute left-4 top-4 z-50 rounded bg-purple-700 px-3 py-1 text-sm text-white opacity-60 transition-opacity hover:opacity-100"
      >
        Sim
      </button>
    );
  }

  return (
    <div className="absolute left-4 top-4 z-50 w-80 rounded-lg border border-purple-500 bg-gray-900/95 p-4 text-sm text-white shadow-xl">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-bold text-purple-300">Simulation Panel</h3>
        <button
          onClick={() => setOpen(false)}
          className="text-gray-400 hover:text-white"
        >
          X
        </button>
      </div>

      <div className="mb-3 space-y-2">
        <button
          onClick={simulateSpin}
          disabled={running}
          className="w-full rounded bg-purple-600 px-3 py-2 font-medium text-white hover:bg-purple-700 disabled:opacity-50"
        >
          {running ? 'Running...' : 'Simulate Full Spin'}
        </button>
        <p className="text-xs text-gray-400">
          Broadcasts spin events to TV without affecting inventory or creating participants.
        </p>
      </div>

      {log.length > 0 && (
        <div className="max-h-40 overflow-y-auto rounded bg-black/50 p-2 font-mono text-xs text-gray-300">
          {log.map((entry, i) => (
            <div key={i}>{entry}</div>
          ))}
        </div>
      )}
    </div>
  );
}
