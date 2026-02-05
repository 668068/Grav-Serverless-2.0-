/**
 * Grav-Serverless v2.0 (Optimized Edition)
 * Architecture: Workers (Logic) + D1 (Index/Settings) + R2 (Storage) + Cache API
 */

// --- 1. 内置微型 Markdown 解析器 (支持更多语法) ---
function parseMarkdown(text) {
  let html = text
    .replace(/^---\n[\s\S]*?\n---\n/, '') // 移除 Frontmatter
    .replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/\*\*(.*)\*\*/gim, '<b>$1</b>')
    .replace(/\*(.*)\*/gim, '<i>$1</i>')
    .replace(/!\[(.*?)\]\((.*?)\)/gim, "<img src='$2' alt='$1' class='img-fluid'>") // 图片
    .replace(/\[(.*?)\]\((.*?)\)/gim, "<a href='$2'>$1</a>") // 链接
    .replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>') // 引用
    .replace(/`([^`]+)`/gim, '<code>$1</code>') // 行内代码
    .replace(/\n$/gim, '<br />')
    .replace(/\n/gim, '<p>'); // 换行转段落
  return html;
}

function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]+?)\n---\n/);
  const meta = {};
  if (match) {
    match[1].split('\n').forEach(line => {
      const [k, ...v] = line.split(':');
      if (k && v) meta[k.trim()] = v.join(':').trim();
    });
  }
  return { meta, body: text.replace(match ? match[0] : '', '') };
}

// --- 2. 初始资源 (安装时写入 R2) ---
const SEED_FILES = {
  "assets/style.css": `
    :root{--primary:#10b981;--bg:#f9fafb;--text:#1f2937}
    body{font-family:system-ui,sans-serif;line-height:1.6;color:var(--text);background:var(--bg);margin:0}
    .container{max-width:800px;margin:0 auto;padding:2rem}
    header{display:flex;justify-content:space-between;align-items:center;margin-bottom:3rem;padding-bottom:1rem;border-bottom:1px solid #e5e7eb}
    h1,h2,h3{color:#111;line-height:1.2}
    a{color:var(--primary);text-decoration:none}
    a:hover{text-decoration:underline}
    .post-card{background:#fff;padding:1.5rem;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.1);margin-bottom:1.5rem}
    .meta{font-size:0.875rem;color:#6b7280;margin-bottom:0.5rem}
    footer{margin-top:4rem;text-align:center;color:#6b7280;font-size:0.875rem}
    img{max-width:100%;border-radius:4px}
    code{background:#f3f4f6;padding:0.2rem 0.4rem;border-radius:4px;font-size:0.9em}
    .cookie-banner{position:fixed;bottom:1rem;left:1rem;background:#fff;padding:1rem;border-radius:8px;box-shadow:0 4px 6px rgba(0,0,0,0.1);display:flex;align-items:center;gap:1rem;z-index:50;border:1px solid #e5e7eb}
    .btn{background:#000;color:#fff;padding:0.5rem 1rem;border-radius:4px;cursor:pointer;border:none}
  `,
  "admin.html": `<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8"><title>Grav Serverless Admin</title><script src="https://unpkg.com/vue@3/dist/vue.global.js"></script><script src="https://cdn.tailwindcss.com"></script></head><body class="bg-gray-100 text-gray-800"><div id="app">
    <div v-if="!token" class="min-h-screen flex items-center justify-center"><div class="bg-white p-8 rounded shadow-lg w-96"><h1 class="text-2xl font-bold mb-6 text-emerald-600">管理后台</h1><input v-model="pass" type="password" placeholder="输入管理员密码" class="w-full border p-3 rounded mb-4 focus:ring-2 ring-emerald-500 outline-none" @keyup.enter="login"><button @click="login" class="w-full bg-emerald-600 text-white p-3 rounded hover:bg-emerald-700 transition">登录</button></div></div>
    <div v-else class="flex min-h-screen"><aside class="w-64 bg-gray-900 text-gray-300 flex flex-col"><div class="p-6 text-xl font-bold text-white border-b border-gray-800">控制台</div><nav class="flex-1 p-4 space-y-2"><a @click="tab='pages';fetchPages()" :class="{'bg-gray-800 text-white':tab=='pages'}" class="block p-3 rounded cursor-pointer hover:bg-gray-800">文章管理</a><a @click="tab='settings';fetchSettings()" :class="{'bg-gray-800 text-white':tab=='settings'}" class="block p-3 rounded cursor-pointer hover:bg-gray-800">系统设置</a><a @click="tab='backup'" :class="{'bg-gray-800 text-white':tab=='backup'}" class="block p-3 rounded cursor-pointer hover:bg-gray-800">备份恢复</a></nav><div class="p-4 border-t border-gray-800"><button @click="logout" class="w-full text-left p-2 hover:text-white">退出登录</button></div></aside>
    <main class="flex-1 p-8 overflow-y-auto">
      <div v-if="tab=='pages'">
        <div class="flex justify-between mb-6"><h2 class="text-2xl font-bold">文章列表</h2><button @click="edit({})" class="bg-emerald-600 text-white px-4 py-2 rounded shadow hover:bg-emerald-700">+ 新建文章</button></div>
        <div v-if="editor.show" class="bg-white p-6 rounded shadow-lg"><div class="grid grid-cols-2 gap-6"><div class="space-y-4"><input v-model="editor.data.title" placeholder="文章标题" class="w-full border p-2 rounded"><input v-model="editor.data.slug" placeholder="Slug (如 /about)" class="w-full border p-2 rounded"><input v-model="editor.data.category" placeholder="分类 (可选)" class="w-full border p-2 rounded"><textarea v-model="editor.data.content" placeholder="Markdown 内容..." class="w-full h-96 border p-2 rounded font-mono text-sm"></textarea></div><div class="border p-4 rounded bg-gray-50 h-full overflow-auto prose" v-html="preview(editor.data.content)"></div></div><div class="mt-4 flex gap-4"><button @click="savePost" class="bg-emerald-600 text-white px-6 py-2 rounded">保存发布</button><button @click="editor.show=false" class="bg-gray-500 text-white px-6 py-2 rounded">取消</button></div></div>
        <div v-else class="bg-white rounded shadow overflow-hidden"><table class="w-full text-left"><thead class="bg-gray-50 border-b"><tr><th class="p-4">标题</th><th class="p-4">路径</th><th class="p-4">分类</th><th class="p-4 w-48">操作</th></tr></thead><tbody><tr v-for="p in list" :key="p.slug" class="border-b hover:bg-gray-50"><td class="p-4 font-medium">{{p.title}}</td><td class="p-4 text-gray-500">{{p.slug}}</td><td class="p-4"><span class="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">{{p.category||'默认'}}</span></td><td class="p-4"><button @click="edit(p)" class="text-emerald-600 mr-4 font-medium">编辑</button><button @click="del(p.slug)" class="text-red-500 font-medium">删除</button></td></tr></tbody></table></div>
      </div>
      <div v-if="tab=='settings'" class="max-w-2xl bg-white p-8 rounded shadow"><h2 class="text-2xl font-bold mb-6">网站设置</h2><div class="space-y-4"><div v-for="(v,k) in settings" :key="k">
        <label class="block text-sm font-bold mb-1 capitalize">{{k.replace('_',' ')}}</label><input v-model="settings[k]" class="w-full border p-2 rounded"></div>
        <button @click="saveSettings" class="bg-emerald-600 text-white px-6 py-2 rounded mt-4">保存设置</button></div></div>
      <div v-if="tab=='backup'" class="max-w-xl bg-white p-8 rounded shadow"><h2 class="text-2xl font-bold mb-6">数据库操作</h2><p class="mb-4 text-gray-600">将导出所有文章和设置到本地 JSON 文件。</p><button @click="downloadBackup" class="bg-blue-600 text-white px-4 py-2 rounded mr-4">下载备份 (JSON)</button><hr class="my-6"><p class="mb-4 text-gray-600">从 JSON 恢复数据 (将会覆盖现有数据)。</p><textarea v-model="importData" class="w-full border p-2 h-32 mb-2 rounded" placeholder="粘贴 JSON 内容"></textarea><button @click="doImport" class="bg-red-600 text-white px-4 py-2 rounded">执行恢复</button></div>
    </main></div></div>
    <script>
      const { createApp } = Vue;
      createApp({
        data(){ return { token: localStorage.getItem('t'), pass:'', tab:'pages', list:[], settings:{}, editor:{show:false, data:{}}, importData:'' } },
        methods: {
          async req(ep, method='GET', body=null){
            const res = await fetch('/api'+ep, {method, headers:{'Authorization':this.token}, body:body?JSON.stringify(body):null});
            if(res.status==401) this.logout(); return res.json();
          },
          async login(){ const res = await fetch('/api/login', {method:'POST', body:JSON.stringify({pass:this.pass})}); const d=await res.json(); if(d.t){this.token=d.t;localStorage.setItem('t',d.t);this.fetchPages()}else alert('密码错误') },
          logout(){ this.token=null; localStorage.removeItem('t') },
          async fetchPages(){ this.list = await this.req('/posts') },
          async fetchSettings(){ this.settings = await this.req('/settings') },
          async edit(p){ if(p.slug){ const d = await this.req('/post?slug='+p.slug); this.editor.data={...d, oldSlug:p.slug} } else { this.editor.data={title:'',slug:'',category:'',content:''} }; this.editor.show=true },
          async savePost(){ await this.req('/post', 'POST', this.editor.data); this.editor.show=false; this.fetchPages() },
          async del(s){ if(confirm('确定删除?')) await this.req('/post?slug='+s, 'DELETE'); this.fetchPages() },
          async saveSettings(){ await this.req('/settings', 'POST', this.settings); alert('保存成功') },
          preview(md){ return md?md.replace(/^# (.*)/gm,'<h1 class="text-xl font-bold">$1</h1>').replace(/\\n/g,'<br>'):'' },
          async downloadBackup(){ const d=await this.req('/backup'); const b=new Blob([JSON.stringify(d)],{type:'application/json'}); const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download='backup.json'; a.click() },
          async doImport(){ try{await this.req('/import','POST',JSON.parse(this.importData));alert('成功');this.importData=''}catch(e){alert('格式错误')} }
        },
        mounted(){ if(this.token) this.fetchPages() }
      }).mount('#app')
    </script></body></html>`
};

// --- 3. 核心 Worker 逻辑 ---
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const cache = caches.default;

    // A. 静态资源路由 (CSS/JS/Admin) - 优先查缓存，再查 R2
    if (path.startsWith('/assets/') || path === '/admin') {
      let response = await cache.match(request);
      if (!response) {
        const key = path === '/admin' ? 'admin.html' : path.slice(1); // remove leading /
        const object = await env.BUCKET.get(key);
        if (!object) return new Response("Not Found", { status: 404 });

        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('etag', object.httpEtag);
        // 设置强缓存，减少 R2 读取
        headers.set('Cache-Control', env.CACHE_CONTROL || 'public, max-age=3600'); 
        
        response = new Response(object.body, { headers });
        ctx.waitUntil(cache.put(request, response.clone())); // 写入缓存
      }
      return response;
    }

    // B. 系统安装
    if (path === '/install') {
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS posts (slug TEXT PRIMARY KEY, title TEXT, category TEXT, r2_key TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`).run();
      await env.DB.prepare(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`).run();
      await env.DB.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('site_name', 'My Serverless Blog'), ('footer_text', '© 2024 Powered by Cloudflare'), ('cookie_notice', '本站使用 Cookie 以提升体验。')`).run();
      
      // 写入初始文件到 R2
      for (const [k, v] of Object.entries(SEED_FILES)) {
        await env.BUCKET.put(k, v);
      }
      return new Response("Installed successfully. Go to /admin");
    }

    // C. API (后端逻辑 - 不缓存)
    if (path.startsWith('/api')) {
      const auth = request.headers.get('Authorization');
      // 登录接口
      if (path === '/api/login' && request.method === 'POST') {
        const { pass } = await request.json();
        return pass === env.ADMIN_PASSWORD 
          ? Response.json({ t: `Bearer ${env.ADMIN_PASSWORD}` }) 
          : Response.json({ error: 'Fail' }, { status: 403 });
      }
      
      // 鉴权拦截
      if (auth !== `Bearer ${env.ADMIN_PASSWORD}`) return new Response('Unauthorized', { status: 401 });

      // CRUD 逻辑
      if (path === '/api/posts') {
        const { results } = await env.DB.prepare("SELECT * FROM posts ORDER BY created_at DESC").all();
        return Response.json(results);
      }
      if (path === '/api/post') {
        if (request.method === 'GET') {
          const slug = url.searchParams.get('slug');
          const post = await env.DB.prepare("SELECT * FROM posts WHERE slug=?").bind(slug).first();
          if(!post) return Response.json({});
          const obj = await env.BUCKET.get(post.r2_key);
          const content = await obj.text();
          return Response.json({ ...post, content });
        }
        if (request.method === 'POST') {
          const { title, slug, category, content, oldSlug } = await request.json();
          const r2_key = `posts/${slug.replace(/\//g,'')}.md`;
          
          if (oldSlug && oldSlug !== slug) { // 修改了路径，删除旧文件
             const oldPost = await env.DB.prepare("SELECT r2_key FROM posts WHERE slug=?").bind(oldSlug).first();
             if(oldPost) await env.BUCKET.delete(oldPost.r2_key);
             await env.DB.prepare("DELETE FROM posts WHERE slug=?").bind(oldSlug).run();
          }

          await env.BUCKET.put(r2_key, content);
          await env.DB.prepare("INSERT OR REPLACE INTO posts (slug, title, category, r2_key) VALUES (?, ?, ?, ?)").bind(slug, title, category, r2_key).run();
          return Response.json({ ok: true });
        }
        if (request.method === 'DELETE') {
          const slug = url.searchParams.get('slug');
          const post = await env.DB.prepare("SELECT r2_key FROM posts WHERE slug=?").bind(slug).first();
          if(post) await env.BUCKET.delete(post.r2_key);
          await env.DB.prepare("DELETE FROM posts WHERE slug=?").bind(slug).run();
          return Response.json({ ok: true });
        }
      }
      if (path === '/api/settings') {
        if (request.method === 'GET') {
          const { results } = await env.DB.prepare("SELECT * FROM settings").all();
          const sets = {}; results.forEach(r => sets[r.key] = r.value);
          return Response.json(sets);
        }
        if (request.method === 'POST') {
           const sets = await request.json();
           const stmt = env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
           await env.DB.batch(Object.entries(sets).map(([k,v]) => stmt.bind(k, v)));
           return Response.json({ ok: true });
        }
      }
      if (path === '/api/backup') {
          const posts = await env.DB.prepare("SELECT * FROM posts").all();
          const settings = await env.DB.prepare("SELECT * FROM settings").all();
          return Response.json({ posts: posts.results, settings: settings.results });
      }
      if (path === '/api/import') {
          const { posts, settings } = await request.json();
          // 简单恢复逻辑，仅恢复数据库索引，R2 文件需另外处理或假定已存在
          if(posts) {
             const pStmt = env.DB.prepare("INSERT OR REPLACE INTO posts (slug, title, category, r2_key) VALUES (?, ?, ?, ?)");
             await env.DB.batch(posts.map(p => pStmt.bind(p.slug, p.title, p.category, p.r2_key)));
          }
          if(settings) {
             const sStmt = env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
             await env.DB.batch(settings.map(s => sStmt.bind(s.key, s.value)));
          }
          return Response.json({ ok: true });
      }
      return Response.json({ error: 'API Not Found' }, { status: 404 });
    }

    // D. 前端页面渲染 (SSR)
    const slug = path;
    const post = await env.DB.prepare("SELECT * FROM posts WHERE slug=?").bind(slug).first();

    if (post) {
      const obj = await env.BUCKET.get(post.r2_key);
      if (!obj) return new Response("Content Lost", { status: 500 });
      
      const rawMd = await obj.text();
      const htmlContent = parseMarkdown(rawMd);
      
      // 获取全站设置
      const { results } = await env.DB.prepare("SELECT * FROM settings").all();
      const sets = {}; results.forEach(r => sets[r.key] = r.value);

      const html = `<!DOCTYPE html>
      <html lang="zh">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${post.title} - ${sets.site_name || 'Blog'}</title>
        <link rel="stylesheet" href="/assets/style.css">
      </head>
      <body>
        <div class="container">
          <header>
            <h1><a href="/">${sets.site_name}</a></h1>
            <nav><a href="/">首页</a>${post.category ? ` / <span>${post.category}</span>` : ''}</nav>
          </header>
          <article class="post-card">
            <h2>${post.title}</h2>
            <div class="meta">${post.created_at}</div>
            <div class="content">${htmlContent}</div>
          </article>
          <footer>
            <p>${sets.footer_text}</p>
            <p><a href="/disclaimer">免责声明</a> | <a href="/privacy">隐私政策</a></p>
          </footer>
        </div>
        <div id="cookie-banner" class="cookie-banner" style="display:none">
            <span>${sets.cookie_notice}</span>
            <button class="btn" onclick="acceptCookie()">接受</button>
            <button class="btn" style="background:#ddd;color:#333" onclick="declineCookie()">拒绝</button>
        </div>
        <script>
            if(!localStorage.getItem('cookie')){document.getElementById('cookie-banner').style.display='flex'}
            function acceptCookie(){localStorage.setItem('cookie','1');document.getElementById('cookie-banner').style.display='none'}
            function declineCookie(){document.getElementById('cookie-banner').style.display='none'}
        </script>
      </body>
      </html>`;
      
      return new Response(html, { headers: { "Content-Type": "text/html" } });
    } else {
        // 首页渲染 (文章列表)
        if (path === '/') {
            const { results } = await env.DB.prepare("SELECT * FROM posts ORDER BY created_at DESC").all();
            const { results: setRes } = await env.DB.prepare("SELECT * FROM settings").all();
            const sets = {}; setRes.forEach(r => sets[r.key] = r.value);
            
            const listHtml = results.map(p => `
                <div class="post-card">
                    <h3><a href="${p.slug}">${p.title}</a></h3>
                    <div class="meta">${p.category||'未分类'} · ${p.created_at}</div>
                </div>
            `).join('');
            
            const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${sets.site_name}</title><link rel="stylesheet" href="/assets/style.css"></head><body><div class="container"><header><h1>${sets.site_name}</h1></header><main>${listHtml}</main><footer><p>${sets.footer_text}</p></footer></div><div id="cookie-banner" class="cookie-banner" style="display:none"><span>${sets.cookie_notice}</span><button class="btn" onclick="localStorage.setItem('cookie','1');this.parentElement.style.display='none'">接受</button></div><script>if(!localStorage.getItem('cookie'))document.getElementById('cookie-banner').style.display='flex'</script></body></html>`;
            return new Response(html, { headers: { "Content-Type": "text/html" } });
        }
    }

    return new Response("404 Not Found", { status: 404 });
  }
};
