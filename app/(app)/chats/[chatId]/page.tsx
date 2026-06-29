'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import GridRow from '../../../../components/sheet/GridRow';
import SheetShell from '../../../../components/sheet/SheetShell';
import ComposeInput, { composeFormulaContent, composeFormulaPreview } from '../../../../components/sheet/ComposeInput';
import MessageContent from '../../../../components/sheet/MessageContent';
import { useTelegramAuthContext } from '../../../../components/TelegramAuthProvider';
import { useChatMessages } from '../../../../hooks/useChatMessages';
import { SheetComposeProvider } from '../../../../lib/sheet-compose';
import { useSheetPreferences } from '../../../../lib/sheet-preferences';
import {
  formatMessageTime,
  isSavedMessagesChat,
  messageSenderLabel,
  SAVED_MESSAGES_TITLE,
} from '../../../../lib/chat';

function ChatThreadContent({ chatId }: { chatId: string }) {
  const { user } = useTelegramAuthContext();
  const { showStickerEmoji } = useSheetPreferences();
  const {
    messages,
    chatTitle,
    loading,
    error,
    draft,
    setDraft,
    pendingSticker,
    setPendingSticker,
    pendingGif,
    setPendingGif,
    send,
    composeValue,
  } = useChatMessages(chatId);

  const title = isSavedMessagesChat(chatId, user?.id)
    ? SAVED_MESSAGES_TITLE
    : chatTitle || `Chat ${chatId}`;

  const formulaPreview = composeFormulaPreview(
    draft,
    pendingSticker,
    showStickerEmoji,
    pendingGif,
  );
  const formulaContent = composeFormulaContent(
    draft,
    pendingSticker,
    showStickerEmoji,
    pendingGif,
  );

  return (
    <SheetComposeProvider value={composeValue}>
      <SheetShell
        title={title}
        formulaText={
          formulaPreview
            ? formulaPreview
            : 'Type in the compose row above — press Enter or Send to post'
        }
        formulaContent={formulaContent ?? undefined}
        colA="From"
        colB="Message"
        colC="Time"
        tabs={[
          { label: '← Conversations', href: '/chats' },
          { label: title, active: true },
        ]}
      >
        <GridRow n={2}>
          <span>Thread</span>
          <span className="text-gray-600 font-mono text-xs">{chatId}</span>
          <Link href="/chats" className="text-xs text-green-700 hover:underline">
            Back
          </Link>
        </GridRow>

        <GridRow n={3} highlight tall={36}>
          <span>Compose</span>
          <ComposeInput
            draft={draft}
            onDraftChange={setDraft}
            onSend={send}
            pendingSticker={pendingSticker}
            onClearSticker={() => setPendingSticker(null)}
            pendingGif={pendingGif}
            onClearGif={() => setPendingGif(null)}
          />
          <span className="text-xs text-gray-400">Send</span>
        </GridRow>

        {loading && (
          <GridRow n={4}>
            <span>Status</span>
            <span className="text-gray-500 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Loading message history…
            </span>
            <span className="text-gray-400">Wait</span>
          </GridRow>
        )}

        {error && (
          <GridRow n={5}>
            <span>Notice</span>
            <span className="text-red-600">{error}</span>
            <span className="text-red-500">Error</span>
          </GridRow>
        )}

        {messages.map((message, i) => {
          const rowNum = i + (loading ? 6 : 4);
          const tall =
            (message.media_type === 'sticker' ||
              message.media_type === 'gif' ||
              message.media_type === 'photo') &&
            showStickerEmoji
              ? message.media_type === 'gif' || message.media_type === 'photo'
                ? 140
                : 72
              : message.text.length > 80
                ? 48
                : 28;
          return (
            <GridRow key={message.id} n={rowNum} tall={tall}>
              <span className={message.out ? 'text-blue-700 font-medium' : 'text-gray-800'}>
                {messageSenderLabel(message)}
              </span>
              <MessageContent message={message} showMedia={showStickerEmoji} />
              <span className="text-gray-400 text-xs">{formatMessageTime(message.date)}</span>
            </GridRow>
          );
        })}

        {!loading && messages.length === 0 && !error && (
          <GridRow n={4} muted>
            <span>Empty</span>
            <span className="text-gray-500">No messages in this thread yet.</span>
            <span>—</span>
          </GridRow>
        )}
      </SheetShell>
    </SheetComposeProvider>
  );
}

export default function ChatThreadPage() {
  const params = useParams();
  const chatId = decodeURIComponent(String(params.chatId ?? ''));

  return <ChatThreadContent chatId={chatId} />;
}
