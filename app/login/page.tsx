'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import QRCode from 'react-qr-code';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Download,
  Italic,
  Link as LinkIcon,
  Loader2,
  Menu,
  MoreHorizontal,
  PaintBucket,
  Printer,
  Redo,
  RotateCcw,
  Share,
  Type,
  Underline,
  Undo,
} from 'lucide-react';
import SyncStatusBadge from '../../components/SyncStatusBadge';
import { useTelegramAuthContext } from '../../components/TelegramAuthProvider';

const LABEL_W = 160;
const VALUE_W = 420;
const STATUS_W = 120;

type LoginMode = 'qr' | 'phone';

export default function LoginPage() {
  const router = useRouter();
  const {
    step,
    connected,
    error,
    user,
    submitting,
    qrUrl,
    passwordHint,
    startQrAuth,
    usePhoneAuth,
    sendPhone,
    sendCode,
    sendPassword,
    clearError,
  } = useTelegramAuthContext();

  const [mode, setMode] = useState<LoginMode>('qr');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');

  const phoneRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === 'phone' || step === 'code') setMode('phone');
    if (step === 'qr') setMode('qr');
  }, [step]);

  useEffect(() => {
    if (step === 'ready') {
      router.replace('/chats');
    }
  }, [step, router]);

  useEffect(() => {
    if (connected && mode === 'qr' && step === 'qr' && !qrUrl && !submitting) {
      startQrAuth();
    }
  }, [connected, mode, step, qrUrl, submitting, startQrAuth]);

  useEffect(() => {
    if (step === 'phone') phoneRef.current?.focus();
    if (step === 'code') codeRef.current?.focus();
    if (step === 'password') passwordRef.current?.focus();
  }, [step]);

  const switchToPhone = () => {
    setMode('phone');
    usePhoneAuth();
  };

  const switchToQr = () => {
    setMode('qr');
    startQrAuth();
  };

  const displayName = user
    ? [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || 'User'
    : 'Guest';

  const showQr = mode === 'qr' && step !== 'password';
  const showPhone = mode === 'phone' && step !== 'password';
  const showPassword = step === 'password';
  const isReady = step === 'ready';

  return (
    <div className="flex flex-col h-screen bg-white text-sm font-sans">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-4">
          <div className="bg-green-600 p-2 rounded-sm">
            <Menu className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-lg text-gray-700 font-medium px-1">Workspace setup</span>
            <SyncStatusBadge />
            <div className="flex gap-4 text-xs text-gray-600 mt-1">
              {['File', 'Edit', 'View', 'Insert', 'Format', 'Data', 'Tools', 'Extensions', 'Help'].map((m) => (
                <span key={m} className="hover:bg-gray-100 px-1 rounded cursor-default">
                  {m}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <RotateCcw className="w-5 h-5 text-gray-400" />
          <button
            type="button"
            className="flex items-center gap-2 bg-blue-100 text-blue-800 px-4 py-2 rounded-full font-medium"
            aria-hidden
          >
            <Share className="w-4 h-4" />
            Share
          </button>
          <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold text-xs">
            {displayName.charAt(0).toUpperCase()}
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-1 px-4 py-1 bg-[#edf2fa] rounded-2xl mx-2 my-1 overflow-x-auto shrink-0">
        {[Undo, Redo, Printer, PaintBucket, Bold, Italic, Underline, Type, AlignLeft, AlignCenter, AlignRight, LinkIcon, Download, MoreHorizontal].map(
          (Icon, i) => (
            <button key={i} type="button" className="p-1.5 text-gray-700" aria-hidden>
              <Icon className="w-4 h-4" />
            </button>
          ),
        )}
      </div>

      {/* Formula bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-300 bg-white shrink-0">
        <div className="text-gray-500 font-bold w-8 text-center bg-gray-100 rounded border border-gray-200 text-xs">
          fx
        </div>
        <div className="w-px h-5 bg-gray-300" />
        <span className="flex-1 text-gray-500 text-sm truncate">
          {isReady
            ? 'Workspace linked — opening spreadsheet…'
            : showPassword
              ? 'Enter encryption key to unlock workspace'
              : showPhone
                ? 'Enter recovery credentials below'
                : 'Scan pairing matrix with mobile Telegram app'}
        </span>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto bg-[#f8f9fa]">
        <div className="min-w-[720px] bg-white border-b border-gray-200">
          {/* Column headers */}
          <div className="flex h-6 border-b border-gray-300">
            <div className="w-10 bg-[#f8f9fa] border-r border-gray-300" />
            <div className="bg-[#f8f9fa] border-r border-gray-300 font-bold text-gray-500 text-xs flex items-center justify-center" style={{ width: LABEL_W }}>A</div>
            <div className="bg-[#f8f9fa] border-r border-gray-300 font-bold text-gray-500 text-xs flex items-center justify-center flex-1">B</div>
            <div className="bg-[#f8f9fa] border-r border-gray-300 font-bold text-gray-500 text-xs flex items-center justify-center" style={{ width: STATUS_W }}>C</div>
          </div>

          <GridRow n={1} labelW={LABEL_W} statusW={STATUS_W} header>
            <span className="text-gray-500 font-medium">Field</span>
            <span className="text-gray-500 font-medium">Value</span>
            <span className="text-gray-500 font-medium">Status</span>
          </GridRow>

          <GridRow n={2} labelW={LABEL_W} statusW={STATUS_W}>
            <span>Cloud sync</span>
            <span className={connected ? 'text-green-700 font-medium' : 'text-amber-600'}>
              {!connected ? 'Connecting…' : isReady ? 'Synced' : 'Connected'}
            </span>
            <span className="text-gray-500">{connected ? 'Online' : 'Waiting'}</span>
          </GridRow>

          {/* QR mode */}
          {showQr && (
            <GridRow n={3} labelW={LABEL_W} statusW={STATUS_W} tall={220}>
              <span className="self-start pt-3">Device pairing</span>
              <div className="flex flex-col items-center justify-center py-4 gap-3 w-full">
                <div className="bg-white p-3 border-2 border-blue-500 rounded shadow-sm">
                  {qrUrl ? (
                    <QRCode value={qrUrl} size={160} />
                  ) : (
                    <div className="w-40 h-40 flex flex-col items-center justify-center gap-2 text-gray-400">
                      <Loader2 className="w-6 h-6 animate-spin" />
                      <span className="text-xs">Generating pairing matrix…</span>
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-500 text-center leading-relaxed max-w-xs">
                  Open Telegram → <strong>Settings</strong> → <strong>Devices</strong> → <strong>Link Desktop Device</strong>, then scan the code above.
                </p>
                <div className="flex gap-3 mt-1">
                  <button
                    type="button"
                    onClick={startQrAuth}
                    disabled={!connected || submitting}
                    className="text-xs text-green-700 hover:text-green-800 hover:underline disabled:text-gray-400"
                  >
                    Refresh pairing
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    type="button"
                    onClick={switchToPhone}
                    disabled={!connected}
                    className="text-xs text-gray-600 hover:text-gray-800 hover:underline disabled:text-gray-400"
                  >
                    Use recovery number instead
                  </button>
                </div>
              </div>
              <span className="self-start pt-3 text-green-700 font-medium text-xs">Scan required</span>
            </GridRow>
          )}

          {/* Phone mode */}
          {showPhone && (
            <>
              <GridRow n={4} labelW={LABEL_W} statusW={STATUS_W} highlight={step === 'phone'}>
                <span>Recovery number</span>
                <input
                  ref={phoneRef}
                  type="text"
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); clearError(); }}
                  onKeyDown={(e) => e.key === 'Enter' && sendPhone(phone)}
                  disabled={!connected || step !== 'phone' || submitting}
                  placeholder="+15551234567"
                  className="w-full outline-none bg-transparent disabled:text-gray-400"
                />
                <span className={step === 'phone' ? 'text-green-700 font-medium' : 'text-gray-500'}>
                  {step === 'phone' ? 'Required' : 'Pending'}
                </span>
              </GridRow>

              <GridRow n={5} labelW={LABEL_W} statusW={STATUS_W} highlight={step === 'code'}>
                <span>Verification code</span>
                <input
                  ref={codeRef}
                  type="text"
                  value={code}
                  onChange={(e) => { setCode(e.target.value); clearError(); }}
                  onKeyDown={(e) => e.key === 'Enter' && sendCode(code)}
                  disabled={!connected || step !== 'code' || submitting}
                  placeholder="Code from SMS or app"
                  className="w-full outline-none bg-transparent disabled:text-gray-400"
                />
                <span className={step === 'code' ? 'text-green-700 font-medium' : 'text-gray-500'}>
                  {step === 'code' ? 'Required' : 'Pending'}
                </span>
              </GridRow>

              <GridRow n={6} labelW={LABEL_W} statusW={STATUS_W}>
                <span />
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={step === 'code' ? () => sendCode(code) : () => sendPhone(phone)}
                    disabled={!connected || submitting || (step === 'phone' ? !phone.trim() : !code.trim())}
                    className="px-3 py-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white text-xs font-medium rounded-sm"
                  >
                    {step === 'code' ? 'Confirm code' : 'Send verification'}
                  </button>
                  <button
                    type="button"
                    onClick={switchToQr}
                    className="text-xs text-gray-500 hover:underline"
                  >
                    Use pairing code
                  </button>
                </div>
                <span className="text-gray-400 text-xs">Press Enter</span>
              </GridRow>
            </>
          )}

          {/* 2FA */}
          {showPassword && (
            <>
              <GridRow n={7} labelW={LABEL_W} statusW={STATUS_W} highlight>
                <span>Encryption key</span>
                <input
                  ref={passwordRef}
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); clearError(); }}
                  onKeyDown={(e) => e.key === 'Enter' && sendPassword(password)}
                  disabled={!connected || submitting}
                  placeholder={passwordHint ? `Hint: ${passwordHint}` : '2FA password'}
                  className="w-full outline-none bg-transparent"
                />
                <span className="text-green-700 font-medium">Required</span>
              </GridRow>
              <GridRow n={8} labelW={LABEL_W} statusW={STATUS_W}>
                <span />
                <button
                  type="button"
                  onClick={() => sendPassword(password)}
                  disabled={!connected || submitting || !password}
                  className="px-3 py-1 w-fit bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white text-xs font-medium rounded-sm"
                >
                  Unlock workspace
                </button>
                <span className="text-gray-400 text-xs">Press Enter</span>
              </GridRow>
            </>
          )}

          {isReady && (
            <GridRow n={9} labelW={LABEL_W} statusW={STATUS_W}>
              <span>Workspace</span>
              <span className="text-green-700 font-medium flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Opening spreadsheet…
              </span>
              <span className="text-green-700">Ready</span>
            </GridRow>
          )}

          {error && (
            <GridRow n={10} labelW={LABEL_W} statusW={STATUS_W}>
              <span>Notice</span>
              <span className="text-red-600">{error}</span>
              <span className="text-red-500">Error</span>
            </GridRow>
          )}

          <GridRow n={11} labelW={LABEL_W} statusW={STATUS_W} muted>
            <span>Notes</span>
            <span className="text-gray-500">
              Pairing links this workbook to your cloud workspace. Recommended for fastest sync.
            </span>
            <span />
          </GridRow>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-t border-gray-300 px-2 flex items-center gap-2 h-10 shrink-0">
        <span className="px-4 py-1 text-sm border-b-2 border-green-600 text-green-700 font-medium">Setup</span>
        <span className="px-4 py-1 text-sm text-gray-400">Sheet1</span>
        <span className="px-4 py-1 text-sm text-gray-400">Sheet2</span>
      </div>
    </div>
  );
}

function GridRow({
  n,
  labelW,
  statusW,
  children,
  tall,
  header,
  highlight,
  muted,
}: {
  n: number;
  labelW: number;
  statusW: number;
  children: React.ReactNode;
  tall?: number;
  header?: boolean;
  highlight?: boolean;
  muted?: boolean;
}) {
  const cells = Array.isArray(children) ? children : [children];
  const h = tall ?? 28;

  return (
    <div className="flex border-b border-gray-200" style={{ minHeight: h }}>
      <div className="w-10 shrink-0 flex items-start justify-center pt-1 bg-[#f8f9fa] border-r border-gray-300 text-xs font-bold text-gray-500">
        {n}
      </div>
      {cells.map((cell, i) => (
        <div
          key={i}
          className={`flex items-center px-2 text-sm relative ${
            muted ? 'bg-[#fafafa] text-gray-500' : 'bg-white'
          } ${i === 0 ? 'border-r border-gray-200' : ''} ${i === 1 ? 'flex-1 border-r border-gray-200' : ''}`}
          style={i === 0 ? { width: labelW } : i === 2 ? { width: statusW } : undefined}
        >
          {highlight && i === 1 && (
            <div className="absolute inset-0 border-2 border-blue-500 pointer-events-none" />
          )}
          <div className="relative z-10 w-full py-1">{cell}</div>
        </div>
      ))}
    </div>
  );
}
