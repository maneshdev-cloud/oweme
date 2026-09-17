import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/supabase/server';

export default async function RootPage() {
  const user = await getSessionUser();
  redirect(user ? '/home' : '/login');
}
