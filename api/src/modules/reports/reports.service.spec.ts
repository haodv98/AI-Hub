import { ReportsService } from './reports.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../integrations/email/email.service';

const mockPrisma = () => ({
  user: {
    findMany: jest.fn(),
  },
});

const mockEmail = () => ({
  sendToUser: jest.fn().mockResolvedValue(undefined),
  sendToGroup: jest.fn().mockResolvedValue(undefined),
});

describe('ReportsService', () => {
  let service: ReportsService;
  let prisma: ReturnType<typeof mockPrisma>;
  let email: ReturnType<typeof mockEmail>;

  beforeEach(() => {
    prisma = mockPrisma();
    email = mockEmail();
    service = new ReportsService(prisma as unknown as PrismaService, email as unknown as EmailService);
  });

  it('delivers report to admins and recipient group', async () => {
    prisma.user.findMany.mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]);

    const result = await service.deliverMonthlyReport({
      month: '2026-04',
      totalSpendUsd: 123.45,
      reportUrl: 'https://portal/reports/2026-04',
    });

    expect(email.sendToUser).toHaveBeenCalledTimes(2);
    expect(email.sendToGroup).toHaveBeenCalledWith(
      'report_recipients',
      'monthly_report_ready',
      expect.objectContaining({ month: '2026-04' }),
    );
    expect(result).toEqual({ deliveredToAdmins: 2, deliveredToRecipients: true });
  });

  it('returns recipient delivery false when report group send fails', async () => {
    prisma.user.findMany.mockResolvedValue([{ id: 'u1' }]);
    email.sendToGroup.mockRejectedValueOnce(new Error('smtp'));

    const result = await service.deliverMonthlyReport({
      month: '2026-04',
      totalSpendUsd: 10,
    });

    expect(result).toEqual({ deliveredToAdmins: 1, deliveredToRecipients: false });
  });
});
