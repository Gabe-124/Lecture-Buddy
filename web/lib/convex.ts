export function getConvexDeploymentUrl(): string {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL;
  if (!url) {
    throw new Error(
      "Missing Convex deployment URL. Set NEXT_PUBLIC_CONVEX_URL for local and Vercel runtime.",
    );
  }

  return url;
}

export function getConvexServerOptions() {
  return {
    url: getConvexDeploymentUrl(),
  };
}
