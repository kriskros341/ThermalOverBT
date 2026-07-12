"use client";

import React, { useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import '@toast-ui/editor/dist/toastui-editor.css';
import { TuiEditorRef } from '@/components/TuiEditor';

const MdEditor = dynamic(() => import('@/components/TuiEditor'), { ssr: false });

interface MarkdownEditorProps {
  initialValue: string;
  onChange: (value: string) => void;
  height?: string;
  placeholder?: string;
}

export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  initialValue,
  onChange,
  height = "720px",
  placeholder = "Write notes here…",
}) => {
  const mdRef = useRef<TuiEditorRef>(null);

  // Push external value changes into the editor. Guard on the current content
  // so the round-trip of the user's own typing (onChange -> parent -> initialValue)
  // does NOT call setMarkdown, which would reset the cursor to the end.
  useEffect(() => {
    const instance = mdRef.current?.getInstance?.();
    if (instance && instance.getMarkdown() !== initialValue) {
      instance.setMarkdown(initialValue);
    }
  }, [initialValue]);

  const handleEditorChange = () => {
    try {
      const md = mdRef.current?.getInstance?.()?.getMarkdown?.() ?? '';
      onChange(md);
    } catch {
      // ignore
    }
  };

  return (
    <MdEditor
      ref={mdRef}
      initialEditType="markdown"
      previewStyle="tab"
      height={height}
      usageStatistics={false}
      placeholder={placeholder}
      onChange={handleEditorChange}
    />
  );
};
