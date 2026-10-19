import { useEffect, useRef, useState } from 'react';
import { Camera as CameraIcon, ImageUp, SwitchCamera } from 'lucide-react';
import { scanImage } from '../../shared/qr/detect.ts';

interface Found {
  text: string;
  corners: Array<{ x: number; y: number }> | null;
}

const MAX_SIDE = 720; // frames are scaled down to this before decoding

/**
 * A live camera scanner. Frames go to a worker running QRaftly's own decoder (no browser QR API needed, so it
 * works in Chrome on Windows and in Firefox too). The same text is reported at most once every `repeatMs`.
 */
export function Camera({ onResult, paused = false, repeatMs = 2500 }: { onResult(text: string): void; paused?: boolean; repeatMs?: number }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  /** Bumped by "Turn on camera" to ask for the camera again. */
  const [attempt, setAttempt] = useState(0);
  const [starting, setStarting] = useState(false);
  const [box, setBox] = useState<string | null>(null);
  const cb = useRef(onResult);
  cb.current = onResult;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    let timer = 0;
    const worker = new Worker(new URL('./scan-worker.ts', import.meta.url), { type: 'module' });
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    let busy = false;
    let last = { text: '', at: 0 };
    let scale = 1;

    worker.onmessage = (e: MessageEvent<Found & { id: number }>) => {
      busy = false;
      const v = video.current;
      if (!v || stopped) return;
      if (e.data.corners) {
        // Map frame coordinates onto the displayed video (object-fit: cover).
        const vw = v.videoWidth;
        const vh = v.videoHeight;
        const cw = v.clientWidth;
        const ch = v.clientHeight;
        const s = Math.max(cw / vw, ch / vh);
        const ox = (cw - vw * s) / 2;
        const oy = (ch - vh * s) / 2;
        setBox(e.data.corners.map((p) => `${(p.x / scale) * s + ox},${(p.y / scale) * s + oy}`).join(' '));
      } else setBox(null);
      if (e.data.text && !pausedRef.current) {
        const now = Date.now();
        if (e.data.text !== last.text || now - last.at > repeatMs) {
          last = { text: e.data.text, at: now };
          navigator.vibrate?.(60);
          cb.current(e.data.text);
        }
      }
    };

    const tick = () => {
      if (stopped) return;
      const v = video.current;
      if (v && v.readyState >= 2 && !busy && !pausedRef.current) {
        scale = Math.min(1, MAX_SIDE / Math.max(v.videoWidth, v.videoHeight));
        canvas.width = Math.round(v.videoWidth * scale);
        canvas.height = Math.round(v.videoHeight * scale);
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        busy = true;
        worker.postMessage({ id: Date.now(), data: img.data, width: img.width, height: img.height }, [img.data.buffer]);
      }
      timer = window.setTimeout(tick, 90);
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('This browser cannot open the camera here. Use HTTPS, or upload a photo of the code.');
        return;
      }
      setStarting(true);
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        const v = video.current!;
        v.srcObject = stream;
        await v.play().catch(() => {});
        setError('');
        tick();
      } catch (e) {
        setError((e as DOMException).name === 'NotAllowedError' ? 'Camera access was blocked. Allow it in the address bar, or upload a photo.' : 'No camera was found. You can upload a photo or type the code instead.');
      } finally {
        if (!stopped) setStarting(false);
      }
    })();

    return () => {
      stopped = true;
      clearTimeout(timer);
      worker.terminate();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [facing, repeatMs, attempt]);

  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="scanner">
        {error ? (
          <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: '#fff', textAlign: 'center', padding: 24 }}>
            <div>
              <CameraIcon size={36} style={{ opacity: 0.6 }} />
              <p style={{ margin: '10px 0 0' }}>{error}</p>
              <button type="button" className="btn primary sm" style={{ marginTop: 16 }} disabled={starting} onClick={() => setAttempt((a) => a + 1)}>
                <CameraIcon size={16} /> {starting ? 'Asking for the camera…' : 'Turn on camera'}
              </button>
              {error.startsWith('Camera access was blocked') && <p className="small" style={{ margin: '10px 0 0', opacity: 0.75 }}>If nothing happens, click the camera icon in the address bar and choose “Allow”.</p>}
            </div>
          </div>
        ) : (
          <>
            <video ref={video} playsInline muted />
            <div className="frame" />
            <svg className="overlay">{box && <polygon points={box} fill="rgb(34 197 94 / 0.18)" stroke="#22c55e" strokeWidth={3} strokeLinejoin="round" />}</svg>
            <span className="hint">{paused ? 'Paused' : 'Point the camera at a QR code'}</span>
          </>
        )}
      </div>
      <div className="row">
        <button type="button" className="btn sm" onClick={() => setFacing(facing === 'environment' ? 'user' : 'environment')}>
          <SwitchCamera size={15} /> Switch camera
        </button>
        <PhotoButton onResult={(t) => cb.current(t)} />
      </div>
    </div>
  );
}

/** Reads a code from a photo file with the same decoder. */
export function PhotoButton({ onResult, label = 'Upload a photo' }: { onResult(text: string): void; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const read = (file: File) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      // Try a few sizes: phone photos are large, and codes may be small or fill the frame.
      for (const side of [1000, 1600, 640]) {
        const s = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * s);
        c.height = Math.round(img.naturalHeight * s);
        const ctx = c.getContext('2d')!;
        ctx.drawImage(img, 0, 0, c.width, c.height);
        const got = scanImage(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
        if (got) {
          setMsg('');
          return onResult(got.text);
        }
      }
      setMsg('No QR code found in that picture. Try a sharper, closer photo.');
    };
    img.onerror = () => setMsg('That file could not be opened as an image.');
    img.src = url;
  };
  return (
    <>
      <button type="button" className="btn sm" onClick={() => ref.current?.click()}>
        <ImageUp size={15} /> {label}
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) read(f);
          e.target.value = '';
        }}
      />
      {msg && <span className="small" style={{ color: 'var(--bad)' }}>{msg}</span>}
    </>
  );
}
