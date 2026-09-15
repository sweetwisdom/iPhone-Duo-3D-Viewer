import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const har = JSON.parse(fs.readFileSync('www.apple.com.cn.har', 'utf8'));
const manifest = [];
for (const entry of har.log.entries) {
  const url = new URL(entry.request.url);
  const content = entry.response.content;
  const isAsset = url.pathname.includes('/static/') || url.pathname.includes('/product-viewer/') || url.pathname.includes('/iphone-duo/fonts/');
  const isSource = url.pathname === '/iphone-duo/' || /(?:main|vendors~lotus-lib|overview)\.built\.(?:js|css)$/.test(url.pathname);
  if ((!isAsset && !isSource) || !content.text || entry.response.status !== 200) continue;
  const relative = isAsset ? `public/apple${url.pathname.replace(/\/+/g, '/')}` : `reference/${url.pathname === '/iphone-duo/' ? 'page.html' : url.pathname.replaceAll('/', '_')}`;
  const target = path.resolve(relative);
  if (!target.startsWith(process.cwd() + path.sep)) throw new Error('Unsafe extraction path');
  const bytes = Buffer.from(content.text, content.encoding === 'base64' ? 'base64' : 'utf8');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, bytes);
  manifest.push({ url: entry.request.url, file: relative, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
}
fs.mkdirSync('public/apple', { recursive: true });
fs.writeFileSync('public/apple/manifest.json', JSON.stringify(manifest, null, 2));
console.log(`Extracted ${manifest.length} captured resources.`);
