const fs = require('fs');
const path = require('path');
const { defineConfig } = require('vite');
const react = require('@vitejs/plugin-react');

// সফটওয়্যারের ডাটার একটিমাত্র উৎস
const DATA_FILE = path.resolve(__dirname, 'data/nkfms-data.json');

// প্রতিটি বিল্ডের আলাদা পরিচয়। কোডের ভেতরে __BUILD_ID__ হয়ে বসে, আর
// একই নম্বর dist/version.json-এ লেখা হয় — দুটি মিলিয়ে অ্যাপ বুঝতে পারে
// ব্যবহারকারীর হাতে পুরোনো কোড আছে কিনা।
const BUILD_ID = Date.now().toString(36);

/**
 * /api/data — অ্যাপ এখান থেকেই ডাটা পড়ে এবং এখানেই লিখে রাখে।
 * ফলে ব্রাউজারের ক্যাশ/localStorage-এর উপর কোনো নির্ভরতা থাকে না, আর
 * যেকোনো ব্রাউজারে সবসময় একই ডাটা দেখা যায়।
 */
function nkfmsDataApi() {
  const handle = (req, res, next) => {
    const url = (req.url || '').split('?')[0];
    if (url !== '/api/data') return next();

    if (req.method === 'GET') {
      try {
        const text = fs.readFileSync(DATA_FILE, 'utf8');
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.end(text);
      } catch (e) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: String(e && e.message ? e.message : e) }));
      }
      return;
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      let body = '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        try {
          const parsed = JSON.parse(body);
          // ভাঙা বা অসম্পূর্ণ ডাটা যেন কখনো ফাইলটি নষ্ট করতে না পারে
          if (!parsed || !Array.isArray(parsed.flats) || !Array.isArray(parsed.payments)) {
            throw new Error('ডাটার গঠন ঠিক নেই — flats ও payments থাকতে হবে');
          }
          if (parsed.flats.length === 0) {
            throw new Error('ফ্ল্যাটের তালিকা খালি — সংরক্ষণ করা হলো না');
          }
          // আগে অস্থায়ী ফাইলে লিখে তারপর বদলানো হয়, যাতে লেখার মাঝপথে
          // বিদ্যুৎ/ক্র্যাশ হলেও মূল ফাইলটি অক্ষত থাকে
          const tmp = DATA_FILE + '.tmp';
          fs.writeFileSync(tmp, JSON.stringify(parsed, null, 2), 'utf8');
          fs.renameSync(tmp, DATA_FILE);
          res.end(JSON.stringify({ ok: true, payments: parsed.payments.length }));
        } catch (e) {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e) }));
        }
      });
      return;
    }

    res.statusCode = 405;
    res.end();
  };

  // লোকাল ডাটা মুড (npm run dev:local): backups/ ফোল্ডারের সবচেয়ে নতুন
  // ব্যাকআপটি /__local-data__ পথে পরিবেশন করা হয় — src/lib/localClient.js
  // সেখান থেকেই পড়ে। প্রোডাকশন বিল্ডে এই পথের অস্তিত্বই নেই।
  const handleLocalData = (req, res, next) => {
    if ((req.url || '').split('?')[0] !== '/__local-data__') return next();
    try {
      const bakRoot = path.resolve(__dirname, 'backups');
      const day = fs.readdirSync(bakRoot).filter((d) => /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(d)).sort().pop();
      if (!day) throw new Error('backups/ ফোল্ডারে কোনো ব্যাকআপ নেই');
      const text = fs.readFileSync(path.join(bakRoot, day, 'full-backup.json'), 'utf8');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Backup-Day', day);
      res.end(text);
    } catch (e) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: String(e.message || e) }));
    }
  };

  return {
    name: 'nkfms-data-api',
    configureServer(server) {
      server.middlewares.use(handle);
      server.middlewares.use(handleLocalData);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handle);
    },
    // বিল্ডের সময় ডাটা ফাইলটি dist-এ কপি হয় — স্ট্যাটিক হোস্টিংয়ে
    // অ্যাপ /data/nkfms-data.json থেকে পড়তে পারে (শুধু-পড়া)।
    // সাথে version.json — পুরোনো ক্যাশ ধরার জন্য (src/utils/cacheGuard.js)
    closeBundle() {
      try {
        const outDir = path.resolve(__dirname, 'dist/data');
        fs.mkdirSync(outDir, { recursive: true });
        fs.copyFileSync(DATA_FILE, path.join(outDir, 'nkfms-data.json'));
      } catch (e) {
        console.warn('[nkfms] dist-এ ডাটা ফাইল কপি করা যায়নি:', e.message);
      }

      try {
        fs.writeFileSync(
          path.resolve(__dirname, 'dist/version.json'),
          JSON.stringify({ buildId: BUILD_ID, builtAt: new Date().toISOString() }, null, 2),
          'utf8'
        );
      } catch (e) {
        console.warn('[nkfms] version.json লেখা যায়নি:', e.message);
      }
    }
  };
}

module.exports = defineConfig({
  plugins: [react.default ? react.default() : react(), nkfmsDataApi()],
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID)
  },
  server: {
    port: 3000,
    open: true,
    // ডাটা ফাইলে লেখা হলে যেন পাতা রিলোড না হয় (নইলে সেভ → রিলোড লুপ হতো)
    watch: {
      ignored: ['**/data/nkfms-data.json', '**/data/nkfms-data.json.tmp']
    }
  },
  build: {
    outDir: 'dist'
  }
});
