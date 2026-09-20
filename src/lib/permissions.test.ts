import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { canManageRole, canAssignProperty, canAccessProperty, UserRole } from './permissions';

describe('RBAC Hierarchy: canManageRole', () => {
  const allRoles: UserRole[] = ['super', 'super_admin', 'owner', 'anak_owner', 'admin', 'finance', 'staff', 'user'];

  test('Super and Super Admin can manage all roles', () => {
    for (const superRole of ['super', 'super_admin'] as UserRole[]) {
      for (const target of allRoles) {
        const res = canManageRole(superRole, target);
        assert.equal(res.allowed, true, `${superRole} should manage ${target}`);
      }
    }
  });

  test('Owner can manage all roles EXCEPT super and super_admin', () => {
    const ownerAllowed: UserRole[] = ['owner', 'anak_owner', 'admin', 'finance', 'staff', 'user'];
    const ownerForbidden: UserRole[] = ['super', 'super_admin'];

    for (const target of ownerAllowed) {
      const res = canManageRole('owner', target);
      assert.equal(res.allowed, true, `owner should be allowed to manage ${target}`);
    }

    for (const target of ownerForbidden) {
      const res = canManageRole('owner', target);
      assert.equal(res.allowed, false, `owner must be forbidden from managing ${target}`);
      assert.match(res.reason || '', /Super Admin/i);
    }
  });

  test('Anak Owner can ONLY manage staff, admin, and user', () => {
    const anakOwnerAllowed: UserRole[] = ['staff', 'admin', 'user'];
    const anakOwnerForbidden: UserRole[] = ['super', 'super_admin', 'owner', 'anak_owner', 'finance'];

    for (const target of anakOwnerAllowed) {
      const res = canManageRole('anak_owner', target);
      assert.equal(res.allowed, true, `anak_owner should manage ${target}`);
    }

    for (const target of anakOwnerForbidden) {
      const res = canManageRole('anak_owner', target);
      assert.equal(res.allowed, false, `anak_owner must be forbidden from managing ${target}`);
    }
  });

  test('Admin, staff, finance, and user are rejected from managing any roles', () => {
    const subordinateRoles: UserRole[] = ['admin', 'staff', 'finance', 'user'];

    for (const actor of subordinateRoles) {
      for (const target of allRoles) {
        const res = canManageRole(actor, target);
        assert.equal(res.allowed, false, `${actor} must not be allowed to manage ${target}`);
      }
    }
  });
});

describe('RBAC Property Assignment: canAssignProperty', () => {
  test('Super, super_admin, and owner can assign property for allowed roles', () => {
    for (const actor of ['super', 'super_admin', 'owner']) {
      const res = canAssignProperty(actor, 'staff');
      assert.equal(res.allowed, true);
    }
  });

  test('Anak Owner can assign property ONLY to staff and admin', () => {
    assert.equal(canAssignProperty('anak_owner', 'staff').allowed, true);
    assert.equal(canAssignProperty('anak_owner', 'admin').allowed, true);
    assert.equal(canAssignProperty('anak_owner', 'owner').allowed, false);
    assert.equal(canAssignProperty('anak_owner', 'super').allowed, false);
    assert.equal(canAssignProperty('anak_owner', 'finance').allowed, false);
  });

  test('Admin, staff, finance, user cannot assign property', () => {
    for (const actor of ['admin', 'staff', 'finance', 'user']) {
      assert.equal(canAssignProperty(actor, 'staff').allowed, false);
    }
  });
});

describe('Property Scope: canAccessProperty', () => {
  test('Global roles have access to any property', () => {
    for (const role of ['super', 'super_admin', 'owner', 'anak_owner']) {
      assert.equal(canAccessProperty({ role, property_id: null }, 1), true);
      assert.equal(canAccessProperty({ role, property_id: 2 }, 1), true);
    }
  });

  test('Global admin/finance with null property_id have global access', () => {
    assert.equal(canAccessProperty({ role: 'admin', property_id: null }, 1), true);
    assert.equal(canAccessProperty({ role: 'finance', property_id: null }, 2), true);
  });

  test('Scoped admin/finance/staff only have access to their assigned property', () => {
    assert.equal(canAccessProperty({ role: 'staff', property_id: 1 }, 1), true);
    assert.equal(canAccessProperty({ role: 'staff', property_id: 1 }, 2), false);
    assert.equal(canAccessProperty({ role: 'admin', property_id: 1 }, 2), false);
  });

  test('Staff without assigned property is rejected from all properties', () => {
    assert.equal(canAccessProperty({ role: 'staff', property_id: null }, 1), false);
    assert.equal(canAccessProperty({ role: 'staff', property_id: undefined }, 1), false);
  });
});
