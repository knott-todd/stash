// Shared by server, browser and the desktop agent. No Node imports here.

// Files are sent in pieces, so the cap is about what a browser can sensibly
// read, not what one request can carry.
export const MAX_BYTES = 4 * 1024 * 1024 * 1024;

// Chunking convention shared by every client and the server: plain pieces of
// 4,000,000 bytes; AES-GCM adds a 12-byte IV and a 16-byte tag to each.
export const CHUNK_PLAIN_BYTES = 4_000_000;
export const CHUNK_CIPHER_BYTES = CHUNK_PLAIN_BYTES + 28;
