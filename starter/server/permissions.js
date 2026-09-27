// The permission resolution engine. THE ONLY PLACE allow-vs-deny is decided.
//
// YOURS TO WRITE. This file ships as a stub.
//
// If you ever find yourself writing `if (role === 'admin')` outside this file — and
// especially under web/ — that is the bug this module exists to prevent. The console
// renders what this returns; it must never re-derive it.
//
// Inputs you will need:
//   permissions                 the catalogue (19 rows in db/reference.sql, but read it
//                               from the table, never hardcode it)
//   permission_patterns         the superset grants may name ('device:*', '*', ...)
//   role_permissions            the per-role baseline
//   memberships                 role + status + perm_version
//   grants / grant_permissions  per-user deltas, optionally device-scoped and windowed
//
// Behaviour to implement is in PERMISSIONS.md; the failure modes and the reason codes
// the API must report are in §10, and the shipped tests read those reason strings.
//
// NOTE: your database is personalised. There is at least one role and one permission in
// it that this exercise's prose never mentions. Read the tables; do not encode the
// documented matrix. Run `npm run personalisation` to see what you are dealing with.

import { forbidden, badRequest } from './http.js';

export const MODE_PERMISSION = { view: 'device:view', control: 'device:control', terminal: 'device:terminal' };

// Resolve one user's permission set in one org. deviceId === null means the org-level
// view; a deviceId means the exact per-device check.
export function resolve(db, { userId, orgId, deviceId = null, now = new Date() }) {
  const membership = db.prepare('SELECT role,status FROM memberships WHERE user_id=? AND org_id=?').get(userId, orgId);
  const permissions = {};
  const at = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const catalog = db.prepare('SELECT key FROM permissions ORDER BY key').all();
  const grants = membership?.status === 'active' ? db.prepare(
    `SELECT g.id,g.effect,g.device_id,gp.permission FROM grants g JOIN grant_permissions gp ON gp.grant_id=g.id
     WHERE g.user_id=? AND g.org_id=? AND g.revoked_at IS NULL AND (g.starts_at IS NULL OR g.starts_at<=?)
       AND (g.expires_at IS NULL OR ?<g.expires_at) AND (g.device_id IS NULL OR g.device_id=?)`
  ).all(userId, orgId, at, at, deviceId) : [];
  const baseline = membership?.status === 'active' ? new Set(db.prepare('SELECT permission FROM role_permissions WHERE role=?').all(membership.role).map(x=>x.permission)) : new Set();
  for (const { key } of catalog) {
    const matching = grants.filter(g => g.permission === '*' || g.permission === key || g.permission === key.split(':')[0]+':*');
    const deny = matching.find(g => g.effect === 'deny');
    const allow = matching.find(g => g.effect === 'allow');
    if (!membership) permissions[key] = { effect:'deny', source:null, reason:'not_a_member' };
    else if (membership.status !== 'active') permissions[key] = { effect:'deny', source:null, reason:membership.status };
    else if (deny) permissions[key] = { effect:'deny', source:`grant:${deny.id}`, reason:'explicit_deny' };
    else if (allow) permissions[key] = { effect:'allow', source:`grant:${allow.id}`, reason:null };
    else if (baseline.has(key)) permissions[key] = { effect:'allow', source:`role:${membership.role}`, reason:null };
    else permissions[key] = { effect:'deny', source:null, reason:'implicit' };
  }
  return { role: membership?.role ?? null, byDevice: deviceId ? undefined : undefined, permissions };
}

// Batched form for list endpoints: { role, byDevice: { [deviceId]: permissions } }.
export function resolveDevices(db, { userId, orgId, deviceIds, now = new Date() }) {
  const first = resolve(db, { userId, orgId, now });
  const byDevice = Object.fromEntries(deviceIds.map(id => [id, resolve(db, {userId, orgId, deviceId:id, now}).permissions]));
  return { role:first.role, byDevice };
}

export function can(db, ctx, permission, deviceId) {
  return resolve(db, {userId:ctx.userId, orgId:ctx.orgId, deviceId}).permissions[permission]?.effect === 'allow';
}

// Throws 403 carrying the reason code, so a refusal is debuggable.
export function assertCan(db, ctx, permission, deviceId) {
  const result = resolve(db, {userId:ctx.userId, orgId:ctx.orgId, deviceId}).permissions[permission];
  if (!result || result.effect !== 'allow') throw forbidden(`missing ${permission}`, result?.reason ?? 'missing_permission');
  return result;
}

// No privilege laundering: you may only grant authority you hold at that scope.
export function assertMayGrant(db, ctx, patterns, deviceId = null) {
  for (const pattern of patterns) {
    const exists = db.prepare('SELECT 1 FROM permission_patterns WHERE pattern=?').get(pattern);
    if (!exists) throw badRequest(`unknown permission: ${pattern}`, 'unknown_permission');
    const keys = pattern === '*' ? db.prepare('SELECT key FROM permissions').all().map(x=>x.key) :
      pattern.endsWith(':*') ? db.prepare('SELECT key FROM permissions WHERE resource=?').all(pattern.slice(0,-2)).map(x=>x.key) : [pattern];
    for (const key of keys) assertCan(db, ctx, key, deviceId);
  }
  if (ctx.userId === ctx.targetUserId) throw forbidden('cannot grant to yourself', 'self_grant');
}

// The compound check: session:start AND the permission for the requested mode, and a
// refusal must distinguish WHICH of the two was missing.
export function assertCanStartSession(db, ctx, mode, deviceId) {
  if (!MODE_PERMISSION[mode]) throw badRequest('invalid session mode');
  if (!can(db, ctx, 'session:start', deviceId)) throw forbidden('missing session:start', 'missing_permission');
  if (!can(db, ctx, MODE_PERMISSION[mode], deviceId)) throw forbidden(`missing ${MODE_PERMISSION[mode]}`, 'missing_device_permission');
}
