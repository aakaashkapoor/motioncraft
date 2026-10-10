// Byte helpers shared by the page-side encoders: what crosses the page
// boundary to Node is base64 text. Runs in the browser.

/** base64 of `bytes`, in slices so a big array does not overflow the argument limit. */
export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) binary += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(binary);
}

/** The bytes of a WebCodecs buffer (an ArrayBuffer or a view on one). */
export function toBytes(buffer: AllowSharedBufferSource): Uint8Array {
  return ArrayBuffer.isView(buffer) ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength) : new Uint8Array(buffer);
}
