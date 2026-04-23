/* eslint-disable react/react-in-jsx-scope */
interface ErrorPanelProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorPanel({ message, onRetry }: ErrorPanelProps) {
  return (
    <div className="rounded-xl border border-error/30 bg-error/5 p-4">
      <p className="text-sm font-medium text-error">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-md border border-error/30 px-3 py-1.5 text-xs font-semibold text-error hover:bg-error/10"
        >
          Retry
        </button>
      )}
    </div>
  );
}

interface EmptyStateProps {
  message: string;
}

export function EmptyState({ message }: EmptyStateProps) {
  return (
    <div className="rounded-xl border border-border bg-muted/10 px-4 py-8 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}
