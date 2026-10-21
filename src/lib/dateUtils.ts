/**
 * Helper zona waktu WIB (Asia/Jakarta, UTC+7) untuk memastikan tanggal bisnis
 * seperti booking_date, start_date, payment_date, dan transaction_date
 * tidak bergeser ke hari sebelumnya pada rentang pukul 00:00–06:59 WIB.
 */

export function toJakartaDate(d: Date | string = new Date()): string {
  const dateObj = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(dateObj.getTime())) {
    // Jika sudah berformat YYYY-MM-DD valid, kembalikan langsung
    if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.trim())) {
      return d.trim();
    }
    return toJakartaDate(new Date());
  }
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(dateObj);
}

export function todayJakarta(now: Date = new Date()): string {
  return toJakartaDate(now);
}
