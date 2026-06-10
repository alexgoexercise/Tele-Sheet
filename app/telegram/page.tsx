'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

const WS_URL = process.env.NEXT_PUBLIC_TELEGRAM_WS_URL ?? 'ws://127.0.0.1:8765/ws';

export default function TelegramPage() {
  const [log, setLog] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const wsRef = useRef<WebSocket | null>(null);

  const append = useCallback((line: string) => {
    setLog((prev) => [...prev.slice(-200), line]);
  }, []);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      append('[ws] connected');
    };
    ws.onclose = () => {
      setConnected(false);
      append('[ws] disconnected');
    };
    ws.onerror = () => append('[ws] error');
    ws.onmessage = (ev) => {
      append(ev.data as string);
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [append]);

  const send = (payload: object) => {
    const w = wsRef.current;
    if (!w || w.readyState !== WebSocket.OPEN) {
      append('[ws] not connected');
      return;
    }
    w.send(JSON.stringify(payload));
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 font-sans">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold tracking-tight">Local Telegram (Teleproto)</h1>
          <Link href="/" className="text-sm text-zinc-400 hover:text-zinc-200 underline-offset-4 hover:underline">
            Spreadsheet
          </Link>
        </div>

        <p className="text-sm text-zinc-400 leading-relaxed">
          Start the app with <code className="text-zinc-300">npm run dev</code> — the Teleproto bridge starts
          automatically. Set <code className="text-zinc-300">TELEGRAM_API_ID</code> and{' '}
          <code className="text-zinc-300">TELEGRAM_API_HASH</code> in <code className="text-zinc-300">.env</code> (from{' '}
          <a
            href="https://my.telegram.org"
            className="text-sky-400 hover:text-sky-300 underline-offset-4 hover:underline"
          >
            my.telegram.org
          </a>
          ). Then sign in below; TDLib updates stream into the log as JSON.
        </p>

        <div className="text-xs text-zinc-500">
          WebSocket: {WS_URL} —{' '}
          <span className={connected ? 'text-emerald-400' : 'text-amber-400'}>
            {connected ? 'connected' : 'disconnected'}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 border border-zinc-800 rounded-lg p-4 bg-zinc-900/50">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-400">Phone (E.164)</span>
            <input
              className="rounded bg-zinc-950 border border-zinc-700 px-2 py-1.5 text-zinc-100"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+15551234567"
            />
            <button
              type="button"
              className="mt-1 rounded bg-sky-600 hover:bg-sky-500 text-white text-xs py-1.5"
              onClick={() => send({ method: 'setAuthenticationPhoneNumber', phone_number: phone.trim() })}
            >
              Send phone
            </button>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-400">SMS / Telegram code</span>
            <input
              className="rounded bg-zinc-950 border border-zinc-700 px-2 py-1.5 text-zinc-100"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="12345"
            />
            <button
              type="button"
              className="mt-1 rounded bg-sky-600 hover:bg-sky-500 text-white text-xs py-1.5"
              onClick={() => send({ method: 'checkAuthenticationCode', code: code.trim() })}
            >
              Send code
            </button>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-400">2FA password</span>
            <input
              type="password"
              className="rounded bg-zinc-950 border border-zinc-700 px-2 py-1.5 text-zinc-100"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="if required"
            />
            <button
              type="button"
              className="mt-1 rounded bg-sky-600 hover:bg-sky-500 text-white text-xs py-1.5"
              onClick={() => send({ method: 'checkAuthenticationPassword', password })}
            >
              Send password
            </button>
          </label>
        </div>

        <div>
          <div className="text-xs text-zinc-500 mb-2">TDLib updates (JSON)</div>
          <pre className="text-xs font-mono bg-zinc-900 border border-zinc-800 rounded-lg p-3 max-h-[50vh] overflow-auto whitespace-pre-wrap break-all">
            {log.length === 0 ? '…' : log.join('\n')}
          </pre>
        </div>
      </div>
    </div>
  );
}
