'use client';

import { QRCodeSVG } from 'qrcode.react';

interface ResultDisplayProps {
  prizeName: string;
  isNoPrize: boolean;
  resultToken: string | null;
  isFulfilled?: boolean;
  fulfilledAt?: string | null;
}

export default function ResultDisplay({
  prizeName,
  isNoPrize,
  resultToken,
  isFulfilled,
  fulfilledAt,
}: ResultDisplayProps) {
  if (isNoPrize) {
    return (
      <div className="flex w-full flex-col items-center justify-center gap-6 px-4 py-8 text-center">
        <span className="text-6xl">😅</span>
        <p className="text-3xl font-bold text-gray-300">
          Better luck next time!
        </p>
        <p className="text-lg text-gray-500">
          Thanks for playing. Maybe next spin!
        </p>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-center justify-center gap-5 px-4 py-8 text-center">
      {/* Prize won */}
      <span className="text-5xl">🎉</span>
      <p className="text-lg font-medium text-green-400">
        Congratulations! You won:
      </p>
      <p className="bg-gradient-to-r from-yellow-300 via-pink-400 to-purple-400 bg-clip-text text-4xl font-extrabold text-transparent">
        {prizeName}
      </p>

      {/* Fulfillment status */}
      {isFulfilled ? (
        <div className="w-full max-w-xs rounded-xl border border-green-500/30 bg-green-900/20 px-4 py-4">
          <div className="flex items-center justify-center gap-2">
            <span className="text-2xl">✅</span>
            <span className="text-lg font-bold text-green-400">Prize Claimed!</span>
          </div>
          {fulfilledAt && (
            <p className="mt-2 text-sm text-gray-400">
              Claimed at {new Date(fulfilledAt).toLocaleTimeString()}
            </p>
          )}
        </div>
      ) : (
        <>
          {/* QR Code for unclaimed prize */}
          {resultToken && (
            <>
              <div className="rounded-xl bg-white p-4 shadow-lg">
                <QRCodeSVG
                  value={resultToken}
                  size={220}
                  bgColor="#ffffff"
                  fgColor="#111827"
                  level="M"
                  aria-label={`QR code for prize claim: ${prizeName}`}
                />
              </div>
              <div className="w-full max-w-xs rounded-lg border border-yellow-500/30 bg-yellow-900/20 px-4 py-3">
                <p className="text-sm font-medium text-yellow-300">
                  ⏳ Show this QR code to staff to claim your prize
                </p>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
