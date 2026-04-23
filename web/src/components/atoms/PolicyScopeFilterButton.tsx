/* eslint-disable react/react-in-jsx-scope */
import { SegmentedFilterButton } from '@/components/atoms/SegmentedFilterButton';

interface PolicyScopeFilterButtonProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
  className?: string;
}

export function PolicyScopeFilterButton({
  label,
  isActive,
  onClick,
  className,
}: PolicyScopeFilterButtonProps) {
  return (
    <SegmentedFilterButton
      label={label}
      isActive={isActive}
      onClick={onClick}
      className={className}
    />
  );
}
