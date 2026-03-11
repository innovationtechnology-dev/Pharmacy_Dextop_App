import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '../../../lib/firebaseAdmin';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      pharmacyName,
      email,
      phone,
      doctorName,
      address,
      city,
      country,
      installationId
    } = body;

    if (!pharmacyName || !email) {
      return NextResponse.json(
        { ok: false, error: 'pharmacyName and email are required' },
        { status: 400 }
      );
    }

    const db = getAdminFirestore();
    const docRef = await db.collection('licenseRequests').add({
      pharmacyName,
      email,
      phone: phone ?? null,
      doctorName: doctorName ?? null,
      address: address ?? null,
      city: city ?? null,
      country: country ?? null,
      installationId: installationId ?? null,
      status: 'pending',
      requestedAt: new Date().toISOString()
    });

    return NextResponse.json({ ok: true, id: docRef.id });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: 'Failed to create license request' },
      { status: 500 }
    );
  }
}

