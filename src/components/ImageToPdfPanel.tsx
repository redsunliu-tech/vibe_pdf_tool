import { useCallback, useState } from 'react';
import { Image as ImageIcon, Download, Trash2, Loader2, Settings2, FileStack, CheckCircle2, GripVertical, X } from 'lucide-react';
import { Dropzone } from './Dropzone';
import {
  convertImagesToPdf,
  getImageDimensions,
  type ImageInput,
  type PageSize,
  type Orientation,
} from '../lib/imageToPdf';
import { downloadBlob, formatBytes } from '../lib/pdfToImage';

const PAGE_OPTIONS: { value: PageSize; label: string }[] = [
  { value: 'a4', label: 'A4' },
  { value: 'letter', label: 'Letter' },
  { value: 'a3', label: 'A3' },
  { value: 'fit', label: 'Fit to Image' },
];

const ORIENTATION_OPTIONS: { value: Orientation; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'portrait', label: 'Portrait' },
  { value: 'landscape', label: 'Landscape' },
];

export function ImageToPdfPanel() {
  const [images, setImages] = useState<ImageInput[]>([]);
  const [pageSize, setPageSize] = useState<PageSize>('a4');
  const [orientation, setOrientation] = useState<Orientation>('auto');
  const [margin, setMargin] = useState(10);
  const [converting, setConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleFiles = useCallback(async (files: File[]) => {
    const valid = files.filter((f) => f.type.startsWith('image/'));
    if (!valid.length) {
      setError('Please select valid image files (PNG, JPG, BMP, WebP).');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const inputs: ImageInput[] = [];
      for (const file of valid) {
        const dims = await getImageDimensions(file);
        inputs.push({ file, dataUrl: dims.dataUrl, width: dims.width, height: dims.height });
      }
      setImages((prev) => [...prev, ...inputs]);
      setResultBlob(null);
    } catch {
      setError('Failed to read one or more images.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRemove = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
    setResultBlob(null);
  };

  const handleMove = (index: number, dir: -1 | 1) => {
    setImages((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setResultBlob(null);
  };

  const handleClear = () => {
    setImages([]);
    setResultBlob(null);
    setError(null);
    setProgress(0);
  };

  const handleConvert = useCallback(async () => {
    if (!images.length) return;
    setConverting(true);
    setError(null);
    setProgress(0);
    setResultBlob(null);
    try {
      const blob = await convertImagesToPdf(images, {
        pageSize,
        orientation,
        margin,
        onProgress: (current, total) => setProgress(Math.round((current / total) * 100)),
      });
      setResultBlob(blob);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Conversion failed');
    } finally {
      setConverting(false);
    }
  }, [images, pageSize, orientation, margin]);

  const handleDownload = () => {
    if (!resultBlob) return;
    downloadBlob(resultBlob, 'converted.pdf');
  };

  return (
    <div className="space-y-6">
      {images.length === 0 && (
        <Dropzone
          accept="image/*,.bmp,.jpg,.jpeg,.png,.webp"
          title="Drop images here"
          subtitle="or click to browse — PNG, JPG, BMP, WebP supported"
          icon={<ImageIcon className="h-8 w-8" />}
          onFiles={handleFiles}
        />
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-4 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Reading images...</span>
        </div>
      )}

      {images.length > 0 && (
        <div className="space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-700">
              <FileStack className="h-5 w-5 text-sky-500" />
              <span className="font-medium">{images.length} image{images.length !== 1 ? 's' : ''} ready</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => document.getElementById('img-add-more')?.click()}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
              >
                Add More
              </button>
              <input
                id="img-add-more"
                type="file"
                accept="image/*,.bmp,.jpg,.jpeg,.png,.webp"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length) handleFiles(files);
                  e.target.value = '';
                }}
              />
              <button
                onClick={handleClear}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-rose-500"
                title="Clear all"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Image list */}
          <div className="space-y-2">
            {images.map((img, i) => (
              <div
                key={i}
                className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-all hover:shadow-md"
              >
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => handleMove(i, -1)}
                    disabled={i === 0}
                    className="text-slate-300 transition-colors hover:text-slate-500 disabled:opacity-30"
                    title="Move up"
                  >
                    <GripVertical className="h-4 w-4 rotate-180" />
                  </button>
                  <button
                    onClick={() => handleMove(i, 1)}
                    disabled={i === images.length - 1}
                    className="text-slate-300 transition-colors hover:text-slate-500 disabled:opacity-30"
                    title="Move down"
                  >
                    <GripVertical className="h-4 w-4" />
                  </button>
                </div>
                <span className="w-6 text-center text-sm font-medium text-slate-400">{i + 1}</span>
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                  <img src={img.dataUrl} alt={img.file.name} className="h-full w-full object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-700">{img.file.name}</p>
                  <p className="text-xs text-slate-400">
                    {img.width}×{img.height} · {formatBytes(img.file.size)}
                  </p>
                </div>
                <button
                  onClick={() => handleRemove(i)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-rose-50 hover:text-rose-500"
                  title="Remove"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Settings */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <button
              onClick={() => setShowSettings((s) => !s)}
              className="flex w-full items-center justify-between"
            >
              <span className="flex items-center gap-2 font-medium text-slate-700">
                <Settings2 className="h-5 w-5 text-sky-500" />
                PDF Settings
              </span>
              <span className="text-sm text-slate-400">{showSettings ? 'Hide' : 'Show'}</span>
            </button>

            {showSettings && (
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-600">Page Size</label>
                  <div className="grid grid-cols-4 gap-2">
                    {PAGE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setPageSize(opt.value)}
                        className={`rounded-lg py-2 text-sm font-medium transition-all ${
                          pageSize === opt.value
                            ? 'bg-sky-500 text-white shadow-sm'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {pageSize !== 'fit' && (
                  <>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-600">Orientation</label>
                      <div className="grid grid-cols-3 gap-2">
                        {ORIENTATION_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => setOrientation(opt.value)}
                            className={`rounded-lg py-2 text-sm font-medium transition-all ${
                              orientation === opt.value
                                ? 'bg-sky-500 text-white shadow-sm'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="mb-2 flex items-center justify-between text-sm font-medium text-slate-600">
                        <span>Page Margin</span>
                        <span className="text-sky-600">{margin} mm</span>
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={40}
                        step={1}
                        value={margin}
                        onChange={(e) => setMargin(Number(e.target.value))}
                        className="w-full accent-sky-500"
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Convert button */}
          <button
            onClick={handleConvert}
            disabled={converting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 py-3.5 font-semibold text-white shadow-lg shadow-sky-500/25 transition-all hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {converting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Converting... {progress}%
              </>
            ) : (
              <>
                <FileStack className="h-5 w-5" />
                Create PDF
              </>
            )}
          </button>

          {converting && (
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sky-400 to-sky-600 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
              {error}
            </div>
          )}

          {resultBlob && (
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 sm:flex-row sm:justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                <div>
                  <p className="font-medium text-emerald-800">PDF created successfully!</p>
                  <p className="text-sm text-emerald-600">{formatBytes(resultBlob.size)} · {images.length} pages</p>
                </div>
              </div>
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 font-semibold text-white shadow-lg shadow-emerald-500/25 transition-all hover:bg-emerald-600"
              >
                <Download className="h-5 w-5" />
                Download PDF
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
