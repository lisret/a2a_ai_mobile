// WebView's file:// assets need XHR; Fetch-based Three.FileLoader is for HTTP(S).
export function loadAvatarAsset(
  loader,
  url,
  success,
  failure,
  XHR = globalThis.XMLHttpRequest,
) {
  if (!url.startsWith('file:')) {
    loader.load(url, success, undefined, failure);
    return;
  }
  const request = new XHR();
  request.open('GET', url, true);
  request.responseType = 'arraybuffer';
  request.timeout = 20000;
  request.onload = () => {
    if (
      (request.status !== 0 && request.status !== 200) ||
      !request.response?.byteLength
    ) {
      failure(new Error('Local avatar asset could not be read'));
      return;
    }
    try {
      loader.parse(request.response, new URL('.', url).href, success, failure);
    } catch (error) {
      failure(error);
    }
  };
  request.onerror = request.ontimeout = () =>
    failure(new Error('Local avatar asset request failed'));
  request.send();
}
