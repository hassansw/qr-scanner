"use client";

import { decodeImageData, imageDataFromUrl } from "@/lib/qrDecode";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { extractSessionUuid } from "@/lib/qr";
import type { ScanResult, ScanStatus } from "@/lib/types";
import ResultCard from "@/components/ResultCard";
import { useRouter } from "next/navigation";
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

const CAMERA_GRANTED_KEY = "qr-scanner:camera-granted";

type FocusCapableTrack = MediaStreamTrack & {
  getCapabilities?: () => unknown;
};

/** Ask for continuous autofocus when the device exposes it. */
async function applyAutoFocus(track?: MediaStreamTrack) {
  if (!track) return;
  try {
    const capabilities = (track as FocusCapableTrack).getCapabilities?.() as
      | { focusMode?: string[] }
      | undefined;
    const modes = capabilities?.focusMode;
    if (modes && !modes.includes("continuous")) return;
    await track.applyConstraints({
      advanced: [{ focusMode: "continuous" }] as unknown as MediaTrackConstraintSet[],
    });
  } catch {
    /* autofocus control unsupported on this device */
  }
}

export default function Scanner() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectingRef = useRef(false);
  const lastCodeRef = useRef<{ code: string; at: number } | null>(null);
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null);

  const [status, setStatus] = useState<ScanStatus>("idle");
  const [result, setResult] = useState<ScanResult | null>(null);
  const autoStartedRef = useRef(false);
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

      // Cover the viewport with the loader *before* killing the stream, so the
      // preview never flashes to an empty black square mid-navigation.
      setResult(null);
      setStatus("detected");
      stopScanningLoop();
      stopStream();
      router.push(`/register/${encodeURIComponent(uuid)}`);
    },
    [router, stopScanningLoop, stopStream]
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
        // focusMode/width/height are "ideal" hints — a device that lacks
        // continuous autofocus still returns a stream.
        const videoConstraints: MediaTrackConstraints = {
          ...(deviceId
            ? { deviceId: { exact: deviceId } }
            : { facingMode: { ideal: "environment" } }),
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          advanced: [{ focusMode: "continuous" }] as unknown as MediaTrackConstraintSet[],
        };
        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false,
        });
        streamRef.current = stream;

        await applyAutoFocus(stream.getVideoTracks()[0]);

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

        try {
          sessionStorage.setItem(CAMERA_GRANTED_KEY, "1");
        } catch {
          /* storage unavailable */
        }

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

  // Full camera reset: tear the stream down and re-acquire it, then scan again.
  const resetCamera = useCallback(() => {
    setCameraError(null);
    lastCodeRef.current = null;
    setResult(null);
    void setupCamera(cameraId || undefined);
  }, [cameraId, setupCamera]);

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
      stopScanningLoop();
      setStatus("processing");

      const fail = (message: string) => {
        setStatus(streamRef.current ? "scanning" : "idle");
        startScanningLoop();
        setResult({ code: "", status: "error", message, timestamp: Date.now() });
      };

      const reader = new FileReader();
      reader.onerror = () => fail("Could not read that image file.");
      reader.onload = async () => {
        const image = await imageDataFromUrl(reader.result as string);
        if (!image) {
          fail("Could not read that image file.");
          return;
        }
        const text = decodeImageData(image.data, image.width, image.height, true);
        if (!text) {
          fail("No QR code found in that image.");
          return;
        }
        handleScan(text);
      };
      reader.readAsDataURL(file);
    },
    [handleScan, startScanningLoop, stopScanningLoop]
  );

  const install = async () => {
    const promptEvent = promptRef.current;
    if (!promptEvent) return;
    await promptEvent.prompt();
    promptRef.current = null;
    setInstallReady(false);
  };

  // Coming back from the register page shouldn't need another tap, but a first
  // visit still gets the explicit permission button.
  useEffect(() => {
    if (autoStartedRef.current) return;
    autoStartedRef.current = true;

    let granted = false;
    try {
      granted = sessionStorage.getItem(CAMERA_GRANTED_KEY) === "1";
    } catch {
      /* storage unavailable */
    }
    if (granted) {
      void setupCamera();
      return;
    }

    void navigator.permissions
      ?.query({ name: "camera" as PermissionName })
      .then((permission) => {
        if (permission.state === "granted") void setupCamera();
      })
      .catch(() => {
        /* Permissions API unsupported for camera */
      });
  }, [setupCamera]);

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

  const cameraActive = status === "scanning" || status === "detected";
  const busy = status === "detected" || status === "processing";

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

            {busy && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-black/75 backdrop-blur-sm">
                <span className="h-10 w-10 animate-spin rounded-full border-[3px] border-zinc-700 border-t-emerald-400" />
                <p className="text-sm font-semibold text-zinc-200">
                  {status === "detected" ? "QR code detected" : "Reading image…"}
                </p>
                <p className="text-xs text-zinc-500">
                  {status === "detected"
                    ? "Opening the registration form…"
                    : "Looking for a QR code…"}
                </p>
              </div>
            )}

            {busy ? null : cameraError ? (
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
                disabled={busy}
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
              disabled={status !== "scanning"}
              aria-label="Toggle flashlight"
              className={`flex h-11 w-12 items-center justify-center rounded-xl border transition disabled:opacity-40 ${
                torchOn
                  ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                  : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500"
              }`}
            >
              {torchOn ? <FlashIcon className="h-5 w-5" /> : <FlashOffIcon className="h-5 w-5" />}
            </button>
            <label
              className={`flex h-11 items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-sm font-medium text-zinc-200 transition ${
                busy ? "pointer-events-none opacity-40" : "cursor-pointer hover:border-zinc-500"
              }`}
            >
              <UploadIcon className="h-4.5 w-4.5" />
              Image
              <input
                type="file"
                accept="image/*"
                disabled={busy}
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

      {/* Result */}
      {result && (
        <div className="mt-4">
          <ResultCard result={result} onScanAgain={resetCamera} />
        </div>
      )}
    </div>
  );
}
