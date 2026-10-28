const NATIVE_TYPES = [
  "video/mp4;codecs=avc1.42E01F,mp4a.40.2",
  "video/mp4;codecs=avc1.640028,mp4a.40.2",
  "video/mp4;codecs=avc1.42E01F",
  "video/mp4;codecs=avc1",
  "video/mp4",
];

export function nativeMp4Mime(wantAudio = false) {
  if (typeof MediaRecorder === "undefined") return "";
  const types = wantAudio ? NATIVE_TYPES.filter((type) => type.includes("mp4a")) : NATIVE_TYPES;
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

export async function webCodecsMp4Available() {
  if (typeof VideoEncoder === "undefined") return false;
  try {
    const support = await VideoEncoder.isConfigSupported({
      codec: "avc1.42001f",
      width: 1280,
      height: 720,
      bitrate: 2_000_000,
      framerate: 30,
      avc: { format: "avc" },
    });
    return Boolean(support.supported);
  } catch {
    return false;
  }
}

export async function mp4CanRecord() {
  if (nativeMp4Mime()) return true;
  return webCodecsMp4Available();
}

export class AacUnavailable extends Error {
  constructor() {
    super("This browser cannot put audio in an MP4 file. Recording WebM instead.");
    this.name = "AacUnavailable";
  }
}

function writeChunk(muxer, kind, chunk, meta) {
  const timestamp = chunk.timestamp;
  if (chunk.duration == null) {
    const data = new Uint8Array(chunk.byteLength);
    chunk.copyTo(data);
    if (kind === "video") muxer.addVideoChunkRaw(data, chunk.type, timestamp, 33333, meta);
    else muxer.addAudioChunkRaw(data, chunk.type, timestamp, 33333, meta);
    return;
  }
  if (kind === "video") muxer.addVideoChunk(chunk, meta, timestamp);
  else muxer.addAudioChunk(chunk, meta, timestamp);
}

export async function startWebCodecsMp4(stream, options) {
  const { Muxer, ArrayBufferTarget } = await import("../../vendor/mp4-muxer.js");
  const videoTrack = stream.getVideoTracks()[0];
  if (!videoTrack) throw new Error("No video track to record.");
  const audioTrack = options.wantAudio ? stream.getAudioTracks()[0] : null;
  let audio = null;
  if (audioTrack) {
    const trackSettings = audioTrack.getSettings();
    audio = {
      sampleRate: trackSettings.sampleRate || 48000,
      channels: trackSettings.channelCount || 1,
    };
    if (typeof AudioEncoder === "undefined") throw new AacUnavailable();
    const support = await AudioEncoder.isConfigSupported({
      codec: "mp4a.40.2",
      sampleRate: audio.sampleRate,
      numberOfChannels: audio.channels,
      bitrate: 128000,
    });
    if (!support.supported) throw new AacUnavailable();
  }

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: "avc", width: options.width, height: options.height },
    audio: audio ? { codec: "aac", sampleRate: audio.sampleRate, numberOfChannels: audio.channels } : undefined,
    fastStart: "in-memory",
    firstTimestampBehavior: "offset",
  });

  let failure = null;
  let chunks = 0;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => {
      chunks += 1;
      options.onBytes?.(chunk.byteLength);
      writeChunk(muxer, "video", chunk, meta);
    },
    error: (error) => { failure = error; },
  });
  videoEncoder.configure({
    codec: "avc1.42001f",
    width: options.width,
    height: options.height,
    bitrate: options.bitrate,
    framerate: 30,
    avc: { format: "avc" },
    latencyMode: "realtime",
  });

  let audioEncoder = null;
  if (audio) {
    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => writeChunk(muxer, "audio", chunk, meta),
      error: (error) => { failure = error; },
    });
    audioEncoder.configure({
      codec: "mp4a.40.2",
      sampleRate: audio.sampleRate,
      numberOfChannels: audio.channels,
      bitrate: 128000,
    });
  }

  let paused = false;
  let stopped = false;
  const videoReader = new MediaStreamTrackProcessor({ track: videoTrack }).readable.getReader();
  const audioReader = audioTrack && audioEncoder
    ? new MediaStreamTrackProcessor({ track: audioTrack }).readable.getReader()
    : null;

  const done = (async () => {
    let frames = 0;
    const pumps = [
      pump(videoReader, (frame) => {
        videoEncoder.encode(frame, { keyFrame: frames % 60 === 0 });
        frames += 1;
      }),
    ];
    if (audioReader) pumps.push(pump(audioReader, (data) => audioEncoder.encode(data)));
    await Promise.all(pumps);
    if (failure) throw failure;
    if (!chunks) throw new Error("Nothing was recorded.");
    await videoEncoder.flush();
    if (audioEncoder && audioEncoder.state !== "closed") await audioEncoder.flush();
    videoEncoder.close();
    audioEncoder?.close();
    muxer.finalize();
    return new Blob([target.buffer], { type: "video/mp4" });
  })();

  return {
    pause() { paused = true; },
    resume() { paused = false; },
    stop() {
      stopped = true;
      videoReader.cancel().catch(() => {});
      audioReader?.cancel().catch(() => {});
      return done;
    },
  };

  async function pump(reader, encode) {
    while (!stopped) {
      if (failure) throw failure;
      const next = await reader.read().catch(() => ({ done: true, value: null }));
      if (next.done || !next.value) break;
      if (!paused) encode(next.value);
      next.value.close();
    }
  }
}
