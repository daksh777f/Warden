import { getMandate, getTodayAuthorizedSpend, updateMandate } from '@/lib/store';
import type { Mandate } from '@/lib/policy/mandate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const mandate = await getMandate();
  const todaySpend = await getTodayAuthorizedSpend();
  return Response.json({ mandate, todaySpend });
}

export async function POST(request: Request) {
  let body: Partial<Mandate>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const updated = await updateMandate(body);
  const todaySpend = await getTodayAuthorizedSpend();
  return Response.json({ mandate: updated, todaySpend });
}
