/**
 * VEXORA authorization. Only configured Discord role IDs grant staff access.
 */
export function getConfiguredRoleIds(value = "") {
  return new Set(value.split(",").map((id) => id.trim()).filter(Boolean));
}

export function hasStaffRole(member, env = process.env) {
  if (!member?.roles?.cache) return false;
  const ids = new Set([
    ...getConfiguredRoleIds(env.OWNER_ROLE_IDS),
    ...getConfiguredRoleIds(env.MODERATOR_ROLE_IDS),
  ]);
  return member.roles.cache.some((role) => ids.has(role.id));
}

export function isOwner(member, env = process.env) {
  if (!member) return false;
  if (member.id === member.guild?.ownerId) return true;
  if (!member.roles?.cache) return false;
  const ids = getConfiguredRoleIds(env.OWNER_ROLE_IDS);
  return member.roles.cache.some((role) => ids.has(role.id));
}

export function isModerator(member, env = process.env) {
  if (!member?.roles?.cache) return false;
  const ids = getConfiguredRoleIds(env.MODERATOR_ROLE_IDS);
  return member.roles.cache.some((role) => ids.has(role.id)) || isOwner(member, env);
}

export function canManageTarget(actor, target, botMember) {
  if (!actor || !target || !botMember) return false;
  if (actor.id === target.id || target.id === botMember.id) return false;
  if (target.id === target.guild.ownerId) return false;
  if (actor.id !== target.guild.ownerId && actor.roles.highest.comparePositionTo(target.roles.highest) <= 0) return false;
  if (botMember.roles.highest.comparePositionTo(target.roles.highest) <= 0) return false;
  return true;
}

/** Only members with a configured Leitstelle role may use dispatch commands. */
export function isDispatcher(member, env = process.env) {
  if (!member?.roles?.cache) return false;
  const ids = getConfiguredRoleIds(env.VEXORA_DISPATCHER_ROLE_IDS);
  return member.roles.cache.some((role) => ids.has(role.id));
}
