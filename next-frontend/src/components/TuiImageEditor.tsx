"use client";

import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import TuiImageEditor from 'tui-image-editor';
import 'tui-image-editor/dist/tui-image-editor.css';

interface ImageEditorProps {
  includeUI?: {
    menu?: string[];
    uiSize?: { width: string; height: string };
    menuBarPosition?: 'bottom' | 'top' | 'left' | 'right';
    loadImage?: { path: string; name: string };
  };
  cssMaxWidth?: number;
  cssMaxHeight?: number;
  selectionStyle?: Record<string, any>;
  usageStatistics?: boolean;
}

export interface ImageEditorRef {
  getInstance: () => TuiImageEditor | null;
}

const ImageEditor = forwardRef<ImageEditorRef, ImageEditorProps>((props, ref) => {
  const editorEl = useRef<HTMLDivElement>(null);
  const editorInstance = useRef<TuiImageEditor | null>(null);

  useEffect(() => {
    if (editorEl.current) {
      editorInstance.current = new TuiImageEditor(editorEl.current, {
        ...props,
        includeUI: {
          ...props.includeUI,
          theme: {
            'common.bi.image': '',
            'common.bisize.width': '0px',
            'common.bisize.height': '0px',
            'common.backgroundImage': 'none',
            'common.backgroundColor': '#f3f4f6',
            'common.border': '1px solid #d1d5db',
          },
        },
      });
    }

    return () => {
      editorInstance.current?.destroy();
      editorInstance.current = null;
    };
  }, [props]);

  useImperativeHandle(ref, () => ({
    getInstance: () => editorInstance.current,
  }));

  return <div ref={editorEl} style={{ width: '100%', height: '100%' }} />;
});

ImageEditor.displayName = 'ImageEditor';

export default ImageEditor;
