/* eslint-disable react/react-in-jsx-scope */
import { useState } from 'react';
import { Download } from 'lucide-react';
import api from '@/lib/api';

interface ExportButtonProps {
  from: string;
  to: string;
}

export function ExportButton({ from, to }: ExportButtonProps) {
  const [loading, setLoading] = useState<'csv' | 'pdf' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download(format: 'csv' | 'pdf') {
    setLoading(format);
    setError(null);
    try {
      const response = await api.get(`/usage/export?format=${format}&from=${from}&to=${to}`, {
        responseType: 'blob',
      });
      const blob = new Blob([response.data], {
        type: format === 'csv' ? 'text/csv' : 'application/pdf',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeFrom = from.replace(/[:.]/g, '-');
      const safeTo = to.replace(/[:.]/g, '-');
      a.download = `usage-${safeFrom}-${safeTo}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError(`Failed to export ${format.toUpperCase()}.`);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => download('csv')}
          disabled={loading !== null}
          className="p-3 glass-panel rounded-xl hover:text-primary transition-all"
        >
          <Download className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={() => download('pdf')}
          disabled={loading !== null}
          className="px-3 py-2 text-[10px] font-black uppercase tracking-widest glass-panel rounded-xl hover:text-primary transition-all"
        >
          PDF
        </button>
      </div>
      {error && <span className="text-[10px] text-error font-bold">{error}</span>}
    </div>
  );
}
