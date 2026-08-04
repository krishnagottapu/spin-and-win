'use client';

interface QueuePositionProps {
  position: number;
  estimatedWait: number; // seconds
  onPositionUpdate?: (newPosition: number, newWait: number) => void;
}

export default function QueuePosition({
  position,
  estimatedWait,
}: QueuePositionProps) {
  const minutes = Math.max(1, Math.ceil(estimatedWait / 60));

  return (
    <div className="flex w-full flex-col items-center gap-4 px-4 py-8">
      <div className="flex h-24 w-24 items-center justify-center rounded-full bg-blue-100">
        <span className="text-4xl font-bold text-blue-600">#{position}</span>
      </div>
      <h2 className="text-center text-2xl font-bold">
        You are #{position} in line
      </h2>
      <p className="text-center text-lg text-gray-600">
        Estimated wait: ~{minutes} {minutes === 1 ? 'minute' : 'minutes'}
      </p>
      <p className="text-center text-sm text-gray-500">
        Stay on this page — we&apos;ll let you know when it&apos;s your turn!
      </p>
    </div>
  );
}
