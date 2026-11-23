/**
 * Server-side authorization for every privileged interaction.
 * Access is based exclusively on Discord role IDs, never display names.
 */
export function getConfiguredRoleIds(value = "") {
  return new Set(
    value.split(",").map((id) => id.trim()).filter(Boolean)
  );
}

export function hasStaffRole(member, env = process.env) {
  if (!member?.roles?.cache) return false;

  const allowedRoleIds = new Set([
    ...getConfiguredRoleIds(env.OWNER_ROLE_IDS),
    ...getConfiguredRoleIds(env.MODERATOR_ROLE_IDS),
  ]);

  return member.roles.cache.some((role) => allowedRoleIds.has(role.id));
}

export function isOwner(member, env = process.env) {
  if (!member?.roles?.cache) return false;
  const ownerIds = getConfiguredRoleIds(env.OWNER_ROLE_IDS);
  return member.roles.cache.some((role) => ownerIds.has(role.id));
}
