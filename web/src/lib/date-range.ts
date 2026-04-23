export type PresetRange = '7d' | '30d' | '90d';

const RANGE_TO_DAYS: Record<PresetRange, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

function toIsoDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function presetToDateRange(range: PresetRange): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - (RANGE_TO_DAYS[range] - 1));
  return { from: toIsoDate(from), to: toIsoDate(to) };
}

export function monthToDateRange(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { from: toIsoDate(from), to: toIsoDate(now) };
}
