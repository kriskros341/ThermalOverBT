"use client";

import React, { useRef, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import '@toast-ui/editor/dist/toastui-editor.css';
import { TuiEditorRef } from '@/components/TuiEditor';

const MdEditor = dynamic(() => import('@/components/TuiEditor'), { ssr: false });

interface TemplateEditorProps {
  initialValue: string;
  onChange: (value: string) => void;
  height?: string;
  placeholder?: string;
}

export const TemplateEditor: React.FC<TemplateEditorProps> = ({
  initialValue,
  onChange,
  height = "360px",
  placeholder = "Write template here… Use {{ field }} placeholders.",
}) => {
  const mdRef = useRef<TuiEditorRef>(null);
  const [editorValue, setEditorValue] = useState(initialValue);

  // Update internal state when initialValue prop changes
  useEffect(() => {
    setEditorValue(initialValue);
  }, [initialValue]);

  // Update TuiEditor instance when internal state changes
  useEffect(() => {
    if (mdRef.current?.getInstance) {
      const instance = mdRef.current.getInstance();
      if (instance && instance.getMarkdown() !== editorValue) {
        instance.setMarkdown(editorValue);
      }
    }
  }, [editorValue]);

  const handleEditorChange = () => {
    try {
      const inst = mdRef.current?.getInstance?.();
      const md = inst?.getMarkdown?.() ?? '';
      setEditorValue(md);
      onChange(md);
    } catch {
      // ignore
    }
  };

  return (
    <MdEditor
      ref={mdRef}
      initialValue={editorValue}
      initialEditType="markdown"
      previewStyle="tab"
      height={height}
      usageStatistics={false}
      placeholder={placeholder}
      onChange={handleEditorChange}
    />
  );
};
