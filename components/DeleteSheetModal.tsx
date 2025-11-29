'use client';

import React from 'react';
import Modal from './Modal';

type DeleteSheetModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  sheetName: string;
  canDelete: boolean;
};

export default function DeleteSheetModal({
  isOpen,
  onClose,
  onConfirm,
  sheetName,
  canDelete
}: DeleteSheetModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Delete sheet"
      footer={
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!canDelete}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Delete
          </button>
        </div>
      }
    >
      <p className="text-sm text-gray-700 mb-4">
        Are you sure you want to delete "{sheetName}"? This action cannot be undone.
      </p>
      {!canDelete && (
        <p className="text-sm text-red-600 mb-4">
          You cannot delete the last remaining sheet.
        </p>
      )}
    </Modal>
  );
}

