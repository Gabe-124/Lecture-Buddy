import type {
  SpeakerSegment,
  TranscriptSegment,
  UncertaintyFlag,
  UncertaintySeverity,
} from "@/lib/shared-types";

export interface PrimarySpeakerFilterInput {
  transcriptSegments: TranscriptSegment[];
  speakerSegments: SpeakerSegment[];
}

export interface PrimarySpeakerFilterOutput {
  primarySpeakerLabel?: string;
  transcriptSegments: TranscriptSegment[];
  speakerSegments: SpeakerSegment[];
  uncertaintyFlags: UncertaintyFlag[];
}

export function applyPrimaryLectureSpeakerFilter(
  input: PrimarySpeakerFilterInput,
): PrimarySpeakerFilterOutput {
  if (!input.speakerSegments.length) {
    return {
      primarySpeakerLabel: undefined,
      transcriptSegments: input.transcriptSegments,
      speakerSegments: input.speakerSegments,
      uncertaintyFlags: input.transcriptSegments.length
        ? [
            buildAudioUncertaintyFlag(
              "primary-speaker-unresolved",
              "No diarization output is available yet, so non-primary speakers could not be deprioritized.",
              "high",
            ),
          ]
        : [],
    };
  }

  const durationBySpeaker = new Map<string, number>();
  for (const segment of input.speakerSegments) {
    const duration = Math.max(0, segment.endMs - segment.startMs);
    durationBySpeaker.set(
      segment.speakerLabel,
      (durationBySpeaker.get(segment.speakerLabel) ?? 0) + duration,
    );
  }

  const primarySpeakerLabel = [...durationBySpeaker.entries()].sort(
    (left, right) => right[1] - left[1],
  )[0]?.[0];

  const uncertaintyFlags: UncertaintyFlag[] = [];
  if (!primarySpeakerLabel) {
    uncertaintyFlags.push(
      buildAudioUncertaintyFlag(
        "primary-speaker-unresolved",
        "Speaker durations could not identify a primary lecture speaker.",
        "high",
      ),
    );
  }

  const speakerSegments = input.speakerSegments.map((segment) => ({
    ...segment,
    isPrimaryCandidate: segment.speakerLabel === primarySpeakerLabel,
  }));

  const transcriptSegments = input.transcriptSegments.map((segment) => {
    const overlappedSpeaker = findBestOverlap(segment, speakerSegments);
    const speakerId = overlappedSpeaker?.speakerLabel ?? segment.speakerId;
    const isPrimarySpeaker = !!speakerId && !!primarySpeakerLabel && speakerId === primarySpeakerLabel;
    const transcriptUncertaintyFlags: UncertaintyFlag[] = [...segment.uncertaintyFlags];

    if (!speakerId || !primarySpeakerLabel || isPrimarySpeaker) {
      return {
        ...segment,
        speakerId,
        isPrimarySpeaker: isPrimarySpeaker || segment.isPrimarySpeaker,
      };
    }

    return {
      ...segment,
      speakerId,
      isPrimarySpeaker: false,
      uncertaintyFlags: [
        ...transcriptUncertaintyFlags,
        buildAudioUncertaintyFlag(
          "non-primary-speaker-deprioritized",
          "This transcript segment may belong to a non-primary speaker and should be deprioritized in notes.",
          "medium",
          overlappedSpeaker?.id,
        ),
      ],
    };
  });

  return {
    primarySpeakerLabel,
    transcriptSegments,
    speakerSegments,
    uncertaintyFlags,
  };
}

function findBestOverlap(
  transcriptSegment: TranscriptSegment,
  speakerSegments: SpeakerSegment[],
): SpeakerSegment | undefined {
  let bestSegment: SpeakerSegment | undefined;
  let bestOverlap = -1;

  for (const speakerSegment of speakerSegments) {
    const overlap = Math.min(transcriptSegment.endMs, speakerSegment.endMs) -
      Math.max(transcriptSegment.startMs, speakerSegment.startMs);
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      bestSegment = speakerSegment;
    }
  }

  return bestOverlap > 0 ? bestSegment : undefined;
}

function buildAudioUncertaintyFlag(
  kind: string,
  message: string,
  severity: UncertaintySeverity,
  relatedId?: string,
): UncertaintyFlag {
  return {
    kind,
    message,
    source: "audio",
    severity,
    relatedId,
  };
}
