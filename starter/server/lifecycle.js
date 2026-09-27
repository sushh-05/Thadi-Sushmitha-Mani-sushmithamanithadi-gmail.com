// Shared domain rules: role ranks, last-owner protection, ending sessions.
//
// YOURS TO WRITE. This file ships as a stub.
//
// Put here the rules more than one route needs, so "what ends a session" has exactly
// one implementation. Sources: PERMISSIONS.md §7.2 and D8.
//
// Two traps worth naming before you start:
//   - `roles.rank` is MODIFICATION AUTHORITY ONLY. It must never answer a can()
//     question. operator and auditor are unordered by permission, and ranking them is
//     the modelling error the auditor role exists to catch.
//   - a permission change does NOT end a session in flight (grantfathering). Suspension,
//     membership removal and device transfer DO. See PERMISSIONS.md §7.

import { conflict, forbidden, lastOwner, selfRoleChange } from './http.js';
import { resolve } from './permissions.js';
import { nowIso, newId } from './db.js';

export function roleRanks(db) { return Object.fromEntries(db.prepare('SELECT key,rank FROM roles').all().map(x=>[x.key,x.rank])); }
export function assertRoleExists(db, role) { if (!db.prepare('SELECT 1 FROM roles WHERE key=?').get(role)) throw conflict('unknown role','UNKNOWN_ROLE'); }
export function assertCanModify(db, callerRole, targetRole) { const r=roleRanks(db); if (targetRole==='owner' && callerRole!=='owner') throw forbidden('only an owner may assign owner','role_authority'); if (!(callerRole==='owner' || r[callerRole]>r[targetRole])) throw forbidden('insufficient role authority','role_authority'); }
export function assertNotLastOwner(db, orgId, userId) { const n=db.prepare("SELECT count(*) AS n FROM memberships WHERE org_id=? AND role='owner' AND status='active'").get(orgId).n; const m=db.prepare("SELECT role,status FROM memberships WHERE org_id=? AND user_id=?").get(orgId,userId); if(n<=1 && m?.role==='owner' && m.status==='active') throw lastOwner(); }
export function endActiveSessions(db, { orgId, userId, deviceId, reason, exceptSessionId }) { let q='UPDATE sessions SET state=\'ended\', end_reason=?, ended_at=? WHERE org_id=? AND state=\'active\''; const a=[reason,nowIso(),orgId]; if(userId){q+=' AND user_id=?';a.push(userId)} if(deviceId){q+=' AND device_id=?';a.push(deviceId)} if(exceptSessionId){q+=' AND id<>?';a.push(exceptSessionId)} return db.prepare(q).run(...a); }
export function snapshotAuthority(db, { userId, orgId, deviceId }) { const r=resolve(db,{userId,orgId,deviceId}); const ids=db.prepare('SELECT DISTINCT g.id FROM grants g JOIN grant_permissions gp ON gp.grant_id=g.id WHERE g.user_id=? AND g.org_id=? AND g.revoked_at IS NULL AND (g.device_id IS NULL OR g.device_id=?)').all(userId,orgId,deviceId).map(x=>x.id); return { role:r.role, permissions:r.permissions, grantIds:ids, snapshotAt:nowIso() }; }
export function sessionExpiry(db, orgId) { const o=db.prepare('SELECT max_session_minutes FROM organizations WHERE id=?').get(orgId); return new Date(Date.now()+(o?.max_session_minutes??60)*60000).toISOString(); }
