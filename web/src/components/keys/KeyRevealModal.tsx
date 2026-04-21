import { useState } from 'react';
import { Copy, Check, AlertTriangle } from 'lucide-react';

interface KeyRevealModalProps {
  apiKey: string;
  onClose: () => void;
}

export function KeyRevealModal({ apiKey, onClose }: KeyRevealModalProps) {
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  async function copyKey() {
    await navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative bg-background rounded-xl border border-border shadow-xl p-6 w-full max-w-lg mx-4">
        {/* Warning banner */}
        <div className="flex items-start gap-3 p-3 mb-5 rounded-lg bg-amber-50 border border-amber-200">
          <AlertTriangle size={18} className="text-amber-600 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-800">
            <strong>This key will not be shown again.</strong> Copy it now and store it securely.
          </p>
        </div>

        <h2 className="text-base font-semibold mb-3">Your new API key</h2>

        {/* Key display */}
        <div className="flex items-center gap-2 bg-muted rounded-md px-3 py-2 mb-5">
          <code className="flex-1 text-sm font-mono break-all select-all">{apiKey}</code>
          <button
            onClick={copyKey}
            className="shrink-0 p-1.5 rounded hover:bg-background transition-colors"
            title="Copy to clipboard"
          >
            {copied ? (
              <Check size={15} className="text-emerald-600" />
            ) : (
              <Copy size={15} className="text-muted-foreground" />
            )}
          </button>
        </div>

        {/* Confirmation checkbox */}
        <label className="flex items-center gap-2.5 cursor-pointer mb-5">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="w-4 h-4 rounded border-border"
          />
          <span className="text-sm">I have saved this key in a secure location</span>
        </label>

        <button
          onClick={onClose}
          disabled={!confirmed}
          className="w-full py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
        >
          Done — close this window
        </button>
      </div>
    </div>
  );
}
