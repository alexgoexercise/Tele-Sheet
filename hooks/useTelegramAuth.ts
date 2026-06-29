'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { WsCommand, WsUpdate } from '../lib/telegram-api-types';

export const TELEGRAM_WS_URL =
  process.env.NEXT_PUBLIC_TELEGRAM_WS_URL ?? 'ws://127.0.0.1:8765/ws';

export type { WsCommand, WsUpdate };

const MAX_RETRIES = 15;
const RETRY_MS = 600;

export type AuthStep = 'connecting' | 'qr' | 'phone' | 'code' | 'password' | 'ready';

export type TelegramUser = {
  id: string;
  first_name: string;
  last_name: string;
  username: string;
  phone_number: string;
};

function authStepFromState(stateType: string | undefined): AuthStep {
  switch (stateType) {
    case 'authorizationStateWaitQrCode':
      return 'qr';
    case 'authorizationStateWaitPhoneNumber':
      return 'phone';
    case 'authorizationStateWaitCode':
      return 'code';
    case 'authorizationStateWaitPassword':
      return 'password';
    case 'authorizationStateReady':
      return 'ready';
    default:
      return 'qr';
  }
}

async function ensureBridgeStarted() {
  try {
    await fetch('/api/telegram/boot');
  } catch {
    // boot route may fail before server is ready; ws retry handles that
  }
}

export function useTelegramAuth() {
  const [step, setStep] = useState<AuthStep>('connecting');
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<TelegramUser | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [passwordHint, setPasswordHint] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateListenersRef = useRef<Set<(update: WsUpdate) => void>>(new Set());
  const signingOutRef = useRef(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [sessionRestorePending, setSessionRestorePending] = useState(true);

  const clearSigningOut = useCallback(() => {
    signingOutRef.current = false;
    setIsSigningOut(false);
  }, []);

  const send = useCallback((payload: object) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setError('Not connected to workspace server. Is the app running?');
      return false;
    }
    ws.send(JSON.stringify(payload));
    return true;
  }, []);

  const handleMessage = useCallback((raw: string) => {
    let update: WsUpdate;
    try {
      update = JSON.parse(raw) as WsUpdate;
    } catch {
      return;
    }

    for (const listener of updateListenersRef.current) {
      listener(update);
    }

    if (update['@type'] === 'updateAuthorizationState') {
      const next = authStepFromState(update.authorization_state?.['@type']);
      setStep(next);
      if (update.authorization_state?.password_hint) {
        setPasswordHint(update.authorization_state.password_hint);
      }
      if (next !== 'ready') {
        setSubmitting(false);
      }
    }

    if (update['@type'] === 'updateQrCode' && update.token) {
      setQrUrl(update.token);
      setStep('qr');
      setError(null);
    }

    if (update['@type'] === 'updateUser' && update.user) {
      setUser(update.user);
      setStep('ready');
      setSubmitting(false);
      setSessionRestorePending(false);
    }

    if (update['@type'] === 'updateLoggedOut') {
      clearSigningOut();
      setUser(null);
      setQrUrl(null);
      setStep('qr');
      setSubmitting(false);
    }

    if (update['@type'] === 'error') {
      if (update.message === 'not authorized') {
        setUser(null);
        setQrUrl(null);
        setStep('qr');
      }
      setError(update.message ?? 'Something went wrong');
      setSubmitting(false);
    }
  }, [clearSigningOut]);

  const connectWs = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(TELEGRAM_WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      retriesRef.current = 0;
      setConnected(true);
      setError(null);
      void (async () => {
        await ensureBridgeStarted();
        send({ method: 'getAuthState' });
      })();
    };

    ws.onclose = () => {
      setConnected(false);
      setSubmitting(false);

      if (retriesRef.current < MAX_RETRIES) {
        retriesRef.current += 1;
        retryTimerRef.current = setTimeout(connectWs, RETRY_MS);
      } else {
        setError('Could not connect to workspace server. Restart the app and try again.');
        setStep('connecting');
      }
    };

    ws.onerror = () => {
      setConnected(false);
    };

    ws.onmessage = (ev) => handleMessage(ev.data as string);
  }, [handleMessage, send]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      await ensureBridgeStarted();
      if (!cancelled) connectWs();
    })();

    return () => {
      cancelled = true;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connectWs]);

  useEffect(() => {
    if (isSigningOut && step !== 'ready' && step !== 'connecting') {
      clearSigningOut();
    }
  }, [isSigningOut, step, clearSigningOut]);

  const refreshAuthState = useCallback(() => {
    send({ method: 'getAuthState' });
  }, [send]);

  // Keep trying to restore a saved server-side session after tab reopen.
  useEffect(() => {
    setSessionRestorePending(true);
    const grace = setTimeout(() => setSessionRestorePending(false), 20000);
    return () => clearTimeout(grace);
  }, []);

  useEffect(() => {
    if (!connected || user || step === 'ready') return;
    if (step === 'phone' || step === 'code' || step === 'password') return;

    refreshAuthState();
    const id = setInterval(refreshAuthState, 2000);
    const stop = setTimeout(() => clearInterval(id), 20000);
    return () => {
      clearInterval(id);
      clearTimeout(stop);
    };
  }, [connected, user, step, refreshAuthState]);

  const startQrAuth = useCallback(() => {
    setError(null);
    setQrUrl(null);
    setSubmitting(true);
    if (!send({ method: 'startQrAuth' })) {
      setSubmitting(false);
    }
  }, [send]);

  const usePhoneAuth = useCallback(() => {
    setError(null);
    setQrUrl(null);
    setSubmitting(false);
    send({ method: 'cancelQrAuth' });
    setStep('phone');
  }, [send]);

  const sendPhone = useCallback(
    (phone: string) => {
      setError(null);
      setSubmitting(true);
      if (!send({ method: 'setAuthenticationPhoneNumber', phone_number: phone.trim() })) {
        setSubmitting(false);
      }
    },
    [send],
  );

  const sendCode = useCallback(
    (code: string) => {
      setError(null);
      setSubmitting(true);
      if (!send({ method: 'checkAuthenticationCode', code: code.trim() })) {
        setSubmitting(false);
      }
    },
    [send],
  );

  const sendPassword = useCallback(
    (password: string) => {
      setError(null);
      setSubmitting(true);
      if (!send({ method: 'checkAuthenticationPassword', password })) {
        setSubmitting(false);
      }
    },
    [send],
  );

  const logout = useCallback(
    (options?: { onNavigate?: () => void }) => {
      signingOutRef.current = true;
      setIsSigningOut(true);
      setUser(null);
      setQrUrl(null);
      setStep('qr');
      setSubmitting(false);
      setError(null);
      send({ method: 'logOut' });
      options?.onNavigate?.();
    },
    [send],
  );

  const sendCommand = useCallback(
    (cmd: WsCommand) => send(cmd),
    [send],
  );

  const subscribeUpdates = useCallback((listener: (update: WsUpdate) => void) => {
    updateListenersRef.current.add(listener);
    return () => {
      updateListenersRef.current.delete(listener);
    };
  }, []);

  return {
    step,
    connected,
    error,
    user,
    isSigningOut,
    sessionRestorePending,
    submitting,
    qrUrl,
    passwordHint,
    startQrAuth,
    usePhoneAuth,
    sendPhone,
    sendCode,
    sendPassword,
    logout,
    sendCommand,
    subscribeUpdates,
    clearError: () => setError(null),
    refreshAuthState,
  };
}
