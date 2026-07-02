// src/App.tsx
import { useState } from 'react';
import { FileImage, FileText, ArrowLeftRight, ShieldCheck, Zap, Sparkles, Trash2 } from 'lucide-react';
import { PdfToImagePanel } from './components/PdfToImagePanel';
import { ImageToPdfPanel } from './components/ImageToPdfPanel';

type Tab = 'pdf-to-image' | 'image-to-pdf';

function App() {
  const [tab, setTab] = useState<Tab>('pdf-to-image');

  const handleClearAll = () => {
    // Dispatch event to clear resources in all panels
    window.dispatchEvent(new Event('pdf-tool:clear-all'));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-sky-50/40 to-slate-100">
      {/* Decorative background */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-96 w-96 rounded-full bg-sky-200/30 blur-3xl" />
        <div className="absolute -right-40 top-20 h-96 w-96 rounded-full bg-cyan-200/20 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
        {/* Header */}
        <header className="mb-10 text-center">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-500 text-white shadow-lg shadow-sky-500/30">
            <ArrowLeftRight className="h-7 w-7" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            PDF Converter
          </h1>
          <p className="mx-auto mt-3 max-w-md text-slate-500">
            Convert a single PDF to image/images, or image/images into one PDF or multiple PDFs — fast, free, and entirely in your browser.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs font-medium text-slate-400">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-500" />
              100% Private — files never leave your device
            </span>
            <span className="flex items-center gap-1.5">
              <Zap className="h-4 w-4 text-amber-500" />
              No upload limits
            </span>
            <span className="flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-sky-500" />
              No sign-up required
            </span>
          </div>
        </header>

        {/* Tabs */}
        <div className="mb-6 space-y-2">
          {/* Main tabs */}
          <div className="flex items-center rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
            <button
              onClick={() => setTab('pdf-to-image')}
              className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all ${
                tab === 'pdf-to-image'
                  ? 'bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-md shadow-sky-500/20'
                  : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              <FileImage className="h-5 w-5" />
              PDF to Image
            </button>
            <button
              onClick={() => setTab('image-to-pdf')}
              className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all ${
                tab === 'image-to-pdf'
                  ? 'bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-md shadow-sky-500/20'
                  : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              <FileText className="h-5 w-5" />
              Image to PDF
            </button>
          </div>
          
          {/* Secondary action bar with context-aware positioning */}
          <div className="flex items-center rounded-xl border border-slate-100 bg-slate-50/50 px-2 py-1.5">
            {/* Conditionally positioned Clear button */}
            {tab === 'pdf-to-image' && (
              <button
                onClick={handleClearAll}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 transition-all hover:bg-white hover:text-rose-500 hover:shadow-sm"
                title="Clear PDF to Image resources"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear
              </button>
            )}
            
            {/* Spacer to push content to opposite side */}
            <div className="flex-1" />
            
            {/* Conditionally positioned Clear button */}
            {tab === 'image-to-pdf' && (
              <button
                onClick={handleClearAll}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 transition-all hover:bg-white hover:text-rose-500 hover:shadow-sm"
                title="Clear Image to PDF resources"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Panel */}
        <main className="rounded-3xl border border-slate-200 bg-white/80 p-5 shadow-xl shadow-slate-200/50 backdrop-blur-sm sm:p-7">
          {/* Keep both panels mounted but hide the inactive one */}
          <div className={tab === 'pdf-to-image' ? 'block' : 'hidden'}>
            <PdfToImagePanel />
          </div>
          <div className={tab === 'image-to-pdf' ? 'block' : 'hidden'}>
            <ImageToPdfPanel />
          </div>
        </main>

        {/* Footer */}
        <footer className="mt-8 text-center text-xs text-slate-400">
          <p>All processing happens locally in your browser. Your files are never uploaded to any server.</p>
        </footer>
      </div>
    </div>
  );
}

export default App;