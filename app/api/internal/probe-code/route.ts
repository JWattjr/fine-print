import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (process.env.NODE_ENV !== 'development') return new NextResponse(null, { status: 404 });
  const source = await readFile(resolve(process.cwd(), 'contracts', 'archive_probe.py'), 'utf8');
  return NextResponse.json({ code: source, sha256: createHash('sha256').update(source).digest('hex') });
}
