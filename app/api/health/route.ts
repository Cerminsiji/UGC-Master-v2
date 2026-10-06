import { NextResponse } from 'next/server';
import { CANDIDATE_MODELS } from '@/lib/gemini-ugc';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    hasApiKey: Boolean(process.env.GEMINI_API_KEY || process.env.API_KEY),
    models: CANDIDATE_MODELS,
  });
}
