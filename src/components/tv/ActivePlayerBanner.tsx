'use client';

interface ActivePlayerBannerProps {
  playerName: string | null;
}

export function ActivePlayerBanner({ playerName }: ActivePlayerBannerProps) {
  if (playerName === null) {
    return (
      <div className="w-full rounded-lg bg-gray-800 px-6 py-4 text-center">
        <p className="text-2xl text-gray-300">Scan the QR code to join!</p>
      </div>
    );
  }

  return (
    <div className="w-full rounded-lg bg-gray-800 px-6 py-4 text-center">
      <p className="animate-pulse text-2xl font-bold text-green-400">
        {playerName} is spinning...
      </p>
    </div>
  );
}
