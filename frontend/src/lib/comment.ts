/** Canonical message a commenter signs (SEP-53). MUST byte-match the backend's
 *  commentMessage() in backend/src/api/sep53.ts. */
export function commentMessage(marketId: string, timestamp: number, body: string): string {
  return `StellarPredict comment\nmarket:${marketId}\nts:${timestamp}\n\n${body}`;
}
