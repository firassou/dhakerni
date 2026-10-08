"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderState = "idle" | "starting" | "recording";
export type RecorderError = "unsupported" | "denied" | "failed";

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/mp4",
  "audio/webm",
  "audio/ogg;codecs=opus",
];
export const MAX_RECORDING_MS = 60_000;

interface Options {
  onRecorded: (audio: Blob, durationMs: number) => void;
  onError: (error: RecorderError) => void;
}

export function useRecorder({ onRecorded, onError }: Options) {
  const [state, setState] = useState<RecorderState>("idle");
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const cancelled = useRef(false);
  const stopRequested = useRef(false);
  const maxTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Always call the latest callbacks without re-creating start/stop.
  const cb = useRef({ onRecorded, onError });
  useEffect(() => {
    cb.current = { onRecorded, onError };
  });

  const release = useCallback(() => {
    clearTimeout(maxTimer.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    ctx.current?.close().catch(() => {});
    ctx.current = null;
    rec.current = null;
    setAnalyser(null);
    setState("idle");
  }, []);

  const start = useCallback(async () => {
    if (rec.current || state !== "idle") return;
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      cb.current.onError("unsupported");
      return;
    }
    cancelled.current = false;
    stopRequested.current = false;
    setState("starting");
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
      stream.current = media;

      const AudioCtx = window.AudioContext;
      const audioCtx = new AudioCtx();
      ctx.current = audioCtx;
      const node = audioCtx.createAnalyser();
      node.fftSize = 256;
      node.smoothingTimeConstant = 0.6;
      audioCtx.createMediaStreamSource(media).connect(node);

      const mimeType = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
      const recorder = new MediaRecorder(media, mimeType ? { mimeType } : undefined);
      rec.current = recorder;
      chunks.current = [];
      recorder.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      recorder.onstop = () => {
        const duration = Date.now() - startedAt.current;
        const blob = new Blob(chunks.current, {
          type: recorder.mimeType || mimeType || "audio/webm",
        });
        const wasCancelled = cancelled.current;
        release();
        if (!wasCancelled) cb.current.onRecorded(blob, duration);
      };
      startedAt.current = Date.now();
      recorder.start();
      setAnalyser(node);
      setState("recording");
      maxTimer.current = setTimeout(
        () => recorder.state === "recording" && recorder.stop(),
        MAX_RECORDING_MS,
      );
      // The user let go while the permission prompt or device was still starting.
      if (stopRequested.current) recorder.stop();
    } catch (e) {
      release();
      const denied =
        e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
      cb.current.onError(denied ? "denied" : "failed");
    }
  }, [release, state]);

  const stop = useCallback(() => {
    stopRequested.current = true;
    if (rec.current?.state === "recording") rec.current.stop();
  }, []);

  const cancel = useCallback(() => {
    cancelled.current = true;
    stopRequested.current = true;
    if (rec.current?.state === "recording") rec.current.stop();
    else release();
  }, [release]);

  useEffect(() => () => release(), [release]);

  return { state, analyser, start, stop, cancel };
}
