export type ViewerProbe = "ok" | "fail" | "unknown";
export type HostChoice = "project" | "3dviewer";

/**
 * The 3D viewer wins whenever its API answers. A reported host of "project"
 * is only accepted when the viewer API explicitly fails. Anything uncertain
 * stays on the viewer, so a wrong or missing getHost cannot replace the panel.
 */
export function chooseHost(reported: string | null | undefined, viewer: ViewerProbe): HostChoice {
  if (viewer === "ok") return "3dviewer";
  if (reported === "project" && viewer === "fail") return "project";
  return "3dviewer";
}

export function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), milliseconds);
    promise.then((value) => {
      clearTimeout(timer);
      resolve(value);
    }, (error: unknown) => {
      clearTimeout(timer);
      reject(error instanceof Error ? error : new Error("falhou"));
    });
  });
}
