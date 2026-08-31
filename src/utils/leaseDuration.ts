/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Tenant, Room, Booking } from '../types';

export interface LeaseRemainingInfo {
  startDate: Date;
  endDate: Date;
  diffMs: number;
  diffDays: number;
  diffHours: number;
  isExpiredPast24h: boolean; // Durasi sewa 0 dan sudah lewat 24 jam -> Otomatis Available
  isDueToday: boolean;        // Durasi sewa 0 tetapi masih dalam tenggang 24 jam
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
  now: Date = new Date()
): LeaseRemainingInfo {
  const defaultDate = new Date();
  const startDate = startDateStr ? new Date(startDateStr) : defaultDate;
  const validStart = isNaN(startDate.getTime()) ? defaultDate : startDate;
  
  const endDate = new Date(validStart);

  if (bookingType === 'daily' && durationDays && durationDays > 0) {
    endDate.setDate(endDate.getDate() + durationDays);
  } else {
    const months = Math.max(1, durationMonths || 1);
    endDate.setMonth(endDate.getMonth() + months);
  }

  const diffMs = endDate.getTime() - now.getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  // Past 24 hours threshold (-24 hours or diffMs <= -24 * 3600 * 1000)
  const isExpiredPast24h = diffHours <= -24;
  const isDueToday = diffHours <= 0 && diffHours > -24;
  const isExpiringSoon = diffDays > 0 && diffDays <= 7;
  const isWarning = diffDays > 7 && diffDays <= 14;

  let remainingDaysText = '';
  let statusText = '';
  let badgeClass = '';
  let graceHoursLeft: number | undefined;

  if (isExpiredPast24h) {
    const daysPassed = Math.abs(Math.floor(diffHours / 24));
    remainingDaysText = `Masa Sewa Berakhir (+${daysPassed}h)`;
    statusText = '0 Hari (Lewat >24 Jam - Otomatis Tersedia)';
    badgeClass = 'bg-slate-100 text-slate-700 border-slate-300';
  } else if (isDueToday) {
    graceHoursLeft = Math.max(0, Math.ceil(24 + diffHours));
    remainingDaysText = `0 Hari (Tenggang ${graceHoursLeft} Jam)`;
    statusText = `Jatuh Tempo Hari Ini (Sisa Tenggang ${graceHoursLeft} Jam)`;
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
 * Finds the lease information for a specific room based on active tenant or booking
 */
export function getRoomLeaseStatus(
  room: Room,
  tenants: Tenant[],
  bookings?: Booking[]
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
         (!t.property_id || t.property_id === room.property_id) &&
         t.status !== 'checkout'
  );

  if (activeTenant) {
    const leaseInfo = calculateLeaseRemaining(
      activeTenant.start_date,
      activeTenant.duration_months,
      undefined,
      'monthly'
    );

    // If lease duration is 0 and passed 24 hours, room is automatically available for booking
    if (leaseInfo.isExpiredPast24h) {
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
           (!b.property_id || b.property_id === room.property_id) &&
           b.status === 'approved'
    );

    if (activeBooking) {
      const leaseInfo = calculateLeaseRemaining(
        activeBooking.check_in_date || activeBooking.booking_date,
        activeBooking.duration_months,
        activeBooking.duration_days,
        activeBooking.booking_type || 'monthly'
      );

      if (leaseInfo.isExpiredPast24h) {
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

  // If room status in DB is available or not marked occupied
  const isAvailable = room.status === 'available' || !room.status;

  return {
    isOccupied: !isAvailable,
    tenantName: room.current_tenant_name || undefined,
    isAvailableForBooking: isAvailable
  };
}
