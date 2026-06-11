'use client';

import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import GridRow from '../../../components/sheet/GridRow';
import SheetShell from '../../../components/sheet/SheetShell';
import { useDialogs } from '../../../hooks/useDialogs';
import { dialogTypeLabel, formatMessageTime } from '../../../lib/chat';

export default function ChatsPage() {
  const router = useRouter();
  const { dialogs, loading, error, refresh } = useDialogs();

  return (
    <SheetShell
      title="Conversations"
      formulaText="Double-click a row to open thread — synced from cloud workspace"
      colA="Contact"
      colB="Preview"
      colC="Unread"
      tabs={[{ label: 'Conversations', active: true }]}
    >
      <GridRow n={2}>
        <span>Index</span>
        <span className="text-gray-500">{loading ? 'Loading rows…' : `${dialogs.length} conversation(s)`}</span>
        <button
          type="button"
          onClick={refresh}
          className="text-xs text-green-700 hover:underline"
        >
          Refresh
        </button>
      </GridRow>

      {loading && (
        <GridRow n={3}>
          <span>Status</span>
          <span className="text-gray-500 flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Fetching conversation index…
          </span>
          <span className="text-gray-400">Wait</span>
        </GridRow>
      )}

      {error && (
        <GridRow n={4}>
          <span>Notice</span>
          <span className="text-red-600">{error}</span>
          <span className="text-red-500">Error</span>
        </GridRow>
      )}

      {dialogs.map((dialog, i) => {
        const rowNum = i + (loading ? 5 : 3);
        const chatId = dialog.chat_id || dialog.id;
        const href = `/chats/${encodeURIComponent(chatId)}`;

        return (
          <GridRow
            key={dialog.id}
            n={rowNum}
            onClick={() => router.push(href)}
          >
            <span className="font-medium text-gray-800">{dialog.title || chatId}</span>
            <span className="text-gray-600 truncate">
              {dialogTypeLabel(dialog)} · last activity {formatMessageTime(dialog.last_message_date)}
            </span>
            <span className={dialog.unread_count > 0 ? 'text-green-700 font-medium' : 'text-gray-400'}>
              {dialog.unread_count > 0 ? dialog.unread_count : '—'}
            </span>
          </GridRow>
        );
      })}

      {!loading && dialogs.length === 0 && !error && (
        <GridRow n={3} muted>
          <span>Empty</span>
          <span className="text-gray-500">No conversations found in this workspace.</span>
          <span>—</span>
        </GridRow>
      )}

      <GridRow n={dialogs.length + 10} muted>
        <span>Notes</span>
        <span className="text-gray-500">Rows mirror Telegram dialogs. Click a row to open that thread.</span>
        <span />
      </GridRow>
    </SheetShell>
  );
}
