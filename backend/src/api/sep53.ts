/**
 * SEP-53 ("Stellar Signed Message") verification.
 *
 * Signing: ed25519_sign( SHA256( "Stellar Signed Message:\n" || message ) ).
 * Freighter applies this prefix + hash internally, so we reconstruct the same
 * preimage and verify the 64-byte signature against the claimed public key.
 */
import { Keypair } from '@stellar/stellar-sdk';
import { createHash } from 'node:crypto';

const PREFIX = Buffer.from('Stellar Signed Message:\n', 'utf8');

function sep53Hash(message: string): Buffer {
  return createHash('sha256')
    .update(Buffer.concat([PREFIX, Buffer.from(message, 'utf8')]))
    .digest();
}

/** Verify a base64 SEP-53 signature of `message` by `publicKey`. */
export function verifySep53(publicKey: string, message: string, signatureB64: string): boolean {
  try {
    const sig = Buffer.from(signatureB64, 'base64');
    if (sig.length !== 64) return false;
    return Keypair.fromPublicKey(publicKey).verify(sep53Hash(message), sig);
  } catch {
    return false;
  }
}

/** Canonical message a commenter signs. MUST byte-match the frontend's
 *  commentMessage() in frontend/src/lib/comment.ts. */
export function commentMessage(marketId: string, timestamp: number, body: string): string {
  return `StellarPredict comment\nmarket:${marketId}\nts:${timestamp}\n\n${body}`;
}
