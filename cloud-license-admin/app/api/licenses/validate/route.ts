import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../../lib/firebaseAdmin';
import type { LicensePayload } from '../../../../lib/license';

export async function POST(req: NextRequest) {
  try {
    const { licenseKey } = await req.json();

    if (!licenseKey || typeof licenseKey !== 'string') {
      return NextResponse.json(
        { ok: false, error: 'licenseKey is required' },
        { status: 400 }
      );
    }

    // Normalize key: remove spaces/hyphens and uppercase so we can
    // accept keys typed as "TCKT MG24 HY3T 4C" or "tckt-mg24-hy3t-4c"
    const normalizedKey = licenseKey.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

    // Strategy:
    // - New licenses use a short, 14-character key stored in Firestore (field: shortKey)
    // - For backwards compatibility, we also support any existing long keys
    //   by looking them up via the stored licenseKey field.

    const db = getAdminFirestore();

    let payload: LicensePayload | null = null;

    // Try to find by shortKey first (new style 14-char keys)
    const shortSnap = await db
      .collection('licenses')
      .where('shortKey', '==', normalizedKey)
      .limit(1)
      .get();

    if (!shortSnap.empty) {
      const doc = shortSnap.docs[0];
      const data = doc.data() as any;

      payload = {
        pharmacyId: data.pharmacyId,
        installationId: data.installationId ?? null,
        plan: data.plan ?? undefined,
        validFrom: data.validFrom,
        validUntil: data.validUntil
      };
    } else {
      // Fallback: try to find by full licenseKey (for any pre-existing records)
      const legacySnap = await db
        .collection('licenses')
        .where('licenseKey', '==', normalizedKey)
        .limit(1)
        .get();

      if (!legacySnap.empty) {
        const doc = legacySnap.docs[0];
        const data = doc.data() as any;

        payload = {
          pharmacyId: data.pharmacyId,
          installationId: data.installationId ?? null,
          plan: data.plan ?? undefined,
          validFrom: data.validFrom,
          validUntil: data.validUntil
        };
      }
    }

    if (!payload) {
      return NextResponse.json(
        { ok: false, error: 'Invalid license key' },
        { status: 400 }
      );
    }

    const now = Date.now();
    const validUntilMs = new Date(payload.validUntil).getTime();

    if (Number.isNaN(validUntilMs) || validUntilMs <= now) {
      return NextResponse.json(
        { ok: false, error: 'License expired' },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, payload });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: 'Invalid license key' },
      { status: 400 }
    );
  }
}

