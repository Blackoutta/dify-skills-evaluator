export function redactAuthorization(value: string): string {
  if (value.length <= 14) {
    return "*".repeat(Math.max(4, value.length));
  }

  return `${value.slice(0, 10)}...${value.slice(-4)}`;
}

export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const next = { ...headers };
  const authKey = Object.keys(next).find((key) => key.toLowerCase() === "authorization");
  if (authKey) {
    next[authKey] = redactAuthorization(next[authKey]);
  }
  return next;
}
