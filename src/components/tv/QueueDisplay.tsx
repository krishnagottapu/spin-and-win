'use client';

interface QueueEntry {
  id: string;
  name: string;
  position: number;
  isActive: boolean;
}

interface QueueDisplayProps {
  queue: QueueEntry[];
  activePlayerName: string | null;
}

export function QueueDisplay({ queue, activePlayerName: _activePlayerName }: QueueDisplayProps) {
  if (queue.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-gray-500">Queue is empty</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-400">
        Queue
      </h3>
      <div className="flex-1 space-y-1.5 overflow-y-auto">
        {queue.map((entry, index) => (
          <div
            key={entry.id}
            className={`flex items-center gap-2 rounded-md px-2 py-1.5 transition-all duration-300 ${
              entry.isActive
                ? 'bg-yellow-500/20 border border-yellow-500/40'
                : 'bg-gray-800/60'
            }`}
          >
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                entry.isActive
                  ? 'bg-yellow-500 text-gray-950'
                  : 'bg-gray-700 text-gray-300'
              }`}
            >
              {entry.isActive ? '▶' : index + 1}
            </span>
            <span
              className={`truncate text-sm ${
                entry.isActive
                  ? 'font-semibold text-yellow-300'
                  : 'text-gray-300'
              }`}
            >
              {entry.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
