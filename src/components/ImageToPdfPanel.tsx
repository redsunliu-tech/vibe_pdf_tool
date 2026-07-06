import { useCallback, useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Download, Trash2, Loader2, Settings2, FileStack, GripVertical, X } from 'lucide-react';
import { Dropzone } from './Dropzone';
import {
  convertImagesToPdf,
  calculatePageLayout,
  getImageDimensions,
  type ImageInput,
  type Orientation,
  type PageSize,
  type PdfOutputMode,
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

const OUTPUT_MODE_OPTIONS: { value: PdfOutputMode; label: string; description: string }[] = [
  { value: 'single', label: 'Merge into one PDF', description: 'All images become pages in a single file' },
  { value: 'multiple', label: 'One PDF per image', description: 'Each image becomes an independent PDF file' },
];

export function ImageToPdfPanel() {
  interface PdfPreviewResult {
    index: number;
    previewUrl: string;
    pageWidth: number;
    pageHeight: number;
    imageWidth: number;
    imageHeight: number;
    fileName: string;
    pageSize: PageSize;
    orientation: 'portrait' | 'landscape';
  }

  const [images, setImages] = useState<ImageInput[]>([]);
  const [pageSize, setPageSize] = useState<PageSize>('a4');
  const [orientation, setOrientation] = useState<Orientation>('auto');
  const [margin, setMargin] = useState(10);
  const [outputMode, setOutputMode] = useState<PdfOutputMode>('single');
  const [converting, setConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<PdfPreviewResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(false);
  const previewUrlsRef = useRef<string[]>([]);
  const fileReadRequestRef = useRef(0);
  const conversionRequestRef = useRef(0);
  const pdfCache = useRef<Map<number, Blob>>(new Map());
  const resultsRef = useRef<PdfPreviewResult[]>([]);
  const progressBarRef = useRef<HTMLDivElement>(null);

  function dataUrlToBlob(dataUrl: string): Blob {
    const parts = dataUrl.split(',');
    const mime = parts[0].match(/:(.*?);/)![1];
    const bstr = atob(parts[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  }

  const syncPreviewUrls = useCallback((nextImages: ImageInput[]) => {
    const nextUrls = nextImages.map((img) => img.previewUrl);
    previewUrlsRef.current
      .filter((url) => !nextUrls.includes(url))
      .forEach((url) => URL.revokeObjectURL(url));
    previewUrlsRef.current = nextUrls;
  }, []);

  const clearResults = useCallback(() => {
    resultsRef.current.forEach((r) => URL.revokeObjectURL(r.previewUrl));
    resultsRef.current = [];
    setResults([]);
    setProgress(0);
    pdfCache.current.clear();
  }, []);

  useEffect(() => {
    resultsRef.current = results;
  }, [results]);

  useEffect(() => {
    if (images.length === 1) {
      setPageSize('fit');
    } else if (images.length > 1) {
      setPageSize('a4');
    }
  }, [images.length]);

  const generatePreview = useCallback(async (image: ImageInput, index: number): Promise<PdfPreviewResult> => {
    const layout = calculatePageLayout(pageSize, orientation, margin, image.width, image.height, image.dpi);
    
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const imgEl = new Image();
      imgEl.onload = () => resolve(imgEl);
      imgEl.onerror = () => reject(new Error('Failed to load image'));
      imgEl.src = image.dataUrl;
    });

    const previewMaxDim = 150;
    const scale = Math.min(1, previewMaxDim / Math.max(layout.width, layout.height));
    const canvasWidth = Math.floor(layout.width * scale);
    const canvasHeight = Math.floor(layout.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d');
    
    ctx!.fillStyle = '#ffffff';
    ctx!.fillRect(0, 0, canvasWidth, canvasHeight);
    
    const drawW = layout.drawW * scale;
    const drawH = layout.drawH * scale;
    const drawX = (canvasWidth - drawW) / 2;
    const drawY = (canvasHeight - drawH) / 2;
    
    const sourceW = img.naturalWidth || img.width;
    const sourceH = img.naturalHeight || img.height;
    ctx!.drawImage(img, 0, 0, sourceW, sourceH, drawX, drawY, drawW, drawH);
    
    const dataUrl = canvas.toDataURL('image/png');
    const previewUrl = URL.createObjectURL(dataUrlToBlob(dataUrl));
    
    const baseName = image.file.name.replace(/\.[^.]+$/, '');
    const fileName = `${baseName}.pdf`;

    return {
      index,
      previewUrl,
      pageWidth: layout.width,
      pageHeight: layout.height,
      imageWidth: image.width,
      imageHeight: image.height,
      fileName,
      pageSize,
      orientation: layout.orientation,
    };
  }, [pageSize, orientation, margin]);

  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrlsRef.current = [];
      resultsRef.current.forEach((r) => URL.revokeObjectURL(r.previewUrl));
    };
  }, [syncPreviewUrls]);

  useEffect(() => {
    const handleClearAll = () => {
      setImages([]);
      setConverting(false);
      setError(null);
      setProgress(0);
      clearResults();
    };

    window.addEventListener('pdf-tool:clear-all', handleClearAll);
    return () => window.removeEventListener('pdf-tool:clear-all', handleClearAll);
  }, [clearResults]);

  useEffect(() => {
    clearResults();
  }, [pageSize, orientation, margin, outputMode, clearResults]);

  useEffect(() => {
    if (progressBarRef.current) {
      progressBarRef.current.style.width = `${progress}%`;
    }
  }, [progress]);

  const handleFiles = useCallback(async (files: File[]) => {
    const valid = files.filter((f) => f.type.startsWith('image/'));
    if (!valid.length) {
      setError('Please select valid image files (PNG, JPG, BMP, WebP).');
      return;
    }
    clearResults();
    const requestId = ++fileReadRequestRef.current;
    setError(null);
    setLoading(true);
    try {
      const inputs: ImageInput[] = [];
      for (const file of valid) {
        const dims = await getImageDimensions(file);
        inputs.push({
          file,
          dataUrl: dims.dataUrl,
          previewUrl: URL.createObjectURL(file),
          width: dims.width,
          height: dims.height,
          bytes: dims.bytes,
          dpi: dims.dpi,
        });
      }
      setImages((prev) => {
        if (requestId !== fileReadRequestRef.current) {
          inputs.forEach((input) => URL.revokeObjectURL(input.previewUrl));
          return prev;
        }
        const next = [...prev, ...inputs];
        syncPreviewUrls(next);
        return next;
      });
    } catch {
      if (requestId === fileReadRequestRef.current) {
        setError('Failed to read one or more images.');
      }
    } finally {
      if (requestId === fileReadRequestRef.current) {
        setLoading(false);
      }
    }
  }, [syncPreviewUrls, clearResults]);

  const handleRemove = (index: number) => {
    fileReadRequestRef.current += 1;
    clearResults();
    setImages((prev) => {
      const next = prev.filter((_, i) => i !== index);
      syncPreviewUrls(next);
      return next;
    });
  };

  const handleMove = (index: number, dir: -1 | 1) => {
    clearResults();
    setImages((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleClear = () => {
    fileReadRequestRef.current += 1;
    clearResults();
    setImages(() => {
      syncPreviewUrls([]);
      return [];
    });
    setError(null);
  };

  const handleConvert = useCallback(async () => {
    if (!images.length) return;
    
    const requestId = ++conversionRequestRef.current;
    setConverting(true);
    setError(null);
    clearResults();
    
    try {
      const previews: PdfPreviewResult[] = [];
      
      for (let i = 0; i < images.length; i++) {
        const preview = await generatePreview(images[i], i);
        previews.push(preview);
        setProgress(Math.round(((i + 1) / images.length) * 100));
        
        if (requestId !== conversionRequestRef.current) {
          previews.forEach((p) => URL.revokeObjectURL(p.previewUrl));
          return;
        }
      }
      
      if (requestId === conversionRequestRef.current) {
        setResults(previews);
      }
    } catch (err) {
      if (requestId === conversionRequestRef.current) {
        setError(err instanceof Error ? err.message : 'Preview generation failed');
      }
    } finally {
      if (requestId === conversionRequestRef.current) {
        setConverting(false);
      }
    }
  }, [images, generatePreview, clearResults]);

  const generatePdf = useCallback(async (index?: number): Promise<Blob[]> => {
    setConverting(true);
    
    try {
      if (index !== undefined) {
        const blobs = await convertImagesToPdf([images[index]], {
          pageSize,
          orientation,
          margin,
          outputMode: 'multiple',
          onProgress: (current) => setProgress(Math.round((current / images.length) * 100)),
        });
        const result = Array.isArray(blobs) ? blobs : [blobs];
        pdfCache.current.set(index, result[0]);
        return result;
      }
      
      const blobs = await convertImagesToPdf(images, {
        pageSize,
        orientation,
        margin,
        outputMode,
        onProgress: (current, total) => setProgress(Math.round((current / total) * 100)),
      });
      
      const result = Array.isArray(blobs) ? blobs : [blobs];
      
      if (outputMode === 'single') {
        pdfCache.current.set(0, result[0]);
      } else {
        result.forEach((blob, i) => {
          pdfCache.current.set(i, blob);
        });
      }
      
      return result;
    } finally {
      setConverting(false);
    }
  }, [images, pageSize, orientation, margin, outputMode]);

  const handleDownload = useCallback(async (index?: number) => {
    if (!images.length) return;
    
    try {
      let blobs: Blob[];
      let fileName: string;
      
      if (outputMode === 'single') {
        const cached = pdfCache.current.get(0);
        if (cached) {
          blobs = [cached];
        } else {
          blobs = await generatePdf();
        }
        fileName = results.length > 0 ? `${images[0].file.name.replace(/\.[^.]+$/, '')}_merged.pdf` : 'converted.pdf';
      } else {
        const cacheKey = index ?? 0;
        const cached = pdfCache.current.get(cacheKey);
        if (cached) {
          blobs = [cached];
        } else {
          blobs = await generatePdf(index);
        }
        const result = results.find((r) => r.index === cacheKey);
        fileName = result?.fileName || `converted-${cacheKey + 1}.pdf`;
      }
      
      downloadBlob(blobs[0], fileName);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    }
  }, [images, outputMode, generatePdf, results]);

  const handleDownloadAll = useCallback(async () => {
    if (!images.length || outputMode !== 'multiple') return;
    
    setConverting(true);
    
    try {
      const { downloadAsZip } = await import('../lib/zipUtils');
      
      const zipFiles: { blob: Blob; filename: string }[] = [];
      
      for (let i = 0; i < images.length; i++) {
        const cached = pdfCache.current.get(i);
        const result = results.find((r) => r.index === i);
        const fileName = result?.fileName || `${images[i].file.name.replace(/\.[^.]+$/, '')}.pdf`;
        
        if (cached) {
          zipFiles.push({ blob: cached, filename: fileName });
        } else {
          const blobs = await generatePdf(i);
          if (blobs.length > 0) {
            zipFiles.push({ blob: blobs[0], filename: fileName });
          }
        }
        
        setProgress(Math.round(((i + 1) / images.length) * 100));
      }
      
      await downloadAsZip(zipFiles, 'converted_pdfs');
      
      pdfCache.current.clear();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setConverting(false);
    }
  }, [images, outputMode, generatePdf, results]);

  return (
    <div className="space-y-6">
      {images.length === 0 && (
        <Dropzone
          accept="image/png,image/jpeg,image/bmp,image/webp,image/avif,.png,.jpg,.jpeg,.bmp,.webp,.avif"
                title="Drop images here"
                subtitle="or click to browse — PNG, JPG, BMP, WebP, AVIF supported"
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
                title="Add more images"
                accept="image/png,image/jpeg,image/bmp,image/webp,.png,.jpg,.jpeg,.bmp,.webp"
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
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                  <img src={img.previewUrl} alt={img.file.name} className="h-full w-full object-cover" />
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

                <div className="sm:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-slate-600">Output Mode</label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {OUTPUT_MODE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setOutputMode(opt.value)}
                        className={`rounded-xl border px-4 py-3 text-left transition-all ${
                          outputMode === opt.value
                            ? 'border-sky-500 bg-sky-50 text-sky-700 shadow-sm'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <span className="block text-sm font-semibold">{opt.label}</span>
                        <span className="mt-1 block text-xs opacity-80">{opt.description}</span>
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
                      <label htmlFor="page-margin" className="mb-2 flex items-center justify-between text-sm font-medium text-slate-600">
                        <span>Page Margin</span>
                        <span className="text-sky-600">{margin} mm</span>
                      </label>
                      <input
                        id="page-margin"
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

          {/* Progress bar during conversion */}
          {converting && (
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                ref={progressBarRef}
                className="h-full rounded-full bg-gradient-to-r from-sky-400 to-sky-600 transition-all duration-300"
              />
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
              {error}
            </div>
          )}

          {results.length === 0 ? (
            <button
              onClick={handleConvert}
              disabled={converting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 py-3.5 font-semibold text-white shadow-lg shadow-sky-500/25 transition-all hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {converting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Generating previews... {progress}%
                </>
              ) : (
                <>
                  <Loader2 className="h-5 w-5" />
                  Convert to PDF Preview
                </>
              )}
            </button>
          ) : (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-600">Preview ({results.length} page{results.length !== 1 ? 's' : ''})</span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {results.map((result) => (
                  <div
                    key={result.index}
                    className="group rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-all hover:shadow-md"
                  >
                    <div className="relative aspect-[210/297] overflow-hidden rounded-lg bg-slate-50">
                      <img
                        src={result.previewUrl}
                        alt={`Preview ${result.index + 1}`}
                        className="h-full w-full object-contain"
                      />
                      {outputMode === 'multiple' && (
                        <button
                          onClick={() => handleDownload(result.index)}
                          disabled={converting}
                          className="absolute bottom-2 right-2 flex items-center gap-1 rounded-lg bg-white/90 px-2 py-1 text-xs font-medium text-sky-600 shadow-sm transition-all hover:bg-white hover:text-sky-700 disabled:opacity-50"
                        >
                          <Download className="h-3 w-3" />
                          Download
                        </button>
                      )}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                      <span>Page {result.index + 1}</span>
                      <span>{result.pageSize.toUpperCase()} {result.orientation}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                {outputMode === 'single' ? (
                  <button
                    onClick={() => handleDownload()}
                    disabled={converting}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 py-3.5 font-semibold text-white shadow-lg shadow-sky-500/25 transition-all hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {converting ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Generating... {progress}%
                      </>
                    ) : (
                      <>
                        <Download className="h-5 w-5" />
                        Download PDF
                      </>
                    )}
                  </button>
                ) : images.length === 1 ? (
                  <button
                    onClick={() => handleDownload(0)}
                    disabled={converting}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 py-3.5 font-semibold text-white shadow-lg shadow-sky-500/25 transition-all hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {converting ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Generating... {progress}%
                      </>
                    ) : (
                      <>
                        <Download className="h-5 w-5" />
                        Download PDF
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={() => handleDownloadAll()}
                    disabled={converting}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 py-3.5 font-semibold text-white shadow-lg shadow-sky-500/25 transition-all hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {converting ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Generating... {progress}%
                      </>
                    ) : (
                      <>
                        <Download className="h-5 w-5" />
                        Download All as ZIP
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
