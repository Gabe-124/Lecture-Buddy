import type {
  CapturedImage,
  UncertaintyFlag,
} from "../../shared/types";

import type {
  ImageWorthinessAssessment,
  WorthinessRecheckOutput,
} from "./types";

export function recheckImageWorthiness(images: CapturedImage[]): WorthinessRecheckOutput {
  const assessments: ImageWorthinessAssessment[] = [];
  const keptImages: CapturedImage[] = [];
  const uncertaintyFlags: UncertaintyFlag[] = [];

  for (const [index, image] of images.entries()) {
    const flags: UncertaintyFlag[] = [];
    let shouldKeep = image.acceptedForProcessing !== false;
    let reason = "pi-accepted";

    if (image.acceptedForProcessing === false) {
      shouldKeep = false;
      reason = "pi-rejected";
    } else if (image.diffScore === undefined) {
      shouldKeep = true;
      reason = "metadata-incomplete-keep-for-review";
      flags.push({
        kind: "image-worthiness-metadata-missing",
        message:
          "Pi worthiness metadata was incomplete, so the cloud kept the image for conservative review.",
        source: "image",
        severity: "medium",
        relatedId: image.id,
      });
    } else if (index > 0 && image.diffScore < 0.02) {
      shouldKeep = false;
      reason = "low-diff-score";
      flags.push({
        kind: "image-worthiness-low-diff-score",
        message:
          "Image diff score was very low, so the cloud dropped it unless later re-check logic is added.",
        source: "image",
        severity: "medium",
        relatedId: image.id,
      });
    }

    assessments.push({
      imageId: image.id,
      shouldKeep,
      reason,
      uncertaintyFlags: flags,
    });
    uncertaintyFlags.push(...flags);
    if (shouldKeep) {
      keptImages.push(image);
    }
  }

  if (images.length) {
    uncertaintyFlags.push({
      kind: "cloud-image-recheck-limited",
      message:
        "Cloud image re-check currently uses Pi metadata only. TODO: add optional byte-level cloud re-check when image access is wired in.",
      source: "image",
      severity: "medium",
    });
  }

  return {
    keptImages,
    assessments,
    uncertaintyFlags,
  };
}
