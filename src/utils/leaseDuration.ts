/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Tenant, Room, Booking, ContractExtension } from '../types';

export interface LeaseRemainingInfo {
  startDate: Date;
  endDate: Date;
  diffMs: number;
  diffDays: number;
  diffHours: number;
  isExpired: boolean;        // Durasi sewa habis (diffMs <= 0)
  isExpiredPast24h: boolean; // Durasi sewa habis -> Otomatis Available
  isDueToday: boolean;        // Jatuh tempo hari ini
  isExpiringSoon: boolean;    // < 7 hari
  isWarning: boolean;         // <= 14 hari
  remainingDaysText: string;
  graceHoursLeft?: number;
  badgeClass: string;
  statusText: string;
}

/**
 * Calculates remaining lease duration, grace period, and expiration status
 * based on start date and duration.
 */
export function calculateLeaseRemaining(
  startDateStr?: string | null,
  durationMonths: number = 1,
  durationDays?: number,
  bookingType: 'monthly' | 'daily' = 'monthly',
  now: Date = new Date(),
  explicitEndDateStr?: string | null
): LeaseRemainingInfo {
  const defaultDate = new Date();
  const startDate = startDateStr ? new Date(startDateStr) : defaultDate;
  const validStart = isNaN(startDate.getTime()) ? defaultDate : startDate;
  
  let endDate = new Date(validStart);

  if (explicitEndDateStr) {
    const parsedExp = new Date(explicitEndDateStr);
    if (!isNaN(parsedExp.getTime())) {
      endDate = parsedExp;
    }
  } else if (bookingType === 'daily' && durationDays && durationDays > 0) {
    endDate.setDate(endDate.getDate() + durationDays);
  } else {
    const months = Math.max(1, durationMonths || 1);
    endDate.setMonth(endDate.getMonth() + months);
  }

  const diffMs = endDate.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  // Expiration condition: if time has passed (diffMs <= 0 or diffHours <= 0)
  const isExpired = diffMs <= 0 || diffHours <= 0;
  const isExpiredPast24h = isExpired;
  const isDueToday = !isExpired && diffHours <= 24 && diffHours > 0;
  const isExpiringSoon = diffDays > 0 && diffDays <= 7;
  const isWarning = diffDays > 7 && diffDays <= 14;

  let remainingDaysText = '';
  let statusText = '';
  let badgeClass = '';
  let graceHoursLeft: number | undefined;

  if (isExpired) {
    const daysPassed = Math.max(0, Math.abs(Math.floor(diffHours / 24)));
    remainingDaysText = daysPassed > 0 ? `Masa Sewa Berakhir (+${daysPassed}h)` : 'Masa Sewa Berakhir';
    statusText = 'Habis Kontrak (Otomatis Tersedia)';
    badgeClass = 'bg-slate-100 text-slate-700 border-slate-300 font-semibold';
  } else if (isDueToday) {
    graceHoursLeft = Math.max(0, Math.ceil(diffHours));
    remainingDaysText = `Jatuh Tempo Hari Ini (${graceHoursLeft} Jam)`;
    statusText = `Jatuh Tempo Hari Ini (Sisa ${graceHoursLeft} Jam)`;
    badgeClass = 'bg-rose-100 text-rose-800 border-rose-300 animate-pulse font-extrabold';
  } else if (diffDays === 1) {
    remainingDaysText = '1 Hari Lagi';
    statusText = 'Besok Berakhir';
    badgeClass = 'bg-rose-50 text-rose-700 border-rose-200 font-bold';
  } else if (isExpiringSoon) {
    remainingDaysText = `${diffDays} Hari Lagi`;
    statusText = `Segera Berakhir (${diffDays} Hari)`;
    badgeClass = 'bg-amber-100 text-amber-800 border-amber-300 font-bold';
  } else if (isWarning) {
    remainingDaysText = `${diffDays} Hari Lagi`;
    statusText = `Masa Sewa (${diffDays} Hari)`;
    badgeClass = 'bg-amber-50 text-amber-700 border-amber-200';
  } else {
    remainingDaysText = `${diffDays} Hari Lagi`;
    statusText = `Aktif (${diffDays} Hari)`;
    badgeClass = 'bg-teal-50 text-teal-700 border-teal-200';
  }

  return {
    startDate: validStart,
    endDate,
    diffMs,
    diffDays,
    diffHours,
    isExpired,
    isExpiredPast24h,
    isDueToday,
    isExpiringSoon,
    isWarning,
    remainingDaysText,
    graceHoursLeft,
    badgeClass,
    statusText
  };
}

/**
 * Finds the lease information for a specific room based on active tenant, booking,
 * and contract extension history.
 * If a room's contract has ended without extension, it is automatically deemed available!
 */
export function getRoomLeaseStatus(
  room: Room,
  tenants: Tenant[],
  bookings?: Booking[],
  contractExtensions?: ContractExtension[],
  now: Date = new Date()
): {
  isOccupied: boolean;
  tenantName?: string;
  leaseInfo?: LeaseRemainingInfo;
  isAvailableForBooking: boolean;
} {
  // If room is manually set to maintenance
  if (room.status === 'maintenance') {
    return {
      isOccupied: false,
      isAvailableForBooking: false
    };
  }

  // Find active tenant matching room
  const activeTenant = tenants.find(
    t => t.room_number === room.room_number &&
         (!t.property_id || !room.property_id || t.property_id === room.property_id) &&
         t.status !== 'checkout'
  );

  if (activeTenant) {
    // Check if tenant has paid contract extensions
    const tenantExts = (contractExtensions || []).filter(
      e => e.tenant_id === activeTenant.id && e.status === 'paid'
    );
    const totalExtensionMonths = tenantExts.reduce((sum, e) => sum + (Number(e.extension_months) || 0), 0);
    const effectiveDurationMonths = (Number(activeTenant.duration_months) || 1) + totalExtensionMonths;

    const leaseInfo = calculateLeaseRemaining(
      activeTenant.start_date,
      effectiveDurationMonths,
      undefined,
      'monthly',
      now,
      (activeTenant as any).lease_end_date
    );

    // Business rule: If lease contract has expired without extension, room is automatically available for booking
    if (leaseInfo.isExpired) {
      return {
        isOccupied: false,
        tenantName: activeTenant.full_name,
        leaseInfo,
        isAvailableForBooking: true
      };
    }

    return {
      isOccupied: true,
      tenantName: activeTenant.full_name,
      leaseInfo,
      isAvailableForBooking: false
    };
  }

  // If no active tenant, check approved bookings
  if (bookings && bookings.length > 0) {
    const activeBooking = bookings.find(
      b => (b.room_id === room.id || b.room_number === room.room_number) &&
           (!b.property_id || !room.property_id || b.property_id === room.property_id) &&
           b.status === 'approved'
    );

    if (activeBooking) {
      const leaseInfo = calculateLeaseRemaining(
        activeBooking.check_in_date || activeBooking.booking_date,
        activeBooking.duration_months,
        activeBooking.duration_days,
        activeBooking.booking_type || 'monthly',
        now
      );

      if (leaseInfo.isExpired) {
        return {
          isOccupied: false,
          tenantName: activeBooking.tenant_name,
          leaseInfo,
          isAvailableForBooking: true
        };
      }

      return {
        isOccupied: true,
        tenantName: activeBooking.tenant_name,
        leaseInfo,
        isAvailableForBooking: false
      };
    }
  }

  // If room status in DB is available, reserved, or null
  const isAvailable = room.status === 'available' || !room.status || room.status === 'reserved';

  // If room is marked occupied in DB but has no active tenant or approved booking, it's orphan occupied -> auto available
  if (room.status === 'occupied') {
    return {
      isOccupied: false,
      tenantName: room.current_tenant_name || undefined,
      isAvailableForBooking: true
    };
  }

  return {
    isOccupied: !isAvailable,
    tenantName: room.current_tenant_name || undefined,
    isAvailableForBooking: isAvailable
  };
}
