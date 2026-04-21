import { Link } from 'react-router';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <p className="text-5xl font-bold text-muted-foreground/30">404</p>
      <p className="text-muted-foreground">This page does not exist.</p>
      <Link to="/dashboard" className="text-sm text-primary hover:underline">
        Back to Dashboard
      </Link>
    </div>
  );
}
