import util from "util";
import stream from "stream";
import fetch from "node-fetch";

const streamPipeline = util.promisify(stream.pipeline);

const VALID_URL_PATTERNS = [
  /^http:\/\/images\.neopets\.com\/items\/[a-zA-Z0-9_ -]+\.gif$/,
  /^http:\/\/images\.neopets\.com\/cp\/(bio|items)\/data\/[0-9]{3}\/[0-9]{3}\/[0-9]{3}\/[a-f0-9_]+\/[a-zA-Z0-9_\/]+\.(svg|png)$/,
  /^http:\/\/images\.neopets\.com\/cp\/(bio|items)\/swf\/[0-9]{3}\/[0-9]{3}\/[0-9]{3}\/[a-f0-9_]+\.swf$/,
];

export default async (req, res) => {
  const urlToProxy = req.query.url;
  if (!urlToProxy) {
    return res
      .status(400)
      .send("Bad request: Must provide `?url` in the query string");
  }

  if (!VALID_URL_PATTERNS.some((p) => urlToProxy.match(p))) {
    return res
      .status(400)
      .send("Bad request: URL did not match any valid patterns");
  }

  console.debug("[assetProxy] 💌 Sending: %s", urlToProxy);

  const proxyRes = await fetch(urlToProxy);
  console.debug(
    `[assetProxy] %s %s: %s`,
    proxyRes.ok ? "✅" : "🛑",
    `${proxyRes.status} ${proxyRes.statusText}`.padStart(7, " "),
    urlToProxy
  );

  res.status(proxyRes.status);

  res.setHeader("Content-Length", proxyRes.headers.get("Content-Length"));
  res.setHeader("Content-Type", proxyRes.headers.get("Content-Type"));

  res.setHeader("Cache-Control", proxyRes.headers.get("Cache-Control"));
  res.setHeader("ETag", proxyRes.headers.get("ETag"));
  res.setHeader("Last-Modified", proxyRes.headers.get("Last-Modified"));

  streamPipeline(proxyRes.body, res);
};
