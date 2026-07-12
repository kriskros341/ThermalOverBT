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
  const onChangeRef = useRef(props.onChange);

  // Keep the latest onChange without recreating the editor instance.
  useEffect(() => {
    onChangeRef.current = props.onChange;
  }, [props.onChange]);

  // Create the editor once on mount. Recreating it on every render (e.g. when
  // props change on each keystroke) would wipe the document and reset the caret.
  useEffect(() => {
    if (!editorEl.current) return;

    const { onChange: _onChange, ...editorOptions } = props;
    const instance = new Editor({
      el: editorEl.current,
      ...editorOptions,
    });
    editorInstance.current = instance;

    instance.on('change', () => {
      onChangeRef.current?.(instance);
    });

    return () => {
      instance.destroy();
      editorInstance.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(ref, () => ({
    getInstance: () => editorInstance.current,
  }));

  return <div ref={editorEl} />;
});

TuiEditor.displayName = 'TuiEditor';

export default TuiEditor;
