import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isAuthError } from '@/lib/auth/middleware';
import { createServiceClient } from '@/lib/supabase/server';

interface RouteParams {
  params: { id: string };
}

/**
 * Prize management for a session — add new prizes or update existing ones on the fly.
 *
 * POST /api/sessions/[id]/prizes — Add a new prize
 * PATCH /api/sessions/[id]/prizes — Update an existing prize (inventory, weight, name)
 */

export async function POST(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAdmin(request);
  if (isAuthError(auth)) return auth;

  try {
    const body = await request.json();
    const { name, weight, inventory_count, is_no_prize } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Prize name is required' }, { status: 422 });
    }
    if (!weight || typeof weight !== 'number' || weight <= 0) {
      return NextResponse.json({ error: 'Weight must be a positive number' }, { status: 422 });
    }
    if (inventory_count === undefined || typeof inventory_count !== 'number' || inventory_count < 0) {
      return NextResponse.json({ error: 'Inventory count must be a non-negative number' }, { status: 422 });
    }

    const supabase = createServiceClient();

    // Verify session exists
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('id, status')
      .eq('id', params.id)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.status === 'ended') {
      return NextResponse.json({ error: 'Cannot modify prizes on an ended session' }, { status: 403 });
    }

    // Assign sort_order as max existing + 1 so new prizes always land at the end
    const { data: maxOrderRow } = await supabase
      .from('prizes')
      .select('sort_order')
      .eq('session_id', params.id)
      .order('sort_order', { ascending: false })
      .limit(1)
      .single();
    const nextSortOrder = (maxOrderRow?.sort_order ?? -1) + 1;

    // Insert new prize
    const { data: prize, error: insertError } = await supabase
      .from('prizes')
      .insert({
        session_id: params.id,
        name: name.trim(),
        weight,
        inventory_count,
        is_no_prize: is_no_prize ?? false,
        sort_order: nextSortOrder,
      })
      .select()
      .single();

    if (insertError) {
      console.error('[POST /api/sessions/[id]/prizes]', insertError);
      return NextResponse.json({ error: 'Failed to add prize' }, { status: 500 });
    }

    return NextResponse.json({ prize }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/sessions/[id]/prizes]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = await requireAdmin(request);
  if (isAuthError(auth)) return auth;

  try {
    const body = await request.json();
    const { prize_id, name, weight, inventory_count } = body;

    if (!prize_id || typeof prize_id !== 'string') {
      return NextResponse.json({ error: 'prize_id is required' }, { status: 422 });
    }

    const supabase = createServiceClient();

    // Verify session exists and is not ended
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('id, status')
      .eq('id', params.id)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.status === 'ended') {
      return NextResponse.json({ error: 'Cannot modify prizes on an ended session' }, { status: 403 });
    }

    // Build update object — only include fields that were provided
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name.trim();
    if (weight !== undefined) {
      if (typeof weight !== 'number' || weight <= 0) {
        return NextResponse.json({ error: 'Weight must be a positive number' }, { status: 422 });
      }
      updates.weight = weight;
    }
    if (inventory_count !== undefined) {
      if (typeof inventory_count !== 'number' || inventory_count < 0) {
        return NextResponse.json({ error: 'Inventory count must be a non-negative number' }, { status: 422 });
      }
      updates.inventory_count = inventory_count;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 422 });
    }

    // Update the prize
    const { data: prize, error: updateError } = await supabase
      .from('prizes')
      .update(updates)
      .eq('id', prize_id)
      .eq('session_id', params.id)
      .select()
      .single();

    if (updateError || !prize) {
      console.error('[PATCH /api/sessions/[id]/prizes]', updateError);
      return NextResponse.json({ error: 'Failed to update prize' }, { status: 500 });
    }

    return NextResponse.json({ prize }, { status: 200 });
  } catch (err) {
    console.error('[PATCH /api/sessions/[id]/prizes]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
