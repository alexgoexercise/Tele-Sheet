export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startTelegramBridge } = await import('./lib/telegram-bridge');
    await startTelegramBridge();
  }
}
