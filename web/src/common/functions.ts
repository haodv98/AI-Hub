/**
 * Common utility functions for the AI Hub project.
 */

export const formatCurrency = (amount: number | string): string => {
  const value = typeof amount === 'string' ? parseFloat(amount) : amount;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

export const formatCompactNumber = (number: number): string => {
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(number);
};

export const cn = (...classes: (string | undefined | null | boolean)[]) => {
  return classes.filter(Boolean).join(' ');
};
