import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { Api, TelegramClient, events, sessions } from 'teleproto';
import type { Dialog } from 'teleproto/tl/custom/dialog.js';
import { getDisplayName, getPeerId } from 'teleproto/Utils';
import { WebSocket, WebSocketServer } from 'ws';

const { StringSession } = sessions;
const { NewMessage, EditedMessage, DeletedMessage, MessageRead } = events;

type TdUpdate = Record<string, unknown>;

type WsCommand = {
  method: string;
  phone_number?: string;
  code?: string;
  password?: string;
  chat_id?: string | number;
  message?: string;
  message_id?: number;
  message_ids?: number[];
  reply_to?: number;
  limit?: number;
  offset_id?: number;
  search?: string;
  revoke?: boolean;
  archived?: boolean;
};

type BridgeGlobal = typeof globalThis & {
  __teleSheetBridgeStarted?: boolean;
};

const bridgeGlobal = globalThis as BridgeGlobal;

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH ?? '';
const port = Number(process.env.TELEGRAM_BRIDGE_PORT ?? 8765);
const dataDir = process.env.TELEPROTO_DATA_DIR ?? path.join(process.cwd(), 'teleproto_data');
const sessionPath = path.join(dataDir, 'session.txt');

const wsClients = new Set<WebSocket>();

let client: TelegramClient | undefined;
let eventHandlersRegistered = false;
let authInProgress = false;

let phoneResolve: ((value: string) => void) | null = null;
let codeResolve: ((value: string) => void) | null = null;
let passwordResolve: ((value: string) => void) | null = null;

let pendingPhone: string | null = null;
let currentAuthState = 'authorizationStateWaitQrCode';
let clientReady = false;
let qrAbortController: AbortController | null = null;
let qrPasswordResolve: ((value: string) => void) | null = null;
let lastQrUpdate: TdUpdate | null = null;

function broadcast(update: TdUpdate) {
  const payload = JSON.stringify(update);
  for (const ws of wsClients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

function authState(type: string, extra: Record<string, unknown> = {}) {
  currentAuthState = type;
  broadcast({
    '@type': 'updateAuthorizationState',
    authorization_state: { '@type': type, ...extra },
  });
}

async function getAuthSnapshot(): Promise<TdUpdate> {
  if (clientReady && client?.connected && (await client.isUserAuthorized())) {
    return {
      '@type': 'updateAuthorizationState',
      authorization_state: { '@type': 'authorizationStateReady' },
    };
  }
  return {
    '@type': 'updateAuthorizationState',
    authorization_state: { '@type': currentAuthState },
  };
}

function sendToClient(ws: WebSocket, update: TdUpdate) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(update));
  }
}

function loadSession(): string {
  try {
    return fs.readFileSync(sessionPath, 'utf8').trim();
  } catch {
    return '';
  }
}

function saveSession() {
  if (!client) return;
  const session = client.session.save() as unknown as string;
  fs.writeFileSync(sessionPath, session, 'utf8');
}

const CREDENTIALS_ERROR =
  'Telegram API credentials missing. Create a .env file with TELEGRAM_API_ID and TELEGRAM_API_HASH from https://my.telegram.org';

function credentialsConfigured() {
  return Boolean(apiId && apiHash);
}

async function ensureClientBootstrapped(): Promise<boolean> {
  if (!credentialsConfigured()) {
    broadcast({ '@type': 'error', message: CREDENTIALS_ERROR });
    return false;
  }
  if (!client) {
    try {
      await bootstrapClient();
    } catch (err) {
      broadcast({ '@type': 'error', message: `Bridge bootstrap failed: ${String(err)}` });
      return false;
    }
  }
  return true;
}

function serializeUser(user: Api.User) {
  return {
    id: user.id?.toString(),
    first_name: user.firstName ?? '',
    last_name: user.lastName ?? '',
    username: user.username ?? '',
    phone_number: user.phone ?? '',
  };
}

function serializeDialog(dialog: Dialog) {
  const chatId = dialog.id?.toString() ?? '';
  return {
    id: chatId,
    chat_id: chatId,
    title: dialog.title ?? dialog.name ?? '',
    unread_count: dialog.unreadCount ?? 0,
    last_message_date: dialog.date ?? 0,
    is_group: dialog.isGroup,
    is_user: dialog.isUser,
    archived: dialog.archived,
    pinned: dialog.pinned,
  };
}

type MessageLike = {
  id?: number;
  date?: number;
  message?: string;
  out?: boolean;
  editDate?: number;
  postAuthor?: string;
  replyTo?: { replyToMsgId?: number };
  chatId?: { toString(): string } | string | number | bigint;
  senderId?: { toString(): string } | string | number | bigint;
  peerId?: Api.TypePeer;
  fromId?: Api.TypePeer;
  sender?: object;
  _sender?: object;
};

async function serializeMessage(message: MessageLike, tg?: TelegramClient) {
  const chatId =
    message.chatId != null
      ? String(message.chatId)
      : message.peerId
        ? getPeerId(message.peerId)
        : undefined;
  const senderId =
    message.senderId != null
      ? String(message.senderId)
      : message.fromId
        ? getPeerId(message.fromId)
        : undefined;

  let sender_name = '';
  let sender_username = '';
  const embeddedSender = message.sender ?? message._sender;
  if (embeddedSender instanceof Api.User) {
    sender_name = getDisplayName(embeddedSender) || embeddedSender.username || '';
    sender_username = embeddedSender.username ?? '';
  } else if (message.postAuthor) {
    sender_name = message.postAuthor;
  } else if (tg && senderId) {
    try {
      const entity = await tg.getEntity(senderId);
      if (entity instanceof Api.User) {
        sender_name = getDisplayName(entity) || entity.username || '';
        sender_username = entity.username ?? '';
      }
    } catch {
      // sender not in entity cache yet
    }
  }

  return {
    id: message.id,
    chat_id: chatId,
    date: message.date,
    text: message.message ?? '',
    sender_id: senderId,
    sender_name: sender_name || undefined,
    sender_username: sender_username || undefined,
    out: message.out ?? false,
    reply_to: message.replyTo?.replyToMsgId,
    edit_date: message.editDate,
    is_edited: Boolean(message.editDate),
  };
}

async function serializeMessages(messages: object[], tg: TelegramClient) {
  return Promise.all(messages.map((m) => serializeMessage(m as MessageLike, tg)));
}

function serializeChat(entity: object) {
  const e = entity as {
    className?: string;
    title?: string;
    firstName?: string;
    lastName?: string;
    username?: string;
    broadcast?: boolean;
  };
  const chatId = getPeerId(entity as Parameters<typeof getPeerId>[0]);

  const title = e.title
    ? e.title
    : e.firstName
      ? [e.firstName, e.lastName].filter(Boolean).join(' ')
      : e.username ?? chatId;

  return {
    id: chatId,
    title,
    username: e.username ?? undefined,
    is_group: e.className === 'Chat' || (e.className === 'Channel' && !e.broadcast),
    is_user: e.className === 'User',
    is_channel: e.className === 'Channel',
  };
}

function chatIdFromEntity(entity: object): string {
  return getPeerId(entity as Parameters<typeof getPeerId>[0]);
}

async function requireAuth(ws: WebSocket): Promise<TelegramClient | null> {
  if (!client) {
    sendToClient(ws, { '@type': 'error', message: CREDENTIALS_ERROR });
    return null;
  }
  if (!(await client.isUserAuthorized())) {
    sendToClient(ws, { '@type': 'error', message: 'not authorized' });
    return null;
  }
  return client;
}

async function resolveChat(chatId: string | number) {
  return getClient().getEntity(String(chatId));
}

function registerEventHandlers() {
  if (eventHandlersRegistered || !client) return;
  eventHandlersRegistered = true;

  client.addEventHandler(async (event) => {
    const message = event.message;
    if (!message || !client) return;
    const serialized = await serializeMessage(message as MessageLike, client);
    broadcast({
      '@type': 'updateNewMessage',
      message: serialized,
    });
  }, new NewMessage({}));

  client.addEventHandler(async (event) => {
    const message = event.message;
    if (!message || !client) return;
    broadcast({
      '@type': 'updateMessageEdited',
      message: await serializeMessage(message as MessageLike, client),
    });
  }, new EditedMessage({}));

  client.addEventHandler(async (event) => {
    const chatId =
      event.peer != null
        ? String(event.peer)
        : 'channelId' in event.originalUpdate
          ? String(event.originalUpdate.channelId)
          : undefined;
    broadcast({
      '@type': 'updateMessagesDeleted',
      chat_id: chatId,
      message_ids: event.deletedIds,
    });
  }, new DeletedMessage({}));

  client.addEventHandler(async (event) => {
    const chatId =
      'channelId' in event.originalUpdate
        ? String(event.originalUpdate.channelId)
        : 'peer' in event.originalUpdate && event.originalUpdate.peer
          ? getPeerId(event.originalUpdate.peer as Api.TypePeer)
          : undefined;
    broadcast({
      '@type': 'updateMessageRead',
      chat_id: chatId,
      max_id: event.maxId,
      outbox: event.outbox,
    });
  }, new MessageRead({}));
}

function getClient(): TelegramClient {
  if (!client) {
    throw new Error(CREDENTIALS_ERROR);
  }
  return client;
}

async function ensureConnected() {
  const tg = getClient();
  if (!tg.connected) {
    await tg.connect();
  }
}

function cancelQrAuth() {
  qrAbortController?.abort();
  qrAbortController = null;
}

async function beginQrAuth() {
  if (authInProgress) return;
  if (!(await ensureClientBootstrapped())) return;
  authInProgress = true;

  try {
    await ensureConnected();
    const tg = getClient();

    if (await tg.isUserAuthorized()) {
      authState('authorizationStateReady');
      registerEventHandlers();
      return;
    }

    cancelQrAuth();
    qrAbortController = new AbortController();
    authState('authorizationStateWaitQrCode');

    await tg.signInUserWithQrCode(
      { apiId, apiHash },
      {
        qrCode: async (code) => {
          const token = code.token.toString('base64url');
          lastQrUpdate = {
            '@type': 'updateQrCode',
            token: `tg://login?token=${token}`,
            expires: code.expires,
          };
          broadcast(lastQrUpdate);
        },
        password: async (hint) => {
          authState('authorizationStateWaitPassword', { password_hint: hint ?? '' });
          return new Promise<string>((resolve) => {
            qrPasswordResolve = resolve;
          });
        },
        onError: async (err) => {
          broadcast({ '@type': 'error', message: String(err) });
          return false;
        },
        abortSignal: qrAbortController.signal,
      },
    );

    saveSession();
    authState('authorizationStateReady');
    registerEventHandlers();

    const me = await tg.getMe();
    broadcast({ '@type': 'updateUser', user: serializeUser(me) });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return;
    }
    broadcast({ '@type': 'error', message: String(err) });
  } finally {
    authInProgress = false;
    qrAbortController = null;
  }
}

async function beginPhoneAuth() {
  if (authInProgress) return;
  if (!(await ensureClientBootstrapped())) return;
  authInProgress = true;

  try {
    await ensureConnected();
    const tg = getClient();

    if (await tg.isUserAuthorized()) {
      authState('authorizationStateReady');
      registerEventHandlers();
      return;
    }

    cancelQrAuth();
    authState('authorizationStateWaitPhoneNumber');

    await tg.start({
      phoneNumber: async () => {
        authState('authorizationStateWaitPhoneNumber');
        if (pendingPhone) {
          const phone = pendingPhone;
          pendingPhone = null;
          return phone;
        }
        return new Promise<string>((resolve) => {
          phoneResolve = resolve;
        });
      },
      phoneCode: async () => {
        authState('authorizationStateWaitCode');
        return new Promise<string>((resolve) => {
          codeResolve = resolve;
        });
      },
      password: async () => {
        authState('authorizationStateWaitPassword');
        return new Promise<string>((resolve) => {
          passwordResolve = resolve;
        });
      },
      onError: (err) => {
        broadcast({ '@type': 'error', message: String(err) });
      },
    });

    saveSession();
    authState('authorizationStateReady');
    registerEventHandlers();

    const me = await tg.getMe();
    broadcast({ '@type': 'updateUser', user: serializeUser(me) });
  } catch (err) {
    broadcast({ '@type': 'error', message: String(err) });
  } finally {
    authInProgress = false;
  }
}

async function handleLogout() {
  cancelQrAuth();
  authInProgress = false;
  eventHandlersRegistered = false;

  if (client) {
    try {
      await client.logOut();
    } catch (err) {
      console.warn('logOut error:', err);
    }
    try {
      await client.disconnect();
    } catch {
      // ignore disconnect errors during logout
    }
  }

  try {
    fs.unlinkSync(sessionPath);
  } catch {
    // session file may not exist
  }

  clientReady = false;
  client = new TelegramClient(new StringSession(''), apiId, apiHash, {
    connectionRetries: 5,
  });

  await ensureConnected();
  clientReady = true;

  lastQrUpdate = null;
  broadcast({ '@type': 'updateLoggedOut' });
  void beginQrAuth();
}

async function bootstrapClient() {
  const session = new StringSession(loadSession());
  client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5,
  });

  await ensureConnected();

  clientReady = true;
  const tg = getClient();

  if (await tg.isUserAuthorized()) {
    authState('authorizationStateReady');
    registerEventHandlers();
    const me = await tg.getMe();
    broadcast({ '@type': 'updateUser', user: serializeUser(me) });
  } else {
    void beginQrAuth();
  }
}

async function handleWsCommand(raw: string, ws: WebSocket) {
  let cmd: WsCommand;
  try {
    cmd = JSON.parse(raw) as WsCommand;
  } catch {
    console.warn('invalid ws json:', raw);
    return;
  }

  try {
  switch (cmd.method) {
    case 'startQrAuth': {
      if (authInProgress && lastQrUpdate) {
        sendToClient(ws, lastQrUpdate);
        return;
      }
      void beginQrAuth();
      return;
    }

    case 'cancelQrAuth': {
      cancelQrAuth();
      authInProgress = false;
      authState('authorizationStateWaitPhoneNumber');
      return;
    }

    case 'setAuthenticationPhoneNumber': {
      const phone = cmd.phone_number?.trim();
      if (!phone) {
        console.warn('setAuthenticationPhoneNumber missing phone_number');
        return;
      }
      cancelQrAuth();
      authInProgress = false;
      pendingPhone = phone;
      phoneResolve?.(phone);
      phoneResolve = null;
      void beginPhoneAuth();
      return;
    }

    case 'checkAuthenticationCode': {
      const code = cmd.code?.trim();
      if (!code) {
        console.warn('checkAuthenticationCode missing code');
        return;
      }
      codeResolve?.(code);
      codeResolve = null;
      return;
    }

    case 'checkAuthenticationPassword': {
      const password = cmd.password ?? '';
      if (!password) {
        console.warn('checkAuthenticationPassword missing password');
        return;
      }
      passwordResolve?.(password);
      passwordResolve = null;
      qrPasswordResolve?.(password);
      qrPasswordResolve = null;
      return;
    }

    case 'logOut': {
      await handleLogout();
      return;
    }

    case 'getAuthState': {
      sendToClient(ws, await getAuthSnapshot());
      return;
    }

    case 'getMe': {
      const tg = await requireAuth(ws);
      if (!tg) return;
      const me = await tg.getMe();
      sendToClient(ws, { '@type': 'updateUser', user: serializeUser(me) });
      return;
    }

    case 'getDialogs': {
      const tg = await requireAuth(ws);
      if (!tg) return;
      const limit = cmd.limit ?? 50;
      const dialogs = await tg.getDialogs(
        cmd.archived === true ? { limit, folder: 1 } : { limit, folder: 0 },
      );
      sendToClient(ws, {
        '@type': 'updateDialogs',
        dialogs: dialogs.map((d) => serializeDialog(d)),
      });
      return;
    }

    case 'getChat': {
      const tg = await requireAuth(ws);
      if (!tg) return;
      if (cmd.chat_id === undefined || cmd.chat_id === '') {
        sendToClient(ws, { '@type': 'error', message: 'getChat requires chat_id' });
        return;
      }
      const entity = await resolveChat(cmd.chat_id);
      sendToClient(ws, {
        '@type': 'updateChat',
        chat: serializeChat(entity),
      });
      return;
    }

    case 'getMessages': {
      const tg = await requireAuth(ws);
      if (!tg) return;
      if (cmd.chat_id === undefined || cmd.chat_id === '') {
        sendToClient(ws, { '@type': 'error', message: 'getMessages requires chat_id' });
        return;
      }
      const entity = await resolveChat(cmd.chat_id);
      const chatId = chatIdFromEntity(entity);
      const messages = await tg.getMessages(entity, {
        limit: cmd.limit ?? 30,
        offsetId: cmd.offset_id ?? 0,
        search: cmd.search,
      });
      sendToClient(ws, {
        '@type': 'updateMessages',
        chat_id: chatId,
        messages: await serializeMessages(messages, tg),
      });
      return;
    }

    case 'sendMessage': {
      const tg = await requireAuth(ws);
      if (!tg) return;
      const text = cmd.message?.trim();
      if (!text) {
        sendToClient(ws, { '@type': 'error', message: 'sendMessage requires message' });
        return;
      }
      if (cmd.chat_id === undefined || cmd.chat_id === '') {
        sendToClient(ws, { '@type': 'error', message: 'sendMessage requires chat_id' });
        return;
      }
      const entity = await resolveChat(cmd.chat_id);
      const chatId = chatIdFromEntity(entity);
      const sent = await tg.sendMessage(entity, {
        message: text,
        replyTo: cmd.reply_to,
      });
      sendToClient(ws, {
        '@type': 'updateMessageSendSucceeded',
        chat_id: chatId,
        message: await serializeMessage(sent as MessageLike, tg),
      });
      return;
    }

    case 'editMessage': {
      const tg = await requireAuth(ws);
      if (!tg) return;
      const text = cmd.message?.trim();
      if (!text || cmd.message_id == null) {
        sendToClient(ws, { '@type': 'error', message: 'editMessage requires message_id and message' });
        return;
      }
      if (cmd.chat_id === undefined || cmd.chat_id === '') {
        sendToClient(ws, { '@type': 'error', message: 'editMessage requires chat_id' });
        return;
      }
      const entity = await resolveChat(cmd.chat_id);
      const edited = await tg.editMessage(entity, {
        message: cmd.message_id,
        text,
      });
      sendToClient(ws, {
        '@type': 'updateMessageEdited',
        message: await serializeMessage(edited as MessageLike, tg),
      });
      return;
    }

    case 'deleteMessages': {
      const tg = await requireAuth(ws);
      if (!tg) return;
      if (!cmd.message_ids?.length) {
        sendToClient(ws, { '@type': 'error', message: 'deleteMessages requires message_ids' });
        return;
      }
      if (cmd.chat_id === undefined || cmd.chat_id === '') {
        sendToClient(ws, { '@type': 'error', message: 'deleteMessages requires chat_id' });
        return;
      }
      const entity = await resolveChat(cmd.chat_id);
      const chatId = chatIdFromEntity(entity);
      await tg.deleteMessages(entity, cmd.message_ids, { revoke: cmd.revoke ?? true });
      sendToClient(ws, {
        '@type': 'updateMessagesDeleted',
        chat_id: chatId,
        message_ids: cmd.message_ids,
      });
      return;
    }

    case 'markAsRead': {
      const tg = await requireAuth(ws);
      if (!tg) return;
      if (cmd.chat_id === undefined || cmd.chat_id === '') {
        sendToClient(ws, { '@type': 'error', message: 'markAsRead requires chat_id' });
        return;
      }
      const entity = await resolveChat(cmd.chat_id);
      const chatId = chatIdFromEntity(entity);
      const success = await tg.markAsRead(
        entity,
        cmd.message_id != null ? cmd.message_id : undefined,
      );
      sendToClient(ws, {
        '@type': 'updateMarkAsRead',
        chat_id: chatId,
        success,
      });
      return;
    }

    case 'openChat': {
      const tg = await requireAuth(ws);
      if (!tg) return;
      if (cmd.chat_id === undefined || cmd.chat_id === '') {
        sendToClient(ws, { '@type': 'error', message: 'openChat requires chat_id' });
        return;
      }
      const entity = await resolveChat(cmd.chat_id);
      const chatId = chatIdFromEntity(entity);
      sendToClient(ws, {
        '@type': 'updateChat',
        chat: serializeChat(entity),
      });
      const messages = await tg.getMessages(entity, { limit: cmd.limit ?? 30 });
      sendToClient(ws, {
        '@type': 'updateMessages',
        chat_id: chatId,
        messages: await serializeMessages(messages, tg),
      });
      return;
    }

    default:
      console.warn('unknown ws method:', cmd.method);
      sendToClient(ws, { '@type': 'error', message: `unknown method: ${cmd.method}` });
  }
  } catch (err) {
    sendToClient(ws, { '@type': 'error', message: String(err) });
  }
}

function startHttpServer() {
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
      return;
    }

    res.writeHead(404);
    res.end('not found');
  });

  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    wsClients.add(ws);

    void (async () => {
      if (!credentialsConfigured()) {
        sendToClient(ws, { '@type': 'error', message: CREDENTIALS_ERROR });
      }
      sendToClient(ws, await getAuthSnapshot());
      if (lastQrUpdate && currentAuthState === 'authorizationStateWaitQrCode') {
        sendToClient(ws, lastQrUpdate);
      }
      if (clientReady && client?.connected && (await client.isUserAuthorized())) {
        try {
          const me = await client.getMe();
          sendToClient(ws, { '@type': 'updateUser', user: serializeUser(me) });
        } catch {
          // ignore snapshot user errors
        }
      }
    })();

    ws.on('close', () => wsClients.delete(ws));
    ws.on('message', (data) => {
      const text = typeof data === 'string' ? data : data.toString('utf8');
      void handleWsCommand(text, ws);
    });
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`Teleproto bridge port ${port} already in use — skipping second bind`);
      return;
    }
    console.error('Teleproto bridge server error:', err);
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`Teleproto bridge listening on http://127.0.0.1:${port} (WebSocket /ws)`);
  });
}

export async function startTelegramBridge() {
  if (bridgeGlobal.__teleSheetBridgeStarted) {
    return;
  }
  bridgeGlobal.__teleSheetBridgeStarted = true;

  fs.mkdirSync(dataDir, { recursive: true });
  startHttpServer();

  if (!apiId || !apiHash) {
    console.warn(
      'Telegram credentials missing: set TELEGRAM_API_ID and TELEGRAM_API_HASH in .env (https://my.telegram.org)',
    );
    currentAuthState = 'authorizationStateWaitQrCode';
    return;
  }

  try {
    await bootstrapClient();
  } catch (err) {
    console.error('Telegram bridge bootstrap failed:', err);
    broadcast({ '@type': 'error', message: `Bridge bootstrap failed: ${String(err)}` });
  }
}
