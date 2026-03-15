/**
 * Phantom Deeplink Protocol — Chrome→Phantom→Chrome wallet connection.
 * Implements: Connect, SignTransaction, Disconnect via URL redirects with NaCl encryption.
 * Docs: https://docs.phantom.com/phantom-deeplinks/
 */
import nacl from 'tweetnacl';
import bs58 from 'bs58';

const STORAGE_PREFIX = 'phantom_dl_';
const PHANTOM_CONNECT_URL = 'https://phantom.app/ul/v1/connect';
const PHANTOM_SIGN_TX_URL = 'https://phantom.app/ul/v1/signTransaction';
const PHANTOM_DISCONNECT_URL = 'https://phantom.app/ul/v1/disconnect';

// ========================
// STORAGE HELPERS
// ========================

function store(key: string, value: string) {
  try { localStorage.setItem(STORAGE_PREFIX + key, value); } catch {}
}

function load(key: string): string | null {
  try { return localStorage.getItem(STORAGE_PREFIX + key); } catch { return null; }
}

function remove(key: string) {
  try { localStorage.removeItem(STORAGE_PREFIX + key); } catch {}
}

// ========================
// KEYPAIR MANAGEMENT
// ========================

/** Get or create the dApp's x25519 keypair for this session */
function getDappKeypair(): nacl.BoxKeyPair {
  const stored = load('secretKey');
  if (stored) {
    const secretKey = bs58.decode(stored);
    return nacl.box.keyPair.fromSecretKey(secretKey);
  }
  const kp = nacl.box.keyPair();
  store('secretKey', bs58.encode(kp.secretKey));
  return kp;
}

/** Get shared secret from dApp secret key + Phantom's public key */
function getSharedSecret(phantomPubKeyB58: string): Uint8Array {
  const kp = getDappKeypair();
  const phantomPubKey = bs58.decode(phantomPubKeyB58);
  return nacl.box.before(phantomPubKey, kp.secretKey);
}

// ========================
// ENCRYPTION / DECRYPTION
// ========================

function encryptPayload(payload: object, sharedSecret: Uint8Array): { nonce: string; encryptedPayload: string } {
  const nonceBytes = nacl.randomBytes(24);
  const messageBytes = new TextEncoder().encode(JSON.stringify(payload));
  const encrypted = nacl.box.after(messageBytes, nonceBytes, sharedSecret);
  if (!encrypted) throw new Error('Encryption failed');
  return {
    nonce: bs58.encode(nonceBytes),
    encryptedPayload: bs58.encode(encrypted),
  };
}

function decryptPayload(dataB58: string, nonceB58: string, sharedSecret: Uint8Array): any {
  const data = bs58.decode(dataB58);
  const nonce = bs58.decode(nonceB58);
  const decrypted = nacl.box.open.after(data, nonce, sharedSecret);
  if (!decrypted) throw new Error('Decryption failed');
  return JSON.parse(new TextDecoder().decode(decrypted));
}

// ========================
// CONNECT
// ========================

/** Build the Phantom connect deeplink URL and redirect */
export function phantomConnect() {
  const kp = getDappKeypair();
  // Use root URL with query param — avoids SPA routing issues
  const redirectUrl = window.location.origin + '/?phantom=connect';

  const params = new URLSearchParams({
    app_url: window.location.origin,
    dapp_encryption_public_key: bs58.encode(kp.publicKey),
    redirect_link: redirectUrl,
    cluster: 'mainnet-beta',
  });

  window.location.href = `${PHANTOM_CONNECT_URL}?${params.toString()}`;
}

/** Parse the connect callback URL params, decrypt, and store session */
export function handleConnectCallback(searchParams: URLSearchParams): {
  publicKey: string;
  session: string;
} | null {
  const phantomPubKey = searchParams.get('phantom_encryption_public_key');
  const nonce = searchParams.get('nonce');
  const data = searchParams.get('data');
  const errorCode = searchParams.get('errorCode');

  if (errorCode) {
    console.warn('Phantom connect rejected:', errorCode, searchParams.get('errorMessage'));
    return null;
  }

  if (!phantomPubKey || !nonce || !data) return null;

  try {
    // Store Phantom's public key for future use
    store('phantomPubKey', phantomPubKey);

    const sharedSecret = getSharedSecret(phantomPubKey);
    const decrypted = decryptPayload(data, nonce, sharedSecret);

    // decrypted = { public_key: "...", session: "..." }
    store('walletPubKey', decrypted.public_key);
    store('session', decrypted.session);

    return {
      publicKey: decrypted.public_key,
      session: decrypted.session,
    };
  } catch (e) {
    console.error('Phantom connect decrypt error:', e);
    return null;
  }
}

// ========================
// SIGN TRANSACTION
// ========================

/** Redirect to Phantom to sign a transaction. After signing, Phantom redirects back. */
export function phantomSignTransaction(serializedTransactionB58: string) {
  const phantomPubKey = load('phantomPubKey');
  const session = load('session');
  if (!phantomPubKey || !session) throw new Error('No active Phantom session');

  const kp = getDappKeypair();
  const sharedSecret = getSharedSecret(phantomPubKey);

  const payload = {
    transaction: serializedTransactionB58,
    session: session,
  };

  const { nonce, encryptedPayload } = encryptPayload(payload, sharedSecret);

  const redirectUrl = window.location.origin + '/?phantom=sign';
  const params = new URLSearchParams({
    dapp_encryption_public_key: bs58.encode(kp.publicKey),
    nonce: nonce,
    redirect_link: redirectUrl,
    payload: encryptedPayload,
  });

  window.location.href = `${PHANTOM_SIGN_TX_URL}?${params.toString()}`;
}

/** Parse the sign transaction callback */
export function handleSignCallback(searchParams: URLSearchParams): {
  signedTransaction: string;
} | null {
  const nonce = searchParams.get('nonce');
  const data = searchParams.get('data');
  const errorCode = searchParams.get('errorCode');

  if (errorCode) {
    console.warn('Phantom sign rejected:', errorCode, searchParams.get('errorMessage'));
    return null;
  }

  if (!nonce || !data) return null;

  const phantomPubKey = load('phantomPubKey');
  if (!phantomPubKey) return null;

  try {
    const sharedSecret = getSharedSecret(phantomPubKey);
    const decrypted = decryptPayload(data, nonce, sharedSecret);
    // decrypted = { transaction: "..." } — signed, serialized, base58
    return { signedTransaction: decrypted.transaction };
  } catch (e) {
    console.error('Phantom sign decrypt error:', e);
    return null;
  }
}

// ========================
// DISCONNECT
// ========================

export function phantomDisconnect() {
  const phantomPubKey = load('phantomPubKey');
  const session = load('session');

  // Clear local state
  remove('secretKey');
  remove('phantomPubKey');
  remove('walletPubKey');
  remove('session');
  remove('redirect_path');
  remove('pending_sign_redirect');

  // Optionally notify Phantom (best effort, don't redirect for disconnect)
  if (phantomPubKey && session) {
    try {
      const kp = nacl.box.keyPair(); // temporary, just for disconnect
      const sharedSecret = nacl.box.before(bs58.decode(phantomPubKey), kp.secretKey);
      const { nonce, encryptedPayload } = encryptPayload({ session }, sharedSecret);
      // Fire-and-forget: open disconnect URL
      const params = new URLSearchParams({
        dapp_encryption_public_key: bs58.encode(kp.publicKey),
        nonce,
        payload: encryptedPayload,
        redirect_link: window.location.href,
      });
      // Don't redirect — just clear local state
    } catch {}
  }
}

// ========================
// SESSION RESTORE
// ========================

/** Check if there's a saved Phantom session */
export function getStoredSession(): { publicKey: string; session: string } | null {
  const publicKey = load('walletPubKey');
  const session = load('session');
  if (publicKey && session) return { publicKey, session };
  return null;
}

/** Check if current URL is a Phantom callback */
export function isPhantomCallback(searchParams: URLSearchParams): 'connect' | 'sign' | null {
  const type = searchParams.get('phantom');
  if (type === 'connect') return 'connect';
  if (type === 'sign') return 'sign';
  return null;
}
