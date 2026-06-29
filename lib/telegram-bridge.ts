import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';
import bigInt from 'big-integer';
import { Api, TelegramClient, events, sessions } from 'teleproto';
import { returnBigInt } from 'teleproto/Helpers';
import type { Dialog } from 'teleproto/tl/custom/dialog.js';
import { getDisplayName, getPeerId } from 'teleproto/Utils';
import { WebSocket, WebSocketServer } from 'ws';

const LONG_ZERO = returnBigInt(0);

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
  sticker?: {
    id: string;
    access_hash: string;
    file_reference: string;
  };
  short_name?: string;
  offset?: string;
  gif?: {
    query_id?: string;
    result_id?: string;
    id?: string;
    access_hash?: string;
    file_reference?: string;
  };
};

type BridgeGlobal = typeof globalThis & {
  __teleSheetBridgeStarted?: boolean;
  __teleSheetHandleWsCommand?: (raw: string, ws: WebSocket) => Promise<void>;
  __teleSheetClient?: TelegramClient;
  __teleSheetClientReady?: boolean;
};

const bridgeGlobal = globalThis as BridgeGlobal;

function bridgeClient(): TelegramClient | undefined {
  return bridgeGlobal.__teleSheetClient ?? client;
}

function setBridgeClient(tg: TelegramClient | undefined) {
  client = tg;
  bridgeGlobal.__teleSheetClient = tg;
}

function isBridgeClientReady(): boolean {
  return bridgeGlobal.__teleSheetClientReady ?? clientReady;
}

function setBridgeClientReady(ready: boolean) {
  clientReady = ready;
  bridgeGlobal.__teleSheetClientReady = ready;
}

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH ?? '';
const port = Number(process.env.TELEGRAM_BRIDGE_PORT ?? 8765);
const dataDir = process.env.TELEPROTO_DATA_DIR ?? path.join(process.cwd(), 'teleproto_data');
const sessionPath = path.join(dataDir, 'session.txt');

const wsClients = new Set<WebSocket>();

let client: TelegramClient | undefined = bridgeGlobal.__teleSheetClient;
let eventHandlersRegistered = false;
let authInProgress = false;

let phoneResolve: ((value: string) => void) | null = null;
let codeResolve: ((value: string) => void) | null = null;
let passwordResolve: ((value: string) => void) | null = null;

let pendingPhone: string | null = null;
let currentAuthState = 'authorizationStateWaitQrCode';
let clientReady = bridgeGlobal.__teleSheetClientReady ?? false;
let qrAbortController: AbortController | null = null;
let qrPasswordResolve: ((value: string) => void) | null = null;
let lastQrUpdate: TdUpdate | null = null;
let selfUserId: string | undefined;
let cachedFavedStickers: Array<ReturnType<typeof serializeDocument> & { thumb_base64?: string }> = [];
let cachedStickerSets: Array<ReturnType<typeof serializeStickerSet>> = [];
let cachedSavedGifs: Array<{
  id: string;
  access_hash?: string;
  file_reference?: string;
  alt: string;
  mime_type?: string;
  thumb_base64?: string;
  query_id?: string;
  thumb_url?: string;
}> = [];

const SAVED_MESSAGES_TITLE = 'Saved Messages';

function setSelfUserFromMe(user: Api.User) {
  selfUserId = user.id?.toString();
}

function isSavedMessagesChat(chatId: string, entity?: object): boolean {
  if (!selfUserId) return false;
  if (chatId === selfUserId) return true;
  if (entity instanceof Api.User && entity.self) return true;
  return false;
}

function displayChatTitle(chatId: string, fallback: string, entity?: object): string {
  if (isSavedMessagesChat(chatId, entity)) return SAVED_MESSAGES_TITLE;
  return fallback;
}

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
  if (credentialsConfigured()) {
    if (!bridgeClient() && loadSession()) {
      try {
        await restoreTelegramSession();
      } catch {
        // fall through
      }
    } else if (bridgeClient()) {
      try {
        await completeAuthIfReady();
      } catch {
        // fall through
      }
    }
  }

  if (currentAuthState === 'authorizationStateReady') {
    return {
      '@type': 'updateAuthorizationState',
      authorization_state: { '@type': 'authorizationStateReady' },
    };
  }

  const waitState =
    authInProgress && currentAuthState !== 'authorizationStateReady'
      ? currentAuthState
      : 'authorizationStateWaitQrCode';

  return {
    '@type': 'updateAuthorizationState',
    authorization_state: { '@type': waitState },
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
  const tg = bridgeClient();
  if (!tg) return;
  const session = tg.session.save() as unknown as string;
  fs.writeFileSync(sessionPath, session, 'utf8');
}

function isCorruptSessionError(err: unknown): boolean {
  const message = String(err);
  return /bad authkeyid|auth_key_invalid|auth_key_unregistered|auth_key_perm_empty|session_revoked|user_deactivated/i.test(
    message,
  );
}

/** Drop an invalid on-disk session and reset the Telegram client for a fresh login. */
async function clearCorruptSession() {
  cancelQrAuth();
  authInProgress = false;
  eventHandlersRegistered = false;
  lastQrUpdate = null;
  selfUserId = undefined;
  currentAuthState = 'authorizationStateWaitQrCode';

  const tg = bridgeClient();
  if (tg) {
    try {
      await tg.disconnect();
    } catch {
      // ignore disconnect errors while clearing a bad session
    }
  }

  try {
    fs.unlinkSync(sessionPath);
  } catch {
    // session file may not exist
  }

  setBridgeClient(
    new TelegramClient(new StringSession(''), apiId, apiHash, {
      connectionRetries: 5,
    }),
  );
  setBridgeClientReady(true);
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
  if (!bridgeClient()) {
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
  const fallbackTitle = dialog.title ?? dialog.name ?? '';
  return {
    id: chatId,
    chat_id: chatId,
    title: displayChatTitle(chatId, fallbackTitle, dialog.entity),
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
  entities?: Api.TypeMessageEntity[];
  sticker?: Api.Document;
  media?: Api.TypeMessageMedia;
};

function serializeDocument(doc: Api.Document) {
  const stickerAttr = doc.attributes?.find(
    (a): a is Api.DocumentAttributeSticker => a instanceof Api.DocumentAttributeSticker,
  );
  const customEmojiAttr = doc.attributes?.find(
    (a): a is Api.DocumentAttributeCustomEmoji => a instanceof Api.DocumentAttributeCustomEmoji,
  );
  const videoAttr = doc.attributes?.find(
    (a): a is Api.DocumentAttributeVideo => a instanceof Api.DocumentAttributeVideo,
  );
  return {
    id: doc.id?.toString() ?? '',
    access_hash: doc.accessHash?.toString() ?? '',
    file_reference: Buffer.from(doc.fileReference ?? []).toString('base64'),
    alt: stickerAttr?.alt ?? customEmojiAttr?.alt ?? (videoAttr?.roundMessage ? 'GIF' : ''),
    mime_type: doc.mimeType,
    is_animated: doc.attributes?.some((a) => a instanceof Api.DocumentAttributeAnimated),
    is_video: doc.mimeType === 'video/webm',
  };
}

function serializeStickerSet(set: Api.StickerSet) {
  return {
    id: set.id?.toString() ?? '',
    access_hash: set.accessHash?.toString() ?? '',
    title: set.title ?? '',
    short_name: set.shortName ?? '',
    count: set.count ?? 0,
  };
}

async function serializeStickerSetWithThumb(tg: TelegramClient, set: Api.StickerSet) {
  const base = serializeStickerSet(set);
  if (set.thumbs?.length) {
    try {
      const media = new Api.MessageMediaDocument({
        document: new Api.Document({
          id: set.thumbDocumentId ?? bigInt(0),
          accessHash: set.accessHash,
          fileReference: Buffer.alloc(0),
          date: 0,
          mimeType: 'image/webp',
          size: bigInt(0),
          dcId: set.thumbDcId ?? 1,
          attributes: [],
        }),
      });
      const buffer = await tg.downloadMedia(media, { thumb: 0 });
      if (buffer) {
        const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as string);
        return { ...base, thumb_base64: `data:image/webp;base64,${bytes.toString('base64')}` };
      }
    } catch {
      // thumb optional
    }
  }
  return base;
}

async function downloadDocumentThumb(tg: TelegramClient, doc: Api.Document) {
  try {
    const media = new Api.MessageMediaDocument({ document: doc });
    const buffer = await tg.downloadMedia(media, { thumb: 0 });
    if (!buffer) return undefined;
    const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as string);
    return `data:image/webp;base64,${bytes.toString('base64')}`;
  } catch {
    return undefined;
  }
}

function getGifDocument(message: MessageLike): Api.Document | undefined {
  const media = message.media;
  if (media instanceof Api.MessageMediaDocument && media.document instanceof Api.Document) {
    const doc = media.document;
    const isSticker = doc.attributes?.some((a) => a instanceof Api.DocumentAttributeSticker);
    const isGif =
      doc.attributes?.some((a) => a instanceof Api.DocumentAttributeAnimated) ||
      (doc.mimeType === 'video/mp4' &&
        doc.attributes?.some((a) => a instanceof Api.DocumentAttributeVideo));
    if (!isSticker && isGif) return doc;
  }
  return undefined;
}

async function resolveGifSearchBot(tg: TelegramClient) {
  try {
    const config = await tg.invoke(new Api.help.GetConfig());
    const username = config.gifSearchUsername;
    if (username) return tg.getEntity(username);
  } catch {
    // fall through
  }
  return tg.getEntity('gif');
}

function webDocumentUrl(doc: Api.TypeWebDocument | undefined) {
  return doc instanceof Api.WebDocument ? doc.url : undefined;
}

function getStickerDocument(message: MessageLike): Api.Document | undefined {
  if (message.sticker) return message.sticker;
  const media = message.media;
  if (media instanceof Api.MessageMediaDocument && media.document instanceof Api.Document) {
    const doc = media.document;
    if (doc.attributes?.some((a) => a instanceof Api.DocumentAttributeSticker)) {
      return doc;
    }
  }
  return undefined;
}

function inputDocumentFromRef(ref: { id: string; access_hash: string; file_reference: string }) {
  return new Api.InputDocument({
    id: bigInt(ref.id),
    accessHash: bigInt(ref.access_hash),
    fileReference: Buffer.from(ref.file_reference, 'base64'),
  });
}

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

  const stickerDoc = getStickerDocument(message);
  const customEmojis =
    message.entities
      ?.filter((e): e is Api.MessageEntityCustomEmoji => e instanceof Api.MessageEntityCustomEmoji)
      .map((e) => ({
        document_id: e.documentId.toString(),
        offset: e.offset,
        length: e.length,
      })) ?? [];

  const base = {
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

  if (stickerDoc) {
    const stickerAttr = stickerDoc.attributes?.find(
      (a): a is Api.DocumentAttributeSticker => a instanceof Api.DocumentAttributeSticker,
    );
    const sticker = serializeDocument(stickerDoc);
    const thumb_base64 = tg ? await downloadDocumentThumb(tg, stickerDoc) : undefined;
    return {
      ...base,
      text: base.text || stickerAttr?.alt || '',
      media_type: 'sticker' as const,
      sticker: { ...sticker, thumb_base64 },
    };
  }

  const gifDoc = getGifDocument(message);
  if (gifDoc) {
    const gif = serializeDocument(gifDoc);
    const thumb_base64 = tg ? await downloadDocumentThumb(tg, gifDoc) : undefined;
    return {
      ...base,
      text: base.text || gif.alt || 'GIF',
      media_type: 'gif' as const,
      gif: {
        id: gif.id,
        access_hash: gif.access_hash,
        file_reference: gif.file_reference,
        alt: gif.alt || 'GIF',
        mime_type: gif.mime_type,
        thumb_base64,
      },
    };
  }

  if (customEmojis.length > 0) {
    return {
      ...base,
      media_type: 'custom_emoji_text' as const,
      custom_emojis: customEmojis,
    };
  }

  return base;
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

  const fallbackTitle = e.title
    ? e.title
    : e.firstName
      ? [e.firstName, e.lastName].filter(Boolean).join(' ')
      : e.username ?? chatId;

  return {
    id: chatId,
    title: displayChatTitle(chatId, fallbackTitle, entity),
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
  if (!credentialsConfigured()) {
    sendToClient(ws, { '@type': 'error', message: CREDENTIALS_ERROR });
    return null;
  }

  if (!bridgeClient()) {
    await restoreTelegramSession(ws);
  }

  let tg = bridgeClient();
  if (!tg) {
    sendToClient(ws, { '@type': 'error', message: CREDENTIALS_ERROR });
    return null;
  }

  try {
    await ensureConnected();
  } catch {
    await restoreTelegramSession(ws);
    tg = bridgeClient();
  }

  if (!tg || !(await tg.isUserAuthorized())) {
    await restoreTelegramSession(ws);
    tg = bridgeClient();
  }

  if (!tg || !(await tg.isUserAuthorized())) {
    if (currentAuthState === 'authorizationStateReady') {
      currentAuthState = 'authorizationStateWaitQrCode';
    }
    sendToClient(ws, {
      '@type': 'updateAuthorizationState',
      authorization_state: { '@type': 'authorizationStateWaitQrCode' },
    });
    sendToClient(ws, { '@type': 'error', message: 'not authorized' });
    return null;
  }

  return tg;
}

async function resolveChat(chatId: string | number) {
  return getClient().getEntity(String(chatId));
}

function registerEventHandlers() {
  const tg = bridgeClient();
  if (eventHandlersRegistered || !tg) return;
  eventHandlersRegistered = true;

  tg.addEventHandler(async (event) => {
    const message = event.message;
    const active = bridgeClient();
    if (!message || !active) return;
    const serialized = await serializeMessage(message as MessageLike, active);
    broadcast({
      '@type': 'updateNewMessage',
      message: serialized,
    });
  }, new NewMessage({}));

  tg.addEventHandler(async (event) => {
    const message = event.message;
    const active = bridgeClient();
    if (!message || !active) return;
    broadcast({
      '@type': 'updateMessageEdited',
      message: await serializeMessage(message as MessageLike, active),
    });
  }, new EditedMessage({}));

  tg.addEventHandler(async (event) => {
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

  tg.addEventHandler(async (event) => {
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
  const tg = bridgeClient();
  if (!tg) {
    throw new Error(CREDENTIALS_ERROR);
  }
  return tg;
}

async function ensureConnected() {
  const tg = getClient();
  if (tg.connected) return;
  try {
    await tg.connect();
  } catch (err) {
    if (!isCorruptSessionError(err)) throw err;
    console.warn('clearing corrupt Telegram session:', err);
    await clearCorruptSession();
    await getClient().connect();
  }
}

let authFinalizeInFlight = false;
let authCompletionWatch: ReturnType<typeof setInterval> | null = null;

function stopAuthCompletionWatch() {
  if (authCompletionWatch) {
    clearInterval(authCompletionWatch);
    authCompletionWatch = null;
  }
}

function startAuthCompletionWatch(ws?: WebSocket) {
  stopAuthCompletionWatch();
  authCompletionWatch = setInterval(() => {
    void completeAuthIfReady(ws);
  }, 1500);
}

async function completeAuthIfReady(ws?: WebSocket): Promise<boolean> {
  if (!credentialsConfigured()) return false;
  if (authFinalizeInFlight) return currentAuthState === 'authorizationStateReady';

  const tg = bridgeClient();
  if (!tg) return false;

  try {
    await ensureConnected();
    if (!(await tg.isUserAuthorized())) return false;

    authFinalizeInFlight = true;
    if (authInProgress) {
      cancelQrAuth();
    }

    currentAuthState = 'authorizationStateReady';
    registerEventHandlers();
    saveSession();
    await notifyAuthorizedSession(ws);
    stopAuthCompletionWatch();
    authInProgress = false;
    return true;
  } catch (err) {
    if (isCorruptSessionError(err)) {
      await clearCorruptSession();
      authState('authorizationStateWaitQrCode');
    }
    return false;
  } finally {
    authFinalizeInFlight = false;
  }
}

async function notifyAuthorizedSession(ws?: WebSocket) {
  const tg = bridgeClient();
  if (!tg) return;
  const me = await tg.getMe();
  setSelfUserFromMe(me);
  const userUpdate: TdUpdate = { '@type': 'updateUser', user: serializeUser(me) };
  const readyUpdate: TdUpdate = {
    '@type': 'updateAuthorizationState',
    authorization_state: { '@type': 'authorizationStateReady' },
  };
  currentAuthState = 'authorizationStateReady';
  if (ws) {
    sendToClient(ws, readyUpdate);
    sendToClient(ws, userUpdate);
  } else {
    authState('authorizationStateReady');
    broadcast(userUpdate);
  }
}

/** Reconnect to Telegram and restore a saved session from disk when possible. */
async function reloadClientFromDisk(ws?: WebSocket): Promise<boolean> {
  const saved = loadSession();
  if (!saved) return false;

  eventHandlersRegistered = false;
  const existing = bridgeClient();
  if (existing) {
    try {
      await existing.disconnect();
    } catch {
      // ignore
    }
  }

  setBridgeClient(
    new TelegramClient(new StringSession(saved), apiId, apiHash, {
      connectionRetries: 5,
    }),
  );
  setBridgeClientReady(true);
  return completeAuthIfReady(ws);
}

/** Reconnect to Telegram and restore a saved session from disk when possible. */
async function restoreTelegramSession(ws?: WebSocket): Promise<boolean> {
  if (!credentialsConfigured()) return false;

  try {
    if (!bridgeClient()) {
      if (!loadSession()) return false;
      return reloadClientFromDisk(ws);
    }

    if (await completeAuthIfReady(ws)) return true;

    if (loadSession()) {
      return reloadClientFromDisk(ws);
    }

    return false;
  } catch (err) {
    if (isCorruptSessionError(err)) {
      console.warn('restoreTelegramSession: corrupt session, clearing:', err);
      await clearCorruptSession();
      authState('authorizationStateWaitQrCode');
      return false;
    }
    console.warn('restoreTelegramSession failed:', err);
    return false;
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

    if (await completeAuthIfReady()) {
      return;
    }

    cancelQrAuth();
    qrAbortController = new AbortController();
    authState('authorizationStateWaitQrCode');
    startAuthCompletionWatch();

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

    await completeAuthIfReady();
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      await completeAuthIfReady();
      return;
    }
    if (isCorruptSessionError(err)) {
      await clearCorruptSession();
      authState('authorizationStateWaitQrCode');
      broadcast({
        '@type': 'error',
        message: 'Saved session expired. Scan the QR code to sign in again.',
      });
      return;
    }
    broadcast({ '@type': 'error', message: String(err) });
  } finally {
    stopAuthCompletionWatch();
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
      await completeAuthIfReady();
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

    await completeAuthIfReady();
  } catch (err) {
    broadcast({ '@type': 'error', message: String(err) });
  } finally {
    authInProgress = false;
  }
}

async function handleLogout() {
  cancelQrAuth();
  stopAuthCompletionWatch();
  authInProgress = false;
  eventHandlersRegistered = false;

  if (bridgeClient()) {
    const tg = bridgeClient()!;
    try {
      await tg.logOut();
    } catch (err) {
      console.warn('logOut error:', err);
    }
    try {
      await tg.disconnect();
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
  setBridgeClient(
    new TelegramClient(new StringSession(''), apiId, apiHash, {
      connectionRetries: 5,
    }),
  );

  await ensureConnected();
  setBridgeClientReady(true);

  lastQrUpdate = null;
  selfUserId = undefined;
  broadcast({ '@type': 'updateLoggedOut' });
  void beginQrAuth();
}

async function bootstrapClient() {
  eventHandlersRegistered = false;
  const session = new StringSession(loadSession());
  setBridgeClient(
    new TelegramClient(session, apiId, apiHash, {
      connectionRetries: 5,
    }),
  );

  try {
    await ensureConnected();
  } catch (err) {
    if (!isCorruptSessionError(err)) throw err;
    console.warn('bootstrapClient: corrupt session, clearing:', err);
    await clearCorruptSession();
    authState('authorizationStateWaitQrCode');
    return;
  }

  setBridgeClientReady(true);
  const tg = getClient();

  if (await tg.isUserAuthorized()) {
    await completeAuthIfReady();
  } else {
    authState('authorizationStateWaitQrCode');
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
      const restored = await restoreTelegramSession(ws);
      if (!restored) {
        await completeAuthIfReady(ws);
      }
      if (currentAuthState !== 'authorizationStateReady') {
        sendToClient(ws, await getAuthSnapshot());
      }
      return;
    }

    case 'getMe': {
      const tg = await requireAuth(ws);
      if (!tg) return;
      const me = await tg.getMe();
      setSelfUserFromMe(me);
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

    case 'getFavedStickers': {
      const tg = await requireAuth(ws);
      if (!tg) return;
      const result = await tg.invoke(new Api.messages.GetFavedStickers({ hash: LONG_ZERO }));
      if (result instanceof Api.messages.FavedStickersNotModified) {
        sendToClient(ws, { '@type': 'updateFavedStickers', stickers: cachedFavedStickers });
        return;
      }
      const stickers = await Promise.all(
        result.stickers
          .filter((doc): doc is Api.Document => doc instanceof Api.Document)
          .map(async (doc) => ({
            ...serializeDocument(doc),
            thumb_base64: await downloadDocumentThumb(tg, doc),
          })),
      );
      cachedFavedStickers = stickers;
      sendToClient(ws, { '@type': 'updateFavedStickers', stickers });
      return;
    }

    case 'getAllStickerSets': {
      const tg = await requireAuth(ws);
      if (!tg) return;
      const result = await tg.invoke(new Api.messages.GetAllStickers({ hash: LONG_ZERO }));
      if (result instanceof Api.messages.AllStickersNotModified) {
        sendToClient(ws, { '@type': 'updateStickerSets', sets: cachedStickerSets });
        return;
      }
      const sets = result.sets
        .filter((s): s is Api.StickerSet => s instanceof Api.StickerSet)
        .map(serializeStickerSet);
      cachedStickerSets = sets;
      sendToClient(ws, { '@type': 'updateStickerSets', sets });
      return;
    }

    case 'getStickerSet': {
      const tg = await requireAuth(ws);
      if (!tg) return;
      if (!cmd.short_name) {
        sendToClient(ws, { '@type': 'error', message: 'getStickerSet requires short_name' });
        return;
      }
      const result = await tg.invoke(
        new Api.messages.GetStickerSet({
          stickerset: new Api.InputStickerSetShortName({ shortName: cmd.short_name }),
          hash: 0,
        }),
      );
      if (!(result instanceof Api.messages.StickerSet)) return;
      const stickers = await Promise.all(
        result.documents
          .filter((doc): doc is Api.Document => doc instanceof Api.Document)
          .map(async (doc) => ({
            ...serializeDocument(doc),
            thumb_base64: await downloadDocumentThumb(tg, doc),
          })),
      );
      sendToClient(ws, {
        '@type': 'updateStickerSetStickers',
        set: serializeStickerSet(result.set),
        stickers,
      });
      return;
    }

    case 'searchStickerSets': {
      const tg = await requireAuth(ws);
      if (!tg) return;
      const result = await tg.invoke(
        new Api.messages.SearchStickerSets({ q: cmd.search ?? '', hash: LONG_ZERO }),
      );
      if (result instanceof Api.messages.FoundStickerSetsNotModified) {
        sendToClient(ws, { '@type': 'updateStickerSetSearch', sets: [] });
        return;
      }
      if (result instanceof Api.messages.FoundStickerSets) {
        const sets = result.sets
          .map((covered) => {
            if ('set' in covered && covered.set instanceof Api.StickerSet) {
              return serializeStickerSet(covered.set);
            }
            return null;
          })
          .filter((s): s is ReturnType<typeof serializeStickerSet> => s != null);
        sendToClient(ws, { '@type': 'updateStickerSetSearch', sets });
      }
      return;
    }

    case 'getSavedGifs': {
      const tg = await requireAuth(ws);
      if (!tg) return;
      const result = await tg.invoke(new Api.messages.GetSavedGifs({ hash: LONG_ZERO }));
      if (result instanceof Api.messages.SavedGifsNotModified) {
        sendToClient(ws, { '@type': 'updateSavedGifs', gifs: cachedSavedGifs });
        return;
      }
      if (result instanceof Api.messages.SavedGifs) {
        const gifs = await Promise.all(
          result.gifs
            .filter((doc): doc is Api.Document => doc instanceof Api.Document)
            .map(async (doc) => {
              const serialized = serializeDocument(doc);
              return {
                id: serialized.id,
                access_hash: serialized.access_hash,
                file_reference: serialized.file_reference,
                alt: serialized.alt || 'GIF',
                mime_type: serialized.mime_type,
                thumb_base64: await downloadDocumentThumb(tg, doc),
              };
            }),
        );
        cachedSavedGifs = gifs;
        sendToClient(ws, { '@type': 'updateSavedGifs', gifs });
      }
      return;
    }

    case 'searchGifs': {
      const tg = await requireAuth(ws);
      if (!tg) return;
      const offset = cmd.offset ?? '';
      try {
        const me = await tg.getMe();
        const bot = await resolveGifSearchBot(tg);
        const result = await tg.invoke(
          new Api.messages.GetInlineBotResults({
            bot,
            peer: me,
            query: cmd.search ?? '',
            offset,
          }),
        );
        if (!(result instanceof Api.messages.BotResults)) {
          sendToClient(ws, { '@type': 'updateGifSearch', gifs: [], next_offset: undefined });
          return;
        }
        const gifs = await Promise.all(
          result.results
            .filter(
              (r): r is Api.BotInlineResult | Api.BotInlineMediaResult =>
                r instanceof Api.BotInlineResult || r instanceof Api.BotInlineMediaResult,
            )
            .map(async (r) => {
              if (r instanceof Api.BotInlineMediaResult && r.document instanceof Api.Document) {
                const serialized = serializeDocument(r.document);
                return {
                  id: r.id,
                  alt: serialized.alt || 'GIF',
                  access_hash: serialized.access_hash,
                  file_reference: serialized.file_reference,
                  mime_type: serialized.mime_type,
                  query_id: result.queryId?.toString(),
                  thumb_base64: await downloadDocumentThumb(tg, r.document),
                };
              }
              if (r instanceof Api.BotInlineResult) {
                return {
                  id: r.id,
                  alt: 'GIF',
                  query_id: result.queryId?.toString(),
                  thumb_url: webDocumentUrl(r.thumb) ?? webDocumentUrl(r.content),
                };
              }
              return {
                id: r.id,
                alt: 'GIF',
                query_id: result.queryId?.toString(),
              };
            }),
        );
        sendToClient(ws, {
          '@type': 'updateGifSearch',
          gifs,
          next_offset: result.nextOffset || undefined,
        });
      } catch (err) {
        sendToClient(ws, { '@type': 'updateGifSearch', gifs: [], next_offset: undefined });
        sendToClient(ws, { '@type': 'error', message: String(err) });
      }
      return;
    }

    case 'sendSticker': {
      const tg = await requireAuth(ws);
      if (!tg) return;
      if (!cmd.sticker?.id || !cmd.sticker.access_hash || !cmd.sticker.file_reference) {
        sendToClient(ws, { '@type': 'error', message: 'sendSticker requires sticker id, access_hash, file_reference' });
        return;
      }
      if (cmd.chat_id === undefined || cmd.chat_id === '') {
        sendToClient(ws, { '@type': 'error', message: 'sendSticker requires chat_id' });
        return;
      }
      const entity = await resolveChat(cmd.chat_id);
      const chatId = chatIdFromEntity(entity);
      const sent = await tg.sendFile(entity, {
        file: new Api.InputMediaDocument({ id: inputDocumentFromRef(cmd.sticker) }),
        replyTo: cmd.reply_to,
      });
      sendToClient(ws, {
        '@type': 'updateMessageSendSucceeded',
        chat_id: chatId,
        message: await serializeMessage(sent as MessageLike, tg),
      });
      return;
    }

    case 'sendGif': {
      const tg = await requireAuth(ws);
      if (!tg) return;
      if (cmd.chat_id === undefined || cmd.chat_id === '') {
        sendToClient(ws, { '@type': 'error', message: 'sendGif requires chat_id' });
        return;
      }
      const entity = await resolveChat(cmd.chat_id);
      const chatId = chatIdFromEntity(entity);
      let sent: MessageLike | undefined;
      if (cmd.gif?.query_id && cmd.gif?.result_id) {
        const updates = await tg.invoke(
          new Api.messages.SendInlineBotResult({
            peer: entity,
            queryId: bigInt(cmd.gif.query_id),
            id: cmd.gif.result_id,
          }),
        );
        if (updates instanceof Api.Updates || updates instanceof Api.UpdatesCombined) {
          for (const u of updates.updates) {
            if (u instanceof Api.UpdateNewMessage && u.message) {
              sent = u.message as MessageLike;
              break;
            }
            if (u instanceof Api.UpdateNewChannelMessage && u.message) {
              sent = u.message as MessageLike;
              break;
            }
          }
        }
      } else if (cmd.gif?.id && cmd.gif.access_hash && cmd.gif.file_reference) {
        sent = await tg.sendFile(entity, {
          file: new Api.InputMediaDocument({
            id: inputDocumentFromRef({
              id: cmd.gif.id,
              access_hash: cmd.gif.access_hash,
              file_reference: cmd.gif.file_reference,
            }),
          }),
          replyTo: cmd.reply_to,
        });
      } else {
        sendToClient(ws, { '@type': 'error', message: 'sendGif requires gif document or inline result' });
        return;
      }
      if (!sent) {
        sendToClient(ws, { '@type': 'error', message: 'Failed to send GIF' });
        return;
      }
      sendToClient(ws, {
        '@type': 'updateMessageSendSucceeded',
        chat_id: chatId,
        message: await serializeMessage(sent as MessageLike, tg),
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

async function handleStickerPreview(req: http.IncomingMessage, res: http.ServerResponse) {
  try {
    const tg = bridgeClient();
    if (!tg || !(await tg.isUserAuthorized())) {
      res.writeHead(401);
      res.end('unauthorized');
      return;
    }
    const url = new URL(req.url ?? '', 'http://127.0.0.1');
    const id = url.searchParams.get('id');
    const accessHash = url.searchParams.get('access_hash');
    const fileReference = url.searchParams.get('file_reference');
    if (!id || !accessHash || !fileReference) {
      res.writeHead(400);
      res.end('missing params');
      return;
    }
    const doc = new Api.Document({
      id: bigInt(id),
      accessHash: bigInt(accessHash),
      fileReference: Buffer.from(fileReference, 'base64'),
      date: 0,
      mimeType: 'image/webp',
      size: bigInt(0),
      dcId: 0,
      attributes: [],
    });
    const media = new Api.MessageMediaDocument({ document: doc });
    const buffer = await tg.downloadMedia(media, { thumb: 0 });
    if (!buffer) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as string);
    res.writeHead(200, { 'Content-Type': 'image/webp', 'Cache-Control': 'private, max-age=3600' });
    res.end(bytes);
  } catch {
    res.writeHead(500);
    res.end('error');
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

    if (req.url?.startsWith('/sticker')) {
      void handleStickerPreview(req, res);
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
      const restored = await restoreTelegramSession(ws);
      if (!restored) {
        await completeAuthIfReady(ws);
      }
      if (currentAuthState !== 'authorizationStateReady') {
        sendToClient(ws, await getAuthSnapshot());
      }
      if (lastQrUpdate && currentAuthState === 'authorizationStateWaitQrCode') {
        sendToClient(ws, lastQrUpdate);
      }
    })();

    ws.on('close', () => wsClients.delete(ws));
    ws.on('message', (data) => {
      const text = typeof data === 'string' ? data : data.toString('utf8');
      void bridgeGlobal.__teleSheetHandleWsCommand?.(text, ws);
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
  bridgeGlobal.__teleSheetHandleWsCommand = handleWsCommand;

  if (bridgeGlobal.__teleSheetBridgeStarted) {
    if (credentialsConfigured()) {
      try {
        await restoreTelegramSession();
      } catch (err) {
        console.warn('Telegram session restore on boot failed:', err);
      }
    }
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

bridgeGlobal.__teleSheetHandleWsCommand = handleWsCommand;
