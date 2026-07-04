import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Download, Trash2, Loader2, Settings2, Images, CheckCircle2 } from 'lucide-react';
import { Dropzone } from './Dropzone';
import {
  convertPdfToImages,
  downloadBlob,
  formatBytes,
  renderPdfPageToBlob,
  type ImageFormat,
  type PdfPageResult,
} from '../lib/pdfToImage';
import { downloadAsZip } from '../lib/zipUtils';

const FORMAT_OPTIONS: { value: ImageFormat; label: string }[] = [
  { value: 'png', label: 'PNG' },
  { value: 'jpg', label: 'JPG' },
  { value: 'avif', label: 'AVIF' },
  { value: 'webp', label: 'WebP' },
];

const MIN_RESOLUTION_OPTIONS = [
  { value: 0, label: 'Original' },
  { value: 1280, label: '720p (1280×720)' },
  { value: 1920, label: '1080p (1920×1080)' },
  { value: 2560, label: '1440p (2560×1440)' },
  { value: 3840, label: '4K (3840×2160)' },
];

export function PdfToImagePanel() {
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<ImageFormat>('png');
  const [minResolution, setMinResolution] = useState(1920);
  const [quality, setQuality] = useState(0.92);
  const [converting, setConverting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<PdfPageResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const fileRef = useRef<File | null>(null);
  const previewUrlsRef = useRef<string[]>([]);
  const conversionRequestRef = useRef(0);
  const fullResCache = useRef<Map<number, Blob>>(new Map()); // Cache for full-res images

  const syncPreviewUrls = useCallback((nextResults: PdfPageResult[]) => {
    const nextUrls = nextResults.map((page) => page.previewUrl);
    previewUrlsRef.current
      .filter((url) => !nextUrls.includes(url))
      .forEach((url) => URL.revokeObjectURL(url));
    previewUrlsRef.current = nextUrls;
  }, []);

  useEffect(() => {
    return () => {
      previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      previewUrlsRef.current = [];
      fullResCache.current.clear();
    };
  }, [syncPreviewUrls]);

  useEffect(() => {
    const handleClearAll = () => {
      // Clear all resources when "Clear All Resources" is clicked
      fullResCache.current.clear();
      syncPreviewUrls([]);
      setFile(null);
      setResults([]);
      setError(null);
      setProgress(0);
    };

    // Listen for the global cleanup event
    window.addEventListener('pdf-tool:clear-all', handleClearAll);
    
    // Cleanup the event listener when component unmounts
    return () => window.removeEventListener('pdf-tool:clear-all', handleClearAll);
  }, [syncPreviewUrls]);

  const handleFiles = useCallback((files: File[]) => {
    const pdf = files.find((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (!pdf) {
      setError('Please select a valid PDF file.');
      return;
    }
    setFile(pdf);
    setResults([]);
    setError(null);
    setProgress(0);
    fullResCache.current.clear();
  }, []);

  const handleConvert = useCallback(async () => {
    if (!file) return;
    const requestId = ++conversionRequestRef.current;
    setConverting(true);
    setError(null);
    setProgress(0);
    setResults([]);
    fileRef.current = file;
    fullResCache.current.clear();
    
    try {
      const pages = await convertPdfToImages(file, {
        format,
        minScale: 1,
        minResolution: { width: minResolution, height: Math.round((minResolution / 16) * 9) },
        quality,
        onProgress: (current, total) => setProgress(Math.round((current / total) * 100)),
      });
      
      if (requestId !== conversionRequestRef.current) {
        pages.forEach((page) => URL.revokeObjectURL(page.previewUrl));
        return;
      }
      
      syncPreviewUrls(pages);
      setResults(pages);
    } catch (err) {
      if (requestId === conversionRequestRef.current) {
        setError(err instanceof Error ? err.message : 'Conversion failed');
      }
    } finally {
      if (requestId === conversionRequestRef.current) {
        setConverting(false);
      }
    }
  }, [file, format, minResolution, quality]);

  const handleDownloadOne = useCallback(async (page: PdfPageResult) => {
    if (!file) return;
    
    setConverting(true);
    const base = file.name.replace(/\.pdf$/i, '') ?? 'page';
    
    try {
      // Check cache first
      let blob = fullResCache.current.get(page.pageNumber);
      
      if (!blob) {
        // Generate full-res image
        blob = await renderPdfPageToBlob(file, page.pageNumber, {
          format,
          minScale: 1,
          minResolution: { width: minResolution, height: Math.round((minResolution / 16) * 9) },
          quality,
        });
        fullResCache.current.set(page.pageNumber, blob);
      }
      
      downloadBlob(blob, `${base}_page_${page.pageNumber}.${format}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setConverting(false);
    }
  }, [file, format, minResolution, quality]);

  const handleDownloadAll = useCallback(async () => {
    if (!file) return;
    
    setConverting(true);
    const base = file.name.replace(/\.pdf$/i, '') ?? 'converted';
    
    try {
      const zipFiles: { blob: Blob; filename: string }[] = [];
      
      // Generate all full-res images
      for (let i = 0; i < results.length; i++) {
        const page = results[i];
        
        // Check cache first
        let blob = fullResCache.current.get(page.pageNumber);
        
        if (!blob) {
          blob = await renderPdfPageToBlob(file, page.pageNumber, {
            format,
            minScale: 1,
            minResolution: { width: minResolution, height: Math.round((minResolution / 16) * 9) },
            quality,
          });
          fullResCache.current.set(page.pageNumber, blob);
        }
        
        zipFiles.push({
          blob,
          filename: `${base}_page_${page.pageNumber}.${format}`,
        });
        
        setProgress(Math.round(((i + 1) / results.length) * 100));
      }
      
      // Download as ZIP
      await downloadAsZip(zipFiles, base);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setConverting(false);
    }
  }, [file, format, minResolution, quality, results]);

  const handleReset = () => {
    conversionRequestRef.current += 1;
    syncPreviewUrls([]);
    setFile(null);
    setResults([]);
    setError(null);
    setProgress(0);
    fullResCache.current.clear();
  };

  return (
    <div className="space-y-6">
      {!file && <Dropzone accept="application/pdf,.pdf" title="Drop a PDF here" subtitle="or click to browse — PDF files only" icon={<FileText className="h-8 w-8" />} onFiles={handleFiles} />}

      {file && (
        <div className="space-y-5">
          {/* File card */}
          <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-500">
              <FileText className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-slate-800">{file.name}</p>
              <p className="text-sm text-slate-500">{formatBytes(file.size)}</p>
            </div>
            <button
              onClick={handleReset}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              title="Remove file"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          </div>

          {/* Settings */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <button
              onClick={() => setShowSettings((s) => !s)}
              className="flex w-full items-center justify-between"
            >
              <span className="flex items-center gap-2 font-medium text-slate-700">
                <Settings2 className="h-5 w-5 text-sky-500" />
                Conversion Settings
              </span>
              <span className="text-sm text-slate-400">{showSettings ? 'Hide' : 'Show'}</span>
            </button>

            {showSettings && (
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-600">Output Format</label>
                  <div className="grid grid-cols-4 gap-2">
                    {FORMAT_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setFormat(opt.value)}
                        className={`rounded-lg py-2 text-sm font-medium transition-all ${
                          format === opt.value
                            ? 'bg-sky-500 text-white shadow-sm'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-600">Minimum Resolution</label>
                  <select
                    value={minResolution}
                    onChange={(e) => setMinResolution(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
                  >
                    {MIN_RESOLUTION_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <p className="mt-1.5 text-xs text-slate-400">
                    Output is guaranteed to be at least this size (16:9). Smaller pages are scaled up.
                  </p>
                </div>

                {(format === 'jpg' || format === 'webp') && (
                  <div className="sm:col-span-2">
                    <label className="mb-2 flex items-center justify-between text-sm font-medium text-slate-600">
                      <span>Quality</span>
                      <span className="text-sky-600">{Math.round(quality * 100)}%</span>
                    </label>
                    <input
                      type="range"
                      min={0.3}
                      max={1}
                      step={0.01}
                      value={quality}
                      onChange={(e) => setQuality(Number(e.target.value))}
                      className="w-full accent-sky-500"
                    />
                  </div>
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
                <Images className="h-5 w-5" />
                Convert to {format.toUpperCase()}
              </>
            )}
          </button>

          {/* Progress bar */}
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

          {/* Results */}
          {results.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-700">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  <span className="font-medium">{results.length} pages converted</span>
                </div>
                <button
                  onClick={handleDownloadAll}
                  className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-600"
                >
                  <Download className="h-4 w-4" />
                  Download All as ZIP
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {results.map((page) => (
                  <div key={page.pageNumber} className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all hover:shadow-md">
                    <div className="relative aspect-[3/4] overflow-hidden bg-slate-100">
                      <img
                        src={page.previewUrl}
                        alt={`Page ${page.pageNumber}`}
                        className="h-full w-full object-contain"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-slate-900/0 opacity-0 transition-all group-hover:bg-slate-900/30 group-hover:opacity-100">
                        <button
                          onClick={() => handleDownloadOne(page)}
                          className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-sky-600 shadow-lg transition-transform hover:scale-110"
                          title="Download this page"
                        >
                          <Download className="h-5 w-5" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between px-3 py-2">
                      <span className="text-sm font-medium text-slate-600">Page {page.pageNumber}</span>
                      <span className="text-xs text-slate-400">Preview ready</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
