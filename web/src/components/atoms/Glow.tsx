export const Glow = ({ className = "top-[-100px] left-[-100px]", opacity = "opacity-100" }: { className?: string, opacity?: string }) => (
  <div className={`bg-glow ${className} ${opacity}`} />
);
