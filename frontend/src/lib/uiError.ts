export type UiErrorKind = "permission" | "limit" | "rate" | "general";

export type UiErrorDetail = {
  title: string;
  message: string;
  kind?: UiErrorKind;
  status?: number;
};

export function emitUiError(detail: UiErrorDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<UiErrorDetail>("scholardocx:ui-error", { detail }));
}
