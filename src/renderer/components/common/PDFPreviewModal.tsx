import React from 'react';
import { FaArrowDown, FaTimes } from 'react-icons/fa';

interface PDFPreviewModalProps {
  isOpen: boolean;
  htmlContent: string | null;
  onClose: () => void;
  onDownload: () => void;
  title?: string;
}

export default function PDFPreviewModal({
  isOpen,
  htmlContent,
  onClose,
  onDownload,
  title = 'PDF Preview'
}: PDFPreviewModalProps) {
  if (!isOpen || !htmlContent) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wide">{title}</h3>
          <div className="flex gap-2">
            <button
              onClick={onDownload}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-sm font-medium flex items-center gap-2 transition-colors"
            >
              <FaArrowDown className="w-4 h-4" />
              Download PDF
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
              title="Close"
            >
              <FaTimes className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        {/* HTML Preview */}
        <div className="flex-1 overflow-auto bg-gray-100 dark:bg-gray-900 p-4">
          <iframe
            title="PDF Preview"
            srcDoc={htmlContent}
            className="w-full h-full bg-white border-0 rounded shadow-lg"
            style={{ minHeight: '800px' }}
          />
        </div>
      </div>
    </div>
  );
}
