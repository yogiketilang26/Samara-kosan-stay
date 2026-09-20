import { can, canManageRole, canAssignProperty, canAccessProperty, maskNik } from '../src/lib/permissions';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${message}`);
  }
}

console.log('=== RUNNING RBAC & PERMISSIONS TESTS ===\n');

// 1. canManageRole tests
console.log('1. Testing canManageRole:');
// Super Admin can manage everyone
assert(canManageRole('super', 'super').allowed === true, 'super can manage super');
assert(canManageRole('super', 'owner').allowed === true, 'super can manage owner');
assert(canManageRole('super', 'anak_owner').allowed === true, 'super can manage anak_owner');
assert(canManageRole('super', 'admin').allowed === true, 'super can manage admin');
assert(canManageRole('super', 'staff').allowed === true, 'super can manage staff');

// Owner can manage all except super
assert(canManageRole('owner', 'super').allowed === false, 'owner CANNOT manage super');
assert(canManageRole('owner', 'super_admin').allowed === false, 'owner CANNOT manage super_admin');
assert(canManageRole('owner', 'anak_owner').allowed === true, 'owner can manage anak_owner');
assert(canManageRole('owner', 'admin').allowed === true, 'owner can manage admin');
assert(canManageRole('owner', 'staff').allowed === true, 'owner can manage staff');

// Anak Owner can ONLY manage staff, admin, user
assert(canManageRole('anak_owner', 'super').allowed === false, 'anak_owner CANNOT manage super');
assert(canManageRole('anak_owner', 'owner').allowed === false, 'anak_owner CANNOT manage owner');
assert(canManageRole('anak_owner', 'anak_owner').allowed === false, 'anak_owner CANNOT manage anak_owner');
assert(canManageRole('anak_owner', 'admin').allowed === true, 'anak_owner can manage admin');
assert(canManageRole('anak_owner', 'staff').allowed === true, 'anak_owner can manage staff');
assert(canManageRole('anak_owner', 'user').allowed === true, 'anak_owner can manage user');

// Admin, Staff, Finance, User cannot manage anyone
assert(canManageRole('admin', 'staff').allowed === false, 'admin CANNOT manage staff');
assert(canManageRole('staff', 'user').allowed === false, 'staff CANNOT manage user');
assert(canManageRole('finance', 'staff').allowed === false, 'finance CANNOT manage staff');
assert(canManageRole('user', 'user').allowed === false, 'user CANNOT manage user');

// 2. canAssignProperty tests
console.log('\n2. Testing canAssignProperty:');
assert(canAssignProperty('super', 'staff').allowed === true, 'super can assign property to staff');
assert(canAssignProperty('owner', 'staff').allowed === true, 'owner can assign property to staff');
assert(canAssignProperty('anak_owner', 'staff').allowed === true, 'anak_owner can assign property to staff');
assert(canAssignProperty('anak_owner', 'admin').allowed === true, 'anak_owner can assign property to admin');
assert(canAssignProperty('anak_owner', 'owner').allowed === false, 'anak_owner CANNOT assign property to owner');
assert(canAssignProperty('anak_owner', 'super').allowed === false, 'anak_owner CANNOT assign property to super');
assert(canAssignProperty('admin', 'staff').allowed === false, 'admin CANNOT assign property to staff');

// 3. canAccessProperty tests
console.log('\n3. Testing canAccessProperty:');
assert(canAccessProperty({ role: 'super', property_id: null }, 1) === true, 'super has global access');
assert(canAccessProperty({ role: 'owner', property_id: null }, 2) === true, 'owner has global access');
assert(canAccessProperty({ role: 'anak_owner', property_id: null }, 3) === true, 'anak_owner has global access');
assert(canAccessProperty({ role: 'staff', property_id: 5 }, 5) === true, 'staff can access assigned property 5');
assert(canAccessProperty({ role: 'staff', property_id: 5 }, 6) === false, 'staff CANNOT access unassigned property 6');
assert(canAccessProperty({ role: 'staff', property_id: null }, 1) === false, 'staff without property has no access');

// 4. maskNik tests
console.log('\n4. Testing maskNik:');
assert(maskNik('3171012345678901') === '3171************', 'maskNik correctly masks 16-digit NIK');
assert(maskNik('123456') === '1234**', 'maskNik correctly masks 6-digit number');
assert(maskNik('') === '', 'maskNik handles empty string');

// 5. can matrix tests
console.log('\n5. Testing can() RBAC matrix:');
// Super has access to everything
assert(can('super', 'properties', 'create') === true, 'super can create properties');
assert(can('super', 'pii_docs', 'read') === true, 'super can read pii_docs');
assert(can('super', 'system_settings', 'update') === true, 'super can update system_settings');

// Anak Owner permissions
assert(can('anak_owner', 'pii_docs', 'read') === true, 'anak_owner can read pii_docs');
assert(can('anak_owner', 'properties', 'update') === true, 'anak_owner can update properties');
assert(can('anak_owner', 'journals', 'read') === true, 'anak_owner can read journals');
assert(can('anak_owner', 'system_settings', 'update') === false, 'anak_owner CANNOT update system_settings');
assert(can('anak_owner', 'midtrans_logs', 'read') === false, 'anak_owner CANNOT read midtrans_logs');

// Staff permissions
assert(can('staff', 'pii_docs', 'read') === false, 'staff CANNOT read pii_docs');
assert(can('staff', 'properties', 'create') === false, 'staff CANNOT create properties');
assert(can('staff', 'rooms', 'update') === true, 'staff can update rooms');
assert(can('staff', 'journals', 'create') === false, 'staff CANNOT create journals');

console.log(`\nTEST SUMMARY: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
