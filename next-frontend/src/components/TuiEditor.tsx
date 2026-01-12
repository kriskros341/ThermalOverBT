"use client";

import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import Editor from '@toast-ui/editor';
import type { EditorOptions } from '@toast-ui/editor';
import '@toast-ui/editor/dist/toastui-editor.css';

interface TuiEditorProps extends Omit<EditorOptions, 'el'> {
  onChange?: (editor: Editor) => void;
}

export interface TuiEditorRef {
  getInstance: () => Editor | null;
}

const TuiEditor = forwardRef<TuiEditorRef, TuiEditorProps>((props, ref) => {
  const editorEl = useRef<HTMLDivElement>(null);
  const editorInstance = useRef<Editor | null>(null);

  useEffect(() => {
    if (editorEl.current) {
      editorInstance.current = new Editor({
        el: editorEl.current,
        ...props,
      });

      if (props.onChange) {
        editorInstance.current.on('change', () => {
          if (editorInstance.current) {
            props.onChange?.(editorInstance.current);
          }
        });
      }
    }

    return () => {
      editorInstance.current?.destroy();
      editorInstance.current = null;
    };
  }, [props]);

  useImperativeHandle(ref, () => ({
    getInstance: () => editorInstance.current,
  }));

  return <div ref={editorEl} />;
});

TuiEditor.displayName = 'TuiEditor';

export default TuiEditor;
