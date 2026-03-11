'use client';

import { useState } from 'react';

interface Props {
  licenseKey: string;
}

function formatLicenseKeyForDisplay(key: string): string {
  const clean = key.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return clean.replace(/(.{4})/g, '$1 ').trim();
}

export default function LicenseKeyDisplay({ licenseKey }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const clean = licenseKey.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    try {
      await navigator.clipboard.writeText(clean);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore clipboard errors in UI
    }
  };

  return (
    <div className="mt-1 text-[11px] text-slate-300 break-all font-mono flex items-center gap-2">
      <span>License key: {formatLicenseKeyForDisplay(licenseKey)}</span>
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copy license key"
        className={`flex items-center justify-center w-6 h-6 rounded-full border border-slate-600 text-slate-200 hover:bg-slate-800 hover:border-slate-400 transition-transform ${
          copied ? 'scale-110 bg-emerald-600 border-emerald-400' : ''
        }`}
      >
        <span className="sr-only">Copy</span>
        <svg
          className="w-3.5 h-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {copied ? (
            <polyline points="20 6 9 17 4 12" />
          ) : (
            <>
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </>
          )}
        </svg>
      </button>
    </div>
  );
}

