/**
 * SAMARA STAY ERP — PERMISSIONS MATRIX & RBAC SYSTEM (v19)
 *
 * Centralized RBAC permission definition and validation helper
 * Shared across server-side Express handlers and client-side UI components.
 */
/**
 * Core Permission Matrix matching the v19 Security Specification
 */
export const PERMISSION_RULES = [
    {
        resource: 'users',
        allowedRoles: ['super', 'super_admin', 'owner', 'anak_owner'],
        allowedActions: ['read', 'create', 'update', 'delete']
        // anak_owner has target role constraints evaluated by canManageRole()
    },
    {
        resource: 'properties',
        allowedRoles: ['super', 'super_admin', 'owner', 'anak_owner', 'admin', 'staff'],
        allowedActions: ['read', 'create', 'update', 'delete'],
        propertyScopedRoles: ['admin', 'staff'] // admin can CRUD own property, staff can only read
    },
    {
        resource: 'rooms',
        allowedRoles: ['super', 'super_admin', 'owner', 'anak_owner', 'admin', 'staff'],
        allowedActions: ['read', 'create', 'update', 'delete'],
        propertyScopedRoles: ['admin', 'staff'] // staff can update room status for assigned property
    },
    {
        resource: 'properties_close',
        allowedRoles: ['super', 'super_admin', 'owner'],
        allowedActions: ['delete', 'close']
    },
    {
        resource: 'bookings',
        allowedRoles: ['super', 'super_admin', 'owner', 'anak_owner', 'admin', 'staff'],
        allowedActions: ['read', 'create', 'update', 'approve'],
        propertyScopedRoles: ['admin', 'staff'] // staff cannot approve; only submit/view
    },
    {
        resource: 'journals',
        allowedRoles: ['super', 'super_admin', 'owner', 'anak_owner', 'admin', 'finance'],
        allowedActions: ['read', 'create', 'update'],
        propertyScopedRoles: ['admin', 'finance']
    },
    {
        resource: 'financial_reports',
        allowedRoles: ['super', 'super_admin', 'owner', 'anak_owner'],
        allowedActions: ['read'] // anak_owner is read-only
    },
    {
        resource: 'operations',
        allowedRoles: ['super', 'super_admin', 'owner', 'anak_owner', 'admin', 'staff'],
        allowedActions: ['read', 'create', 'update', 'delete'],
        propertyScopedRoles: ['admin', 'staff']
    },
    {
        resource: 'pii_docs',
        allowedRoles: ['super', 'super_admin', 'owner', 'anak_owner', 'admin'],
        allowedActions: ['read'] // staff sees masked NIK, no unmasked documents
    },
    {
        resource: 'midtrans_logs',
        allowedRoles: ['super', 'super_admin', 'owner', 'finance'],
        allowedActions: ['read', 'create', 'update', 'delete']
    },
    {
        resource: 'finance',
        allowedRoles: ['super', 'super_admin', 'owner', 'finance'],
        allowedActions: ['read', 'create', 'update', 'delete', 'manage']
    },
    {
        resource: 'system_settings',
        allowedRoles: ['super', 'super_admin', 'owner'],
        allowedActions: ['read', 'create', 'update', 'delete', 'repair']
    }
];
/**
 * Check if a given role can perform an action on a resource
 */
export function can(role, resource, action = 'read') {
    if (!role)
        return false;
    const cleanRole = role.trim().toLowerCase().replace(/\s+/g, '_');
    // Super admins always have full access
    if (cleanRole === 'super' || cleanRole === 'super_admin')
        return true;
    // Midtrans logs clearing: only super and owner
    if (resource === 'midtrans_logs' && action === 'delete') {
        return cleanRole === 'owner';
    }
    // Staff cannot approve bookings (only propose)
    if (resource === 'bookings' && action === 'approve' && cleanRole === 'staff') {
        return false;
    }
    // Staff cannot create/update properties (read-only)
    if (resource === 'properties' && (action === 'create' || action === 'update' || action === 'delete') && cleanRole === 'staff') {
        return false;
    }
    // Financial reports: only super/owner/anak_owner (read-only for anak_owner)
    if (resource === 'financial_reports') {
        if (action !== 'read')
            return cleanRole === 'owner';
        return ['owner', 'anak_owner'].includes(cleanRole);
    }
    // Properties closing / book closing: only super and owner
    if (resource === 'properties_close') {
        return cleanRole === 'owner';
    }
    const rule = PERMISSION_RULES.find(r => r.resource === resource);
    if (!rule)
        return false;
    return rule.allowedRoles.includes(cleanRole) && rule.allowedActions.includes(action);
}
/**
 * Granular User Management Hierarchy:
 * - super / super_admin: can manage all roles
 * - owner: can manage all roles EXCEPT super / super_admin
 * - anak_owner: can ONLY create/update/manage staff, admin, and user (CANNOT manage owner, super, anak_owner)
 * - admin / staff / finance / user: CANNOT manage users at all
 */
export const ROLE_HIERARCHY = {
    super: 100,
    super_admin: 100,
    owner: 80,
    anak_owner: 60,
    admin: 40,
    finance: 30,
    staff: 20,
    user: 10
};
export function canManageRole(actorRole, targetRole, action = 'create') {
    if (!actorRole)
        return { allowed: false, reason: 'Peran aktor tidak ditemukan.' };
    const actor = actorRole.trim().toLowerCase().replace(/\s+/g, '_');
    const target = (targetRole || 'user').trim().toLowerCase().replace(/\s+/g, '_');
    // Super Admin can manage all roles
    if (actor === 'super' || actor === 'super_admin') {
        return { allowed: true };
    }
    // Owner can manage all EXCEPT super / super_admin
    if (actor === 'owner') {
        if (target === 'super' || target === 'super_admin') {
            return { allowed: false, reason: 'Owner tidak memiliki wewenang mengelola akun Super Admin.' };
        }
        return { allowed: true };
    }
    // Anak Owner can ONLY manage staff, admin, and user (CANNOT manage owner, super, or other anak_owner)
    if (actor === 'anak_owner') {
        if (['staff', 'admin', 'user'].includes(target)) {
            return { allowed: true };
        }
        return {
            allowed: false,
            reason: 'Anak Owner hanya memiliki wewenang untuk mengelola akun Staff, Admin, dan User.'
        };
    }
    // Target role cannot be higher than actor's role
    const actorWeight = ROLE_HIERARCHY[actor] || 0;
    const targetWeight = ROLE_HIERARCHY[target] || 0;
    if (targetWeight > actorWeight) {
        return {
            allowed: false,
            reason: `Akses ditolak. Peran "${actor}" tidak dapat mengelola peran "${target}" yang berada di tingkat lebih tinggi.`
        };
    }
    // admin, staff, finance, and user cannot manage roles
    return { allowed: false, reason: 'Anda tidak memiliki hak akses untuk mengelola pengguna.' };
}
/**
 * Assign Property Permission:
 * - super / super_admin: allowed for all target roles
 * - owner: allowed for all target roles (except super)
 * - anak_owner: allowed ONLY for staff and admin target roles
 * - others: rejected
 */
export function canAssignProperty(actorRole, targetRole) {
    if (!actorRole)
        return { allowed: false, reason: 'Peran aktor tidak ditemukan.' };
    const actor = actorRole.trim().toLowerCase().replace(/\s+/g, '_');
    const target = (targetRole || 'user').trim().toLowerCase().replace(/\s+/g, '_');
    if (actor === 'super' || actor === 'super_admin' || actor === 'owner') {
        return { allowed: true };
    }
    if (actor === 'anak_owner') {
        if (['staff', 'admin', 'user'].includes(target)) {
            return { allowed: true };
        }
        return {
            allowed: false,
            reason: 'Anak Owner hanya dapat mengalokasikan properti untuk Staff dan Admin cabang.'
        };
    }
    return { allowed: false, reason: 'Hanya Super Admin, Owner, atau Anak Owner yang dapat mengalokasikan properti.' };
}
/**
 * Property Dimension Access Helper
 */
export function canAccessProperty(userProfile, targetPropertyId) {
    if (!userProfile)
        return false;
    const role = (userProfile.role || '').trim().toLowerCase().replace(/\s+/g, '_');
    // Global roles: super, super_admin, owner, anak_owner have global property access
    if (['super', 'super_admin', 'owner', 'anak_owner'].includes(role)) {
        return true;
    }
    // Global un-scoped admin or finance (property_id === null or undefined)
    if (['admin', 'finance'].includes(role) && (userProfile.property_id === null || userProfile.property_id === undefined)) {
        return true;
    }
    // Scoped admin, finance, or staff
    if (userProfile.property_id !== null && userProfile.property_id !== undefined) {
        if (targetPropertyId === null || targetPropertyId === undefined)
            return false;
        return String(userProfile.property_id) === String(targetPropertyId);
    }
    // Staff without assigned property cannot access any property operations
    if (role === 'staff') {
        return false;
    }
    return false;
}
/**
 * Mask Indonesian NIK (16 digits) for staff role:
 * e.g., 3171012345678901 -> 3171************
 */
export function maskNik(nik) {
    if (!nik || !String(nik).trim())
        return '';
    const clean = String(nik).trim();
    if (clean.length < 4)
        return '****';
    return clean.substring(0, 4) + '*'.repeat(Math.max(0, clean.length - 4));
}
