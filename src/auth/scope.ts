// Namespaces all user-data localStorage keys by wallet address so each wallet
// has its own progress on this device.

let prefix = "";

export function setUserScope(address: string): void {
  prefix = `u:${address.toLowerCase()}:`;
}

export function clearUserScope(): void {
  prefix = "";
}

export function scopedKey(key: string): string {
  return prefix + key;
}
