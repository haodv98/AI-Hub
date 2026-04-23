export const EMAIL_TEMPLATES = {
  BUDGET_ALERT: 'budget_alert',
  TEAM_BUDGET_ALERT: 'team_budget_alert',
  SPIKE_DETECTED: 'spike_detected',
  KEY_ROTATION_REMINDER: 'key_rotation_reminder',
  MONTHLY_REPORT_READY: 'monthly_report_ready',
  ONBOARDING_KEY_DELIVERY: 'onboarding_key_delivery',
} as const;

export type EmailTemplateId = (typeof EMAIL_TEMPLATES)[keyof typeof EMAIL_TEMPLATES];

export interface OneTimeTokenPayload {
  subject: string;
  purpose: 'key_reveal';
  resourceId: string;
  expiresAt: string;
  keyPlaintext?: string;
}
