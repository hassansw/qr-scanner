"use client";

import { decodeImageData, imageDataFromUrl } from "@/lib/qrDecode";
import { useCallback, useEffect, useRef, useState } from "react";
import { extractSessionUuid } from "@/lib/qr";
import type { ScanResult, ScanStatus } from "@/lib/types";
import ResultCard from "@/components/ResultCard";
import VisitorForm from "@/components/VisitorForm";
import {
  CameraIcon,
  FlashIcon,
  FlashOffIcon,
  InstallIcon,
  RefreshIcon,
  ScanIcon,
  TrashIcon,
  UploadIcon,
} from "@/components/Icons";

const HISTORY_KEY = "qr-scanner:history";
const MAX_HISTORY = 12;

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

function readHistory(): ScanResult[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ScanResult[]) : [];
  } catch {
    return [];
  }
}

function timeAgo(timestamp: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

export default function Scanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectingRef = useRef(false);
  const lastCodeRef = useRef<{ code: string; at: number } | null>(null);
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null);

  const [status, setStatus] = useState<ScanStatus>("idle");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [sessionUuid, setSessionUuid] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState<string>("");
  const [torchOn, setTorchOn] = useState(false);
  const [history, setHistory] = useState<ScanResult[]>(() => readHistory());
  const [installReady, setInstallReady] = useState(false);

  const [insecure] = useState(
    () => typeof window !== "undefined" && !window.isSecureContext
  );

  const stopScanningLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const captureInputRef = useRef<HTMLInputElement>(null);

  const openDeviceCamera = useCallback(() => {
    stopScanningLoop();
    captureInputRef.current?.click();
  }, [stopScanningLoop]);

  const pushHistory = useCallback((entry: ScanResult) => {
    setHistory((prev) => {
      const next = [entry, ...prev].slice(0, MAX_HISTORY);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {
        /* storage full */
      }
      return next;
    });
  }, []);

  const handleScan = useCallback(
    (code: string) => {
      const now = Date.now();
      const last = lastCodeRef.current;
      if (last && last.code === code && now - last.at < 2000) return;
      lastCodeRef.current = { code, at: now };

      stopScanningLoop();

      const uuid = extractSessionUuid(code);
      if (!uuid) {
        const scanResult: ScanResult = {
          code,
          status: "error",
          message: "Could not find a valid session UUID in that QR code.",
          timestamp: now,
        };
        setResult(scanResult);
        setSessionUuid(null);
        setStatus("error");
        pushHistory(scanResult);
        return;
      }

      setResult(null);
      setSessionUuid(uuid);
      setStatus("form");
    },
    [pushHistory, stopScanningLoop]
  );

  const startScanningLoop = useCallback(() => {
    if (rafRef.current !== null) return;

    const scan = () => {
      rafRef.current = requestAnimationFrame(scan);
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2 || detectingRef.current) return;

      detectingRef.current = true;
      try {
        const width = Math.max(320, Math.min(960, Math.floor(video.videoWidth / 2)));
        const height = Math.max(240, Math.floor((width * video.videoHeight) / video.videoWidth));
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, width, height);
        const image = ctx.getImageData(0, 0, width, height);
        const text = decodeImageData(image.data, width, height);
        if (text) handleScan(text);
      } catch {
        /* frame read can fail in rare cases; keep scanning */
      } finally {
        detectingRef.current = false;
      }
    };

    rafRef.current = requestAnimationFrame(scan);
  }, [handleScan]);

  const setupCamera = useCallback(
    async (deviceId?: string) => {
      stopScanningLoop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      setCameraError(null);
      setTorchOn(false);

      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError(
          "Camera API not supported in this browser. Open the device camera or use the upload option."
        );
        setStatus("idle");
        return;
      }

      try {
        const constraints: MediaStreamConstraints = {
          video: deviceId
            ? { deviceId: { exact: deviceId } }
            : { facingMode: "environment" },
          audio: false,
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;

        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
        }

        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter((device) => device.kind === "videoinput");
        setCameras(videoInputs);
        if (!deviceId && videoInputs.length > 0) setCameraId(videoInputs[0].deviceId);

        setStatus("scanning");
        startScanningLoop();
      } catch {
        setCameraError(
          window.isSecureContext
            ? "Camera unavailable or permission denied. Allow camera access in your browser settings, then try again."
            : "Camera access needs HTTPS. Open the device camera instead."
        );
        setStatus("idle");
      }
    },
    [startScanningLoop, stopScanningLoop]
  );

  const handleVisitorDone = useCallback(
    (entry: ScanResult) => {
      setResult(entry);
      setSessionUuid(null);
      setStatus(entry.status);
      pushHistory(entry);
    },
    [pushHistory]
  );

  const resumeScan = useCallback(() => {
    setResult(null);
    setSessionUuid(null);
    setCameraError(null);
    if (!streamRef.current) {
      setStatus("idle");
      return;
    }
    setStatus("scanning");
    startScanningLoop();
  }, [startScanningLoop]);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      const next = !torchOn;
      await track.applyConstraints({
        advanced: [{ torch: next }] as unknown as MediaTrackConstraintSet[],
      });
      setTorchOn(next);
    } catch {
      /* torch unsupported on this device */
    }
  }, [torchOn]);

  const handleUpload = useCallback(
    (file: File) => {
      stopScanningLoop();
      setResult(null);

      const reader = new FileReader();
      reader.onload = async () => {
        const image = await imageDataFromUrl(reader.result as string);
        if (!image) {
          const scanResult: ScanResult = {
            code: "",
            status: "error",
            message: "Could not read that image file.",
            timestamp: Date.now(),
          };
          setResult(scanResult);
          setStatus("error");
          pushHistory(scanResult);
          return;
        }
        const text = decodeImageData(image.data, image.width, image.height, true);
        if (!text) {
          const scanResult: ScanResult = {
            code: "",
            status: "error",
            message: "No QR code found in that image.",
            timestamp: Date.now(),
          };
          setResult(scanResult);
          setStatus("error");
          pushHistory(scanResult);
          return;
        }
        handleScan(text);
      };
      reader.readAsDataURL(file);
    },
    [handleScan, pushHistory, stopScanningLoop]
  );

  const install = async () => {
    const promptEvent = promptRef.current;
    if (!promptEvent) return;
    await promptEvent.prompt();
    setInstallReady(false);
  };

  useEffect(() => {
    return () => {
      stopScanningLoop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [stopScanningLoop]);

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      promptRef.current = event as BeforeInstallPromptEvent;
      setInstallReady(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const cameraActive = status === "scanning";
  const showingForm = status === "form" && sessionUuid !== null;

  return (
    <div className="mx-auto w-full max-w-md flex-1 px-4 pb-8">
      {/* Header */}
      <header className="flex items-center justify-between py-5">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
              <ScanIcon className="h-4.5 w-4.5" />
            </span>
            QR Scanner
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500">Scan a code and register the visitor</p>
        </div>
        {installReady && (
          <button
            type="button"
            onClick={install}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-zinc-700 px-3 text-xs font-semibold text-zinc-200 transition hover:border-emerald-500 hover:text-emerald-300"
          >
            <InstallIcon className="h-4 w-4" />
            Install
          </button>
        )}
      </header>

      {showingForm ? (
        <VisitorForm sessionUuid={sessionUuid} onDone={handleVisitorDone} onCancel={resumeScan} />
      ) : (
        <>
          {/* Scanner viewport */}
          <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-zinc-800 bg-black">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className={`absolute inset-0 h-full w-full object-cover ${cameraActive ? "" : "opacity-0"}`}
            />
            <canvas ref={canvasRef} className="hidden" />
            <input
              ref={captureInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) handleUpload(file);
                event.target.value = "";
              }}
            />

            {cameraError ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-800 text-zinc-400">
                  <CameraIcon className="h-8 w-8" />
                </span>
                <p className="text-sm text-zinc-400">{cameraError}</p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={openDeviceCamera}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-zinc-100 px-4 text-sm font-semibold text-zinc-900 transition hover:bg-white"
                  >
                    <CameraIcon className="h-4 w-4" />
                    Open Camera
                  </button>
                  <button
                    type="button"
                    onClick={() => void setupCamera()}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-zinc-600 px-4 text-sm font-semibold text-zinc-200 transition hover:border-zinc-400"
                  >
                    <RefreshIcon className="h-4 w-4" />
                    Try again
                  </button>
                </div>
              </div>
            ) : status === "idle" ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-800 text-zinc-400">
                  <CameraIcon className="h-8 w-8" />
                </span>
                {insecure ? (
                  <>
                    <p className="text-sm text-zinc-400">
                      Camera access needs HTTPS on phones. Open the device camera instead.
                    </p>
                    <button
                      type="button"
                      onClick={openDeviceCamera}
                      className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-500 px-5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
                    >
                      <CameraIcon className="h-4.5 w-4.5" />
                      Open Camera
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-zinc-400">
                      Allow camera access to scan QR codes.
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => void setupCamera()}
                        className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-500 px-5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
                      >
                        <CameraIcon className="h-4.5 w-4.5" />
                        Allow Camera Access
                      </button>
                      <button
                        type="button"
                        onClick={openDeviceCamera}
                        className="inline-flex h-11 items-center gap-2 rounded-xl border border-zinc-600 px-5 text-sm font-semibold text-zinc-200 transition hover:border-zinc-400"
                      >
                        <CameraIcon className="h-4.5 w-4.5" />
                        Open Camera
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <>
                <div className="pointer-events-none absolute inset-0 bg-black/15" />
                {/* Focus frame */}
                <div className="pointer-events-none absolute inset-x-7 inset-y-7">
                  <span className="absolute left-0 top-0 h-8 w-8 rounded-tl-2xl border-l-4 border-t-4 border-emerald-400" />
                  <span className="absolute right-0 top-0 h-8 w-8 rounded-tr-2xl border-r-4 border-t-4 border-emerald-400" />
                  <span className="absolute bottom-0 left-0 h-8 w-8 rounded-bl-2xl border-b-4 border-l-4 border-emerald-400" />
                  <span className="absolute bottom-0 right-0 h-8 w-8 rounded-br-2xl border-b-4 border-r-4 border-emerald-400" />
                </div>
                {/* Scanning line */}
                {status === "scanning" && (
                  <div className="pointer-events-none absolute left-9 right-9 h-0.5 animate-scan-line rounded-full bg-emerald-400 shadow-[0_0_16px_4px_rgba(52,211,153,0.7)]" />
                )}
                {/* Status pill */}
                <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
                  <span className="inline-flex items-center gap-2 rounded-full bg-black/60 px-3.5 py-1.5 text-xs font-semibold backdrop-blur-sm">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        status === "success"
                          ? "bg-emerald-400"
                          : status === "error"
                            ? "bg-red-400"
                            : "animate-pulse-soft bg-emerald-400"
                      }`}
                    />
                    {status === "success"
                      ? "Registered"
                      : status === "error"
                        ? "Failed"
                        : "Scanning..."}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Controls */}
          <div className="mt-3 flex gap-2">
            {cameras.length > 1 ? (
              <select
                value={cameraId}
                onChange={(event) => void setupCamera(event.target.value)}
                aria-label="Switch camera"
                className="h-11 flex-1 truncate rounded-xl border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-200 outline-none focus:border-emerald-500"
              >
                {cameras.map((camera) => (
                  <option key={camera.deviceId} value={camera.deviceId}>
                    {camera.label || `Camera ${cameras.indexOf(camera) + 1}`}
                  </option>
                ))}
              </select>
            ) : (
              <div className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 text-xs text-zinc-500">
                <CameraIcon className="h-4 w-4" />
                {cameras[0]?.label || "Camera ready"}
              </div>
            )}
            <button
              type="button"
              onClick={() => void toggleTorch()}
              disabled={!cameraActive}
              aria-label="Toggle flashlight"
              className={`flex h-11 w-12 items-center justify-center rounded-xl border transition disabled:opacity-40 ${
                torchOn
                  ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                  : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500"
              }`}
            >
              {torchOn ? <FlashIcon className="h-5 w-5" /> : <FlashOffIcon className="h-5 w-5" />}
            </button>
            <label className="flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-sm font-medium text-zinc-200 transition hover:border-zinc-500">
              <UploadIcon className="h-4.5 w-4.5" />
              Image
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) handleUpload(file);
                  event.target.value = "";
                }}
              />
            </label>
          </div>

          {/* Hint */}
          {status === "scanning" && !result && (
            <p className="animate-pulse-soft mt-4 text-center text-xs text-zinc-500">
              Point the camera at a QR code — it opens the registration form.
            </p>
          )}
        </>
      )}

      {/* Result */}
      {result && !showingForm && (
        <div className="mt-4">
          <ResultCard result={result} onScanAgain={resumeScan} />
        </div>
      )}

      {/* History */}
      {history.length > 0 && !showingForm && (
        <section className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold tracking-widest text-zinc-500 uppercase">
              Recent scans
            </h2>
            <button
              type="button"
              onClick={() => {
                setHistory([]);
                try {
                  localStorage.removeItem(HISTORY_KEY);
                } catch {
                  /* ignore */
                }
              }}
              className="inline-flex items-center gap-1 text-xs text-zinc-500 transition hover:text-red-400"
            >
              <TrashIcon className="h-3.5 w-3.5" />
              Clear
            </button>
          </div>
          <ul className="no-scrollbar mt-2 flex max-h-56 flex-col gap-2 overflow-y-auto pr-1">
            {history.map((item, index) => (
              <li key={`${item.timestamp}-${index}`}>
                <button
                  type="button"
                  onClick={() => {
                    setResult(item);
                    setSessionUuid(null);
                    setStatus(item.status);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2.5 text-left transition hover:border-zinc-600"
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      item.status === "success" ? "bg-emerald-400" : "bg-red-400"
                    }`}
                  />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-zinc-300">
                    {item.code || "(no code)"}
                  </span>
                  <span className="shrink-0 text-[10px] text-zinc-500">
                    {timeAgo(item.timestamp)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
