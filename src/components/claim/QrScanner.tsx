'use client';

import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

interface QrScannerProps {
  onScan: (token: string) => void;
}

const SCANNER_CONTAINER_ID = 'qr-scanner-container';

export default function QrScanner({ onScan }: QrScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const hasScannedRef = useRef(false);

  useEffect(() => {
    let isMounted = true;
    const scanner = new Html5Qrcode(SCANNER_CONTAINER_ID);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          if (!isMounted) return;
          // Prevent duplicate scans
          if (hasScannedRef.current) return;
          hasScannedRef.current = true;
          onScan(decodedText);

          // Reset after a short delay to allow rescanning
          setTimeout(() => {
            hasScannedRef.current = false;
          }, 2000);
        },
        () => {
          // Ignore scan failures (no QR code in frame)
        }
      )
      .catch((err: unknown) => {
        if (!isMounted) return;
        const message = err instanceof Error ? err.message : String(err);
        if (
          message.includes('NotAllowedError') ||
          message.includes('Permission')
        ) {
          setCameraError(
            'Camera permission denied. Please allow camera access and reload the page.'
          );
        } else {
          setCameraError(
            'Camera unavailable. Please ensure your device has a camera and try again.'
          );
        }
      });

    return () => {
      isMounted = false;
      scanner.stop().then(() => {
        scanner.clear();
      }).catch(() => {
        // Scanner wasn't running — safe to ignore
      });
      scannerRef.current = null;
    };
  }, [onScan]);

  if (cameraError) {
    return (
      <div className="rounded-md bg-yellow-50 p-4 text-center text-yellow-800">
        <p className="font-medium">Camera Unavailable</p>
        <p className="mt-1 text-sm">{cameraError}</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div
        id={SCANNER_CONTAINER_ID}
        className="mx-auto max-w-sm overflow-hidden rounded-lg"
      />
    </div>
  );
}
