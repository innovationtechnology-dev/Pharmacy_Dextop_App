import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore, getAdminAuth } from '../../../../lib/firebaseAdmin';
import {
  createLicensePayload,
  generateShortLicenseKey,
  type LicensePayload
} from '../../../../lib/license';

export async function POST(req: NextRequest) {
  try {
    const auth = getAdminAuth();
    const db = getAdminFirestore();

    const body = await req.json();
    const { idToken, pharmacyId, installationId, plan, durationMonths } = body;

    if (!idToken || !pharmacyId) {
      return NextResponse.json(
        { ok: false, error: 'idToken and pharmacyId are required' },
        { status: 400 }
      );
    }

    const decoded = await auth.verifyIdToken(idToken);
    const adminUid = decoded.uid;

    const payload: LicensePayload = createLicensePayload({
      pharmacyId,
      installationId,
      plan,
      durationMonths
    });

    // Generate a short, user-facing license key (e.g. 14 chars)
    const shortKey = generateShortLicenseKey(14);

    const docRef = await db.collection('licenses').add({
      pharmacyId,
      installationId: installationId ?? null,
      plan: plan ?? null,
      licenseKey: shortKey,
      shortKey,
      validFrom: payload.validFrom,
      validUntil: payload.validUntil,
      status: 'active',
      createdAt: new Date().toISOString(),
      createdBy: adminUid
    });

    return NextResponse.json({
      ok: true,
      id: docRef.id,
      licenseKey: shortKey,
      validFrom: payload.validFrom,
      validUntil: payload.validUntil
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: 'Failed to issue license' },
      { status: 500 }
    );
  }
}

