import { NextResponse } from 'next/server';
import { containsNormalized, fetchSnapshot, parseSnapshotUrl } from '@/lib/archive';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json() as { baselineUrl?: string; newUrl?: string; passage?: string };
    const { baselineUrl, newUrl, passage } = body;
    if (!baselineUrl || !newUrl || !passage || passage.length > 1200) return NextResponse.json({ ok: false, error: 'Provide both archive snapshots and a passage no longer than 1,200 characters.' }, { status: 400 });
    const baselineRef = parseSnapshotUrl(baselineUrl);
    const newRef = parseSnapshotUrl(newUrl);
    if (baselineRef.original !== newRef.original) return NextResponse.json({ ok: false, error: 'Both snapshots must have the same original policy URL.' }, { status: 422 });
    if (newRef.timestamp <= baselineRef.timestamp) return NextResponse.json({ ok: false, error: 'The submitted capture must be later than the frozen baseline.' }, { status: 422 });
    const [baseline, later] = await Promise.all([fetchSnapshot(baselineUrl), fetchSnapshot(newUrl)]);
    const presentInNew = containsNormalized(later.text, passage);
    const absentFromBaseline = !containsNormalized(baseline.text, passage);
    return NextResponse.json({ ok: presentInNew && absentFromBaseline, presentInNew, absentFromBaseline, source: baseline.original, captureTime: later.timestamp, baselineDigest: baseline.digest, newDigest: later.digest, error: presentInNew && absentFromBaseline ? undefined : 'Code checks failed; no validator judgment is needed.' });
  } catch (cause) {
    return NextResponse.json({ ok: false, error: cause instanceof Error ? cause.message : 'Archive preflight failed.' }, { status: 422 });
  }
}
