import { useCallback, useRef, useState, type ReactNode } from 'react';
import { UploadCloud } from 'lucide-react';

interface DropzoneProps {
  onFiles: (files: File[]) => void;
  accept: string;
  title: string;
  subtitle: string;
  icon?: ReactNode;
}

export function Dropzone({ onFiles, accept, title, subtitle, icon }: DropzoneProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length) onFiles(files);
    },
    [onFiles],
  );

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length) onFiles(files);
    e.target.value = '';
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`group relative cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-all duration-300 sm:p-14 ${
        dragging
          ? 'border-sky-400 bg-sky-50 scale-[1.01]'
          : 'border-slate-300 bg-slate-50/50 hover:border-sky-300 hover:bg-sky-50/30'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        onChange={handleSelect}
        className="hidden"
      />
      <div className="flex flex-col items-center gap-4">
        <div
          className={`flex h-16 w-16 items-center justify-center rounded-2xl transition-all duration-300 ${
            dragging
              ? 'bg-sky-500 text-white scale-110'
              : 'bg-white text-sky-500 shadow-sm group-hover:bg-sky-500 group-hover:text-white'
          }`}
        >
          {icon ?? <UploadCloud className="h-8 w-8" />}
        </div>
        <div>
          <p className="text-lg font-semibold text-slate-800">{title}</p>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
      </div>
    </div>
  );
}
