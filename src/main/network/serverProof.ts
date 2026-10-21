import crypto from 'crypto';

/**
 * Challenge-response for /hello: the client sends a random nonce and the main computer answers
 * with an HMAC over it, keyed with the access key. The client can then verify it is talking to
 * the real main computer *without* ever sending the key to an unverified host.
 */
export const computeServerProof = (accessKey: string, nonce: string, serverId: string): string =>
  crypto.createHmac('sha256', accessKey).update(`pharmacy-hello:${nonce}:${serverId}`).digest('hex');

export const proofsMatch = (a: string, b: string): boolean => {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
};

export const isValidNonce = (nonce: string): boolean => /^[0-9a-f]{32,64}$/i.test(nonce);
