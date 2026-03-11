import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '../../../lib/firebaseAdmin';

// Create a Firebase session cookie from an ID token and set it as `session`.
export async function POST(req: NextRequest) {
  try {
    const { idToken } = await req.json();

    if (!idToken) {
      return NextResponse.json(
        { ok: false, error: 'idToken is required' },
        { status: 400 }
      );
    }

    const auth = getAdminAuth();

    // Optional: verify the ID token first
    const decoded = await auth.verifyIdToken(idToken);

    if (!decoded) {
      return NextResponse.json(
        { ok: false, error: 'Invalid ID token' },
        { status: 401 }
      );
    }

    const expiresIn = 1000 * 60 * 60 * 24 * 5; // 5 days in ms
    const sessionCookie = await auth.createSessionCookie(idToken, {
      expiresIn
    });

    const res = NextResponse.json({ ok: true });

    res.cookies.set('session', sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: expiresIn / 1000,
      path: '/'
    });

    return res;
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: 'Failed to create session' },
      { status: 500 }
    );
  }
}

