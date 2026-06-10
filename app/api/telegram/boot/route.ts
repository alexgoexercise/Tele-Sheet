import { startTelegramBridge } from '../../../../lib/telegram-bridge';

export const runtime = 'nodejs';

export async function GET() {
  await startTelegramBridge();
  return Response.json({ ok: true });
}
