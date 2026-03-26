interface ParsedPcmWav {
  audioFormat: number;
  channelCount: number;
  sampleRateHz: number;
  byteRate: number;
  blockAlign: number;
  bitsPerSample: number;
  dataOffset: number;
  dataLength: number;
}

export function slicePcmWavWindow(
  bytes: Uint8Array,
  startMs: number,
  endMs: number,
): Uint8Array {
  const wav = parsePcmWav(bytes);
  if (wav.audioFormat !== 1) {
    throw new Error(`Unsupported WAV audio format ${wav.audioFormat}. Only PCM WAV is supported.`);
  }

  const totalDurationMs = wav.dataLength / wav.byteRate * 1000;
  const boundedStartMs = clamp(startMs, 0, totalDurationMs);
  const boundedEndMs = clamp(endMs, boundedStartMs, totalDurationMs);

  if (boundedStartMs === 0 && boundedEndMs === totalDurationMs) {
    return bytes;
  }

  const startByte = alignToBlock(
    Math.floor(boundedStartMs / 1000 * wav.byteRate),
    wav.blockAlign,
  );
  const endByte = alignToBlock(
    Math.ceil(boundedEndMs / 1000 * wav.byteRate),
    wav.blockAlign,
  );
  const slicedData = bytes.slice(wav.dataOffset + startByte, wav.dataOffset + endByte);

  return buildPcmWav({
    channelCount: wav.channelCount,
    sampleRateHz: wav.sampleRateHz,
    byteRate: wav.byteRate,
    blockAlign: wav.blockAlign,
    bitsPerSample: wav.bitsPerSample,
    data: slicedData,
  });
}

function parsePcmWav(bytes: Uint8Array): ParsedPcmWav {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 44) {
    throw new Error("Audio artifact is too small to be a valid WAV file.");
  }
  if (readAscii(view, 0, 4) !== "RIFF" || readAscii(view, 8, 4) !== "WAVE") {
    throw new Error("Audio artifact is not a RIFF/WAVE file.");
  }

  let offset = 12;
  let fmt: Omit<ParsedPcmWav, "dataOffset" | "dataLength"> | undefined;
  let dataOffset: number | undefined;
  let dataLength: number | undefined;

  while (offset + 8 <= bytes.byteLength) {
    const chunkId = readAscii(view, offset, 4);
    const chunkLength = view.getUint32(offset + 4, true);
    const chunkDataOffset = offset + 8;

    if (chunkId === "fmt " && chunkLength >= 16) {
      fmt = {
        audioFormat: view.getUint16(chunkDataOffset, true),
        channelCount: view.getUint16(chunkDataOffset + 2, true),
        sampleRateHz: view.getUint32(chunkDataOffset + 4, true),
        byteRate: view.getUint32(chunkDataOffset + 8, true),
        blockAlign: view.getUint16(chunkDataOffset + 12, true),
        bitsPerSample: view.getUint16(chunkDataOffset + 14, true),
      };
    }

    if (chunkId === "data") {
      dataOffset = chunkDataOffset;
      dataLength = Math.min(chunkLength, Math.max(0, bytes.byteLength - chunkDataOffset));
      break;
    }

    offset = chunkDataOffset + chunkLength + (chunkLength % 2);
  }

  if (!fmt || dataOffset === undefined || dataLength === undefined) {
    throw new Error("WAV artifact is missing fmt or data chunks.");
  }

  return {
    ...fmt,
    dataOffset,
    dataLength,
  };
}

function buildPcmWav(input: {
  channelCount: number;
  sampleRateHz: number;
  byteRate: number;
  blockAlign: number;
  bitsPerSample: number;
  data: Uint8Array;
}): Uint8Array {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + input.data.byteLength, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, input.channelCount, true);
  view.setUint32(24, input.sampleRateHz, true);
  view.setUint32(28, input.byteRate, true);
  view.setUint16(32, input.blockAlign, true);
  view.setUint16(34, input.bitsPerSample, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, input.data.byteLength, true);

  const output = new Uint8Array(44 + input.data.byteLength);
  output.set(new Uint8Array(header), 0);
  output.set(input.data, 44);
  return output;
}

function readAscii(view: DataView, offset: number, length: number): string {
  let output = "";
  for (let index = 0; index < length; index += 1) {
    output += String.fromCharCode(view.getUint8(offset + index));
  }
  return output;
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function alignToBlock(value: number, blockAlign: number): number {
  return Math.max(0, Math.floor(value / blockAlign) * blockAlign);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
