export type ComposeProvider = "gmail" | "outlook" | "desktop";

export function composeEmailUrl(provider: ComposeProvider, to: string, subject: string, body: string) {
  const encodedTo = encodeURIComponent(to);
  const encodedSubject = encodeURIComponent(subject);
  const encodedBody = encodeURIComponent(body);
  if (provider === "desktop") {
    return `mailto:${encodedTo}?subject=${encodedSubject}&body=${encodedBody}`;
  }
  if (provider === "outlook") {
    return `https://outlook.live.com/mail/0/deeplink/compose?to=${encodedTo}&subject=${encodedSubject}&body=${encodedBody}`;
  }
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodedTo}&su=${encodedSubject}&body=${encodedBody}`;
}

