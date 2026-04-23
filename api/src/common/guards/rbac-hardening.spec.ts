import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AuditController } from '../../modules/audit/audit.controller';
import { KeysController } from '../../modules/keys/keys.controller';
import { PoliciesController } from '../../modules/policies/policies.controller';
import { ReportsController } from '../../modules/reports/reports.controller';
import { TeamsController } from '../../modules/teams/teams.controller';
import { UsageController } from '../../modules/usage/usage.controller';
import { UsersController } from '../../modules/users/users.controller';
import { GatewayController } from '../../modules/gateway/gateway.controller';
import { HrController } from '../../modules/integrations/hr/hr.controller';
import { HealthController } from '../../health.controller';

function hasGuardsMetadata(target: object): boolean {
  const metadata = Reflect.getMetadata(GUARDS_METADATA, target);
  return Array.isArray(metadata) && metadata.length > 0;
}

function hasControllerOrMethodGuards(controller: new (...args: any[]) => unknown): boolean {
  if (hasGuardsMetadata(controller)) return true;

  const proto = controller.prototype as Record<string, unknown>;
  const methodNames = Object.getOwnPropertyNames(proto).filter(
    (name) => name !== 'constructor' && typeof proto[name] === 'function',
  );

  return methodNames.every((name) => hasGuardsMetadata(proto[name] as object));
}

describe('RBAC hardening', () => {
  const protectedControllers = [
    AuditController,
    KeysController,
    PoliciesController,
    ReportsController,
    TeamsController,
    UsageController,
    UsersController,
  ];

  it('requires auth guards at controller level for protected controllers', () => {
    for (const controller of protectedControllers) {
      expect(hasControllerOrMethodGuards(controller)).toBe(true);
    }
  });

  it('keeps intended public surface explicit', () => {
    expect(hasGuardsMetadata(GatewayController)).toBe(false);
    expect(hasGuardsMetadata(HrController)).toBe(false);
    expect(hasGuardsMetadata(HealthController)).toBe(false);
  });
});
