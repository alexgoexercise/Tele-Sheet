'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import GridRow from '../../../../components/sheet/GridRow';
import SheetShell from '../../../../components/sheet/SheetShell';
import { useTelegramAuthContext } from '../../../../components/TelegramAuthProvider';
import { useChatMessages } from '../../../../hooks/useChatMessages';
import {
  formatMessageTime,
  isSavedMessagesChat,
  messageSenderLabel,
  SAVED_MESSAGES_TITLE,
} from '../../../../lib/chat';

export default function ChatThreadPage() {
  const params = useParams();
  const chatId = decodeURIComponent(String(params.chatId ?? ''));
  const { user } = useTelegramAuthContext();
  const { messages, chatTitle, loading, error, draft, setDraft, send } = useChatMessages(chatId);

  const title = isSavedMessagesChat(chatId, user?.id)
    ? SAVED_MESSAGES_TITLE
    : chatTitle || `Chat ${chatId}`;

  return (
    <SheetShell
      title={title}
      formulaText={
        draft
          ? draft
          : 'Type in the compose row above — press Enter or Send to post'
      }
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
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Type a message…"
          className="w-full outline-none bg-transparent"
        />
        <button
          type="button"
          onClick={send}
          disabled={!draft.trim()}
          className="text-xs px-2 py-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white rounded-sm"
        >
          Send
        </button>
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
        return (
          <GridRow key={message.id} n={rowNum} tall={message.text.length > 80 ? 48 : 28}>
            <span className={message.out ? 'text-blue-700 font-medium' : 'text-gray-800'}>
              {messageSenderLabel(message)}
            </span>
            <span className="text-gray-700 whitespace-pre-wrap break-words">{message.text || '—'}</span>
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
  );
}
