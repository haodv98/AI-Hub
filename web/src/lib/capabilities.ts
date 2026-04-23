export type Capability =
  | 'members.create'
  | 'members.offboard'
  | 'members.importProviderKeys'
  | 'teams.addMember'
  | 'teams.removeMember'
  | 'teams.changeTier'
  | 'teams.updateBudget'
  | 'member.assignProviderKey'
  | 'audit.export'
  | 'usage.export'
  | 'reports.read';

export interface RoleContext {
  isAdmin: boolean;
  isTeamLead: boolean;
}

const endpointCapabilities: Record<Capability, boolean> = {
  'members.create': true,
  'members.offboard': true,
  'members.importProviderKeys': true,
  'teams.addMember': true,
  'teams.removeMember': true,
  'teams.changeTier': true,
  'teams.updateBudget': true,
  'member.assignProviderKey': true,
  // Not implemented by backend yet.
  'audit.export': false,
  'usage.export': true,
  'reports.read': true,
};

export function canUseCapability(role: RoleContext, capability: Capability): boolean {
  if (!endpointCapabilities[capability]) return false;
  if (role.isAdmin) return true;

  if (role.isTeamLead) {
    return capability === 'reports.read';
  }

  return false;
}
