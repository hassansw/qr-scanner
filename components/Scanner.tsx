"use client";

import { decodeImageData, imageDataFromUrl } from "@/lib/qrDecode";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
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
  UploadIcon,
} from "@/components/Icons";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

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
  const [installReady, setInstallReady] = useState(false);
  // Read on the client only; the server snapshot keeps hydration consistent.
  const insecure = useSyncExternalStore(
    () => () => {},
    () => !window.isSecureContext,
    () => false
  );

  const stopScanningLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) video.srcObject = null;
  }, []);

  const handleScan = useCallback(
    (code: string) => {
      const now = Date.now();
      const last = lastCodeRef.current;
      if (last && last.code === code && now - last.at < 2000) return;
      lastCodeRef.current = { code, at: now };

      const uuid = extractSessionUuid(code);
      if (!uuid) {
        // Keep the camera running so the operator can retry immediately.
        setResult({
          code,
          status: "error",
          message: "Could not find a valid session UUID in that QR code.",
          timestamp: now,
        });
        return;
      }

      stopScanningLoop();
      setResult(null);
      setSessionUuid(uuid);
      setStatus("form");
    },
    [stopScanningLoop]
  );

  const startScanningLoop = useCallback(() => {
    if (rafRef.current !== null) return;

    const scan = () => {
      rafRef.current = requestAnimationFrame(scan);
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2 || detectingRef.current) return;
      if (!video.videoWidth || !video.videoHeight) return;

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
      stopStream();
      setCameraError(null);
      setTorchOn(false);

      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError(
          "Camera API not supported in this browser. Use the image upload option instead."
        );
        setStatus("idle");
        return;
      }

      try {
        const constraints: MediaStreamConstraints = {
          video: deviceId
            ? { deviceId: { exact: deviceId } }
            : { facingMode: { ideal: "environment" } },
          audio: false,
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;

        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          try {
            await video.play();
          } catch {
            /* play() rejects when the element is re-sourced mid-play */
          }
        }

        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter((device) => device.kind === "videoinput");
        setCameras(videoInputs);

        // Track the device actually in use, so the picker stays in sync.
        const activeId =
          stream.getVideoTracks()[0]?.getSettings().deviceId ??
          deviceId ??
          videoInputs[0]?.deviceId ??
          "";
        setCameraId(activeId);

        setStatus("scanning");
        startScanningLoop();
      } catch {
        stopStream();
        setCameraError(
          window.isSecureContext
            ? "Camera unavailable or permission denied. Allow camera access in your browser settings, then try again."
            : "Camera access needs HTTPS. Open this page over a secure connection."
        );
        setStatus("idle");
      }
    },
    [startScanningLoop, stopScanningLoop, stopStream]
  );

  // Return to live scanning; restart the stream if it was lost.
  const resumeScan = useCallback(() => {
    setSessionUuid(null);
    setCameraError(null);
    lastCodeRef.current = null;

    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || track.readyState !== "live") {
      void setupCamera(cameraId || undefined);
      return;
    }
    setStatus("scanning");
    startScanningLoop();
  }, [cameraId, setupCamera, startScanningLoop]);

  const handleVisitorDone = useCallback(
    (entry: ScanResult) => {
      setResult(entry);
      resumeScan();
    },
    [resumeScan]
  );

  const handleVisitorCancel = useCallback(() => {
    setResult(null);
    resumeScan();
  }, [resumeScan]);

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
      setResult(null);

      const reader = new FileReader();
      reader.onerror = () => {
        setResult({
          code: "",
          status: "error",
          message: "Could not read that image file.",
          timestamp: Date.now(),
        });
      };
      reader.onload = async () => {
        const image = await imageDataFromUrl(reader.result as string);
        if (!image) {
          setResult({
            code: "",
            status: "error",
            message: "Could not read that image file.",
            timestamp: Date.now(),
          });
          return;
        }
        const text = decodeImageData(image.data, image.width, image.height, true);
        if (!text) {
          setResult({
            code: "",
            status: "error",
            message: "No QR code found in that image.",
            timestamp: Date.now(),
          });
          return;
        }
        handleScan(text);
      };
      reader.readAsDataURL(file);
    },
    [handleScan]
  );

  const install = async () => {
    const promptEvent = promptRef.current;
    if (!promptEvent) return;
    await promptEvent.prompt();
    promptRef.current = null;
    setInstallReady(false);
  };

  useEffect(() => {
    return () => {
      stopScanningLoop();
      stopStream();
    };
  }, [stopScanningLoop, stopStream]);

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
            onClick={() => void install()}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-zinc-700 px-3 text-xs font-semibold text-zinc-200 transition hover:border-emerald-500 hover:text-emerald-300"
          >
            <InstallIcon className="h-4 w-4" />
            Install
          </button>
        )}
      </header>

      {showingForm ? (
        <VisitorForm
          sessionUuid={sessionUuid}
          onDone={handleVisitorDone}
          onCancel={handleVisitorCancel}
        />
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

            {cameraError ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-800 text-zinc-400">
                  <CameraIcon className="h-8 w-8" />
                </span>
                <p className="text-sm text-zinc-400">{cameraError}</p>
                <button
                  type="button"
                  onClick={() => void setupCamera()}
                  className="inline-flex h-10 items-center gap-2 rounded-xl border border-zinc-600 px-4 text-sm font-semibold text-zinc-200 transition hover:border-zinc-400"
                >
                  <RefreshIcon className="h-4 w-4" />
                  Try again
                </button>
              </div>
            ) : status === "idle" ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-800 text-zinc-400">
                  <CameraIcon className="h-8 w-8" />
                </span>
                {insecure ? (
                  <p className="text-sm text-zinc-400">
                    Camera access needs HTTPS on phones. Open this page over a secure
                    connection, or upload an image below.
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-zinc-400">
                      Allow camera access to scan QR codes.
                    </p>
                    <button
                      type="button"
                      onClick={() => void setupCamera()}
                      className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-500 px-5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
                    >
                      <CameraIcon className="h-4.5 w-4.5" />
                      Allow Camera Access
                    </button>
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
                <div className="pointer-events-none absolute left-9 right-9 h-0.5 animate-scan-line rounded-full bg-emerald-400 shadow-[0_0_16px_4px_rgba(52,211,153,0.7)]" />
                {/* Status pill */}
                <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
                  <span className="inline-flex items-center gap-2 rounded-full bg-black/60 px-3.5 py-1.5 text-xs font-semibold backdrop-blur-sm">
                    <span className="h-2 w-2 animate-pulse-soft rounded-full bg-emerald-400" />
                    Scanning...
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
                {cameras.map((camera, index) => (
                  <option key={camera.deviceId} value={camera.deviceId}>
                    {camera.label || `Camera ${index + 1}`}
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
          <ResultCard result={result} onScanAgain={() => setResult(null)} />
        </div>
      )}
    </div>
  );
}
