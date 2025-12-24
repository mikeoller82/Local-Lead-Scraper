/**
 * Validates a URL by performing a HEAD/GET request via a CORS proxy.
 * This ensures we can check if a website is reachable from the client side.
 */
export const validateWebsiteUrl = async (url: string | null | undefined): Promise<boolean> => {
  if (!url) return false;

  let targetUrl = url.trim();
  // Ensure protocol
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = 'https://' + targetUrl;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

    // We use corsproxy.io to bypass CORS.
    // We use 'https://corsproxy.io/?' + encodedURL
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;

    const response = await fetch(proxyUrl, {
      method: 'GET', // Using GET as some servers block HEAD or proxies don't forward it well
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Consider it valid if we get a 2xx status
    // 3xx might be returned as 200 by proxy if it follows redirects, which is fine.
    // 403/401 might mean it exists but is protected, but for "public business site" usually 200 is expected.
    // However, some sites block proxies. 
    // If response.ok is true (200-299), it's definitely there.
    return response.ok;
  } catch (error) {
    console.warn(`Validation failed for ${targetUrl}:`, error);
    return false;
  }
};