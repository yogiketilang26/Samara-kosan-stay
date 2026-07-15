const { createClient } = require('@supabase/supabase-js');
const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const client = createClient(url, key);

async function check() {
  const { data: bData, error: bErr } = await client.from('bookings').select('*');
  console.log('Bookings data:', bData);
  console.log('Bookings error:', bErr);

  const { data: uData, error: uErr } = await client.from('users').select('*');
  console.log('Users data:', uData);
  console.log('Users error:', uErr);
}
check();
