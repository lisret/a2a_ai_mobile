const prefix = 'nono-ui-preview:';
const storage = {
  async getItem(key: string) {
    return localStorage.getItem(prefix + key);
  },
  async setItem(key: string, value: string) {
    localStorage.setItem(prefix + key, value);
  },
  async removeItem(key: string) {
    localStorage.removeItem(prefix + key);
  },
  async getAllKeys() {
    return Object.keys(localStorage)
      .filter(key => key.startsWith(prefix))
      .map(key => key.slice(prefix.length));
  },
  async multiGet(keys: string[]) {
    return keys.map(key => [key, localStorage.getItem(prefix + key)]);
  },
  async multiSet(entries: [string, string][]) {
    for (const [key, value] of entries) await storage.setItem(key, value);
  },
  async multiRemove(keys: string[]) {
    for (const key of keys) await storage.removeItem(key);
  },
  async clear() {
    await storage.multiRemove(await storage.getAllKeys());
  },
};
export default storage;
