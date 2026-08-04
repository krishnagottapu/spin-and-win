import { NextRequest, NextResponse } from 'next/server';
import twilio from 'twilio';
import { createServiceClient } from '@/lib/supabase/server';
import type { ApiError } from '@/lib/types';

const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 3;

function generateOtp(): string {
  // Cryptographically random 6-digit code
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return String(100000 + (array[0] % 900000));
}

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+1${digits.slice(1)}`;
  return `+${digits}`;
}

/**
 * POST /api/otp
 *
 * action: "send"   — generates code, sends via Twilio SMS, stores in Supabase
 * action: "verify" — checks code against Supabase record
 *
 * In development (NODE_ENV !== 'production'), the code is also returned in
 * the response as dev_code so you can test without receiving an SMS.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      phone?: string;
      action?: string;
      code?: string;
    };

    const { action, code } = body;
    const phone = body.phone ? normalizePhone(body.phone) : null;

    if (!phone || !action) {
      return NextResponse.json<ApiError>(
        { error: 'phone and action are required' },
        { status: 422 }
      );
    }

    const supabase = createServiceClient();
    const isDev = process.env.NODE_ENV !== 'production';

    // ─── SEND ────────────────────────────────────────────────────────────────
    if (action === 'send') {
      const otp = generateOtp();
      const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS).toISOString();

      // Upsert — replace any existing code for this phone
      const { error: upsertError } = await supabase
        .from('otp_codes')
        .upsert(
          { phone, code: otp, attempts: 0, expires_at: expiresAt },
          { onConflict: 'phone' }
        );

      if (upsertError) {
        console.error('[POST /api/otp] upsert error:', upsertError);
        return NextResponse.json<ApiError>(
          { error: 'Failed to generate code. Please try again.' },
          { status: 500 }
        );
      }

      // Send SMS via Twilio in production; skip in dev to save credits
      if (!isDev) {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const fromNumber = process.env.TWILIO_PHONE_NUMBER;

        if (!accountSid || !authToken || !fromNumber) {
          console.error('[POST /api/otp] Missing Twilio env vars');
          return NextResponse.json<ApiError>(
            { error: 'SMS service not configured.' },
            { status: 500 }
          );
        }

        const client = twilio(accountSid, authToken);
        await client.messages.create({
          body: `Your Spin & Win verification code is: ${otp}. Valid for 5 minutes.`,
          from: fromNumber,
          to: phone,
        });
      }

      return NextResponse.json({
        success: true,
        message: isDev ? 'Dev mode — code not sent via SMS' : 'Verification code sent',
        // Only expose code in dev — never in production
        ...(isDev && { dev_code: otp }),
      });
    }

    // ─── VERIFY ──────────────────────────────────────────────────────────────
    if (action === 'verify') {
      if (!code) {
        return NextResponse.json<ApiError>(
          { error: 'code is required' },
          { status: 422 }
        );
      }

      // Fetch the stored OTP
      const { data: stored, error: fetchError } = await supabase
        .from('otp_codes')
        .select('code, expires_at, attempts')
        .eq('phone', phone)
        .single();

      if (fetchError || !stored) {
        return NextResponse.json<ApiError>(
          { error: 'No code sent for this number. Request a new code.' },
          { status: 404 }
        );
      }

      // Check expiry
      if (new Date() > new Date(stored.expires_at)) {
        await supabase.from('otp_codes').delete().eq('phone', phone);
        return NextResponse.json<ApiError>(
          { error: 'Code expired. Request a new code.' },
          { status: 410 }
        );
      }

      // Check attempt limit
      if (stored.attempts >= MAX_ATTEMPTS) {
        await supabase.from('otp_codes').delete().eq('phone', phone);
        return NextResponse.json<ApiError>(
          { error: 'Too many attempts. Request a new code.' },
          { status: 429 }
        );
      }

      // Increment attempt count
      await supabase
        .from('otp_codes')
        .update({ attempts: stored.attempts + 1 })
        .eq('phone', phone);

      // Check code
      if (stored.code !== code) {
        const remaining = MAX_ATTEMPTS - (stored.attempts + 1);
        return NextResponse.json<ApiError>(
          { error: `Invalid code. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.` },
          { status: 401 }
        );
      }

      // Success — delete the used code
      await supabase.from('otp_codes').delete().eq('phone', phone);

      return NextResponse.json({ success: true, verified: true });
    }

    return NextResponse.json<ApiError>(
      { error: 'Invalid action. Use "send" or "verify".' },
      { status: 422 }
    );
  } catch (err) {
    console.error('[POST /api/otp]', err);
    return NextResponse.json<ApiError>(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
