import React, { Suspense } from 'react';
import type { RichTextEditorProps } from './RichTextEditor';

const RichTextEditorLazy = React.lazy(() =>
  import('./RichTextEditor').then((mod) => ({ default: mod.RichTextEditor }))
);

export function LazyRichTextEditor(props: RichTextEditorProps) {
  const heightClass = props.minHeightClass || 'min-h-[240px]';
  return (
    <Suspense
      fallback={
        <div className="space-y-1.5">
          {props.label && (
            <span className="block text-xs font-medium text-[#070B24] dark:text-[#F7F8FF]">
              {props.label}
            </span>
          )}
          <div
            aria-busy="true"
            className={`rounded-xl border border-[#DCE3F2] dark:border-[#1A2550] bg-[#F6F8FC] dark:bg-[#03051B] ${heightClass} flex items-center justify-center text-xs text-[#4A5578] dark:text-[#AEB8D4]`}
          >
            Loading rich-text editor...
          </div>
        </div>
      }
    >
      <RichTextEditorLazy {...props} />
    </Suspense>
  );
}
