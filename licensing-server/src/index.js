/**
 * ink-xY Novel Studio Licensing Server
 * Cloudflare Worker (Zero Dependencies, Native Web Crypto API)
 */

// Helper to construct JSON responses with CORS headers
function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Token",
      ...headers
    }
  });
}

// Handle CORS Preflight OPTIONS requests
function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Admin-Token",
      "Access-Control-Max-Age": "86400"
    }
  });
}

// Parse cookies from request headers
function getCookie(request, name) {
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(";");
  for (let cookie of cookies) {
    const [key, value] = cookie.trim().split("=");
    if (key === name) {
      return decodeURIComponent(value);
    }
  }
  return null;
}

// Check Admin Access (via Session Cookie or X-Admin-Token header)
function checkAdminAuth(request, adminToken) {
  const authHeader = request.headers.get("Authorization") || request.headers.get("X-Admin-Token");
  if (authHeader) {
    if (authHeader === adminToken || authHeader.replace("Bearer ", "") === adminToken) {
      return true;
    }
  }

  const sessionCookie = getCookie(request, "admin_session");
  if (sessionCookie === adminToken) {
    return true;
  }

  return false;
}

// Native JWT Sign Helper (HMAC SHA-256)
async function signJwt(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = btoa(JSON.stringify(header))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  const encodedPayload = btoa(JSON.stringify(payload))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  const tokenInput = `${encodedHeader}.${encodedPayload}`;

  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(tokenInput)
  );
  
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${tokenInput}.${encodedSignature}`;
}

// Native JWT Verify Helper (HMAC SHA-256)
async function verifyJwt(token, secret) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [headerStr, payloadStr, signatureStr] = parts;

    const encoder = new TextEncoder();
    const tokenInput = `${headerStr}.${payloadStr}`;
    const keyData = encoder.encode(secret);
    const key = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );

    // Reconstruct base64 signature
    const signatureBytes = new Uint8Array(
      atob(signatureStr.replace(/-/g, "+").replace(/_/g, "/"))
        .split("")
        .map(c => c.charCodeAt(0))
    );

    const isValid = await crypto.subtle.verify(
      "HMAC",
      key,
      signatureBytes,
      encoder.encode(tokenInput)
    );

    if (!isValid) return null;

    // Decode and parse payload
    const payload = JSON.parse(
      atob(payloadStr.replace(/-/g, "+").replace(/_/g, "/"))
    );
    return payload;
  } catch (e) {
    console.error("JWT Verification error:", e);
    return null;
  }
}

// Generate a random Key string
function generateRandomKey() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let parts = [];
  for (let i = 0; i < 4; i++) {
    let part = "";
    for (let j = 0; j < 4; j++) {
      part += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    parts.push(part);
  }
  return `INK-${parts.join("-")}`;
}

// Serves the HTML for the Login Page
function getLoginHtml() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>管理员登录 - Novel Studio 授权系统</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body {
      background-color: #0b0f19;
      color: #f3f4f6;
    }
    .glass-card {
      background: rgba(17, 24, 39, 0.7);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.05);
    }
  </style>
</head>
<body class="min-h-screen bg-slate-950 font-sans flex items-center justify-center p-4">
  <div class="glass-card max-w-md w-full rounded-3xl p-8 shadow-2xl relative overflow-hidden">
    <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 via-indigo-500 to-blue-500"></div>
    <div class="text-center mb-8">
      <h2 class="text-2xl font-extrabold text-white">管理员安全登录</h2>
      <p class="text-slate-400 text-xs mt-2">请输入您的安全凭证以访问授权控制后台</p>
    </div>
    
    <form onsubmit="handleLogin(event)" class="space-y-6">
      <div>
        <label class="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">管理员密码</label>
        <input id="password-input" type="password" required placeholder="请输入您的密码..." class="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition text-sm">
      </div>
      
      <button type="submit" class="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-4 rounded-xl transition text-sm shadow-lg shadow-indigo-650/30">
        确认登录
      </button>
    </form>
    
    <div id="error-message" class="hidden text-xs py-2.5 px-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg mt-4 text-center">
      密码错误，请重新输入！
    </div>
  </div>

  <script>
    async function handleLogin(event) {
      event.preventDefault();
      const password = document.getElementById('password-input').value;
      const errorDiv = document.getElementById('error-message');
      errorDiv.classList.add('hidden');

      try {
        const res = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password })
        });
        if (res.ok) {
          window.location.reload();
        } else {
          errorDiv.classList.remove('hidden');
        }
      } catch (err) {
        alert("网络错误，请稍后再试");
      }
    }
  </script>
</body>
</html>`;
}

// Serves the HTML for the Admin Page
function getAdminHtml() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Novel Studio 授权管理控制台</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body {
      background-color: #0b0f19;
      color: #f3f4f6;
    }
    .glass-panel {
      background: rgba(17, 24, 39, 0.7);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.05);
    }
  </style>
</head>
<body class="min-h-screen bg-slate-950 font-sans pb-12">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
    <!-- Header -->
    <header class="flex justify-between items-center pb-6 border-b border-slate-800 mb-8">
      <div>
        <h1 class="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-indigo-300 to-blue-500">
          Novel Studio 授权管理后台
        </h1>
        <p class="text-slate-400 text-sm mt-1">管理激活码的使用期限、电脑设备绑定与销售状态</p>
      </div>
      <button onclick="logout()" class="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition border border-slate-750">
        退出登录
      </button>
    </header>

    <!-- Stats row -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      <div class="glass-panel p-6 rounded-2xl shadow-xl flex items-center justify-between">
        <div>
          <p class="text-sm font-semibold text-slate-400 uppercase">总激活码数量</p>
          <p id="stat-total" class="text-3xl font-bold mt-2 text-indigo-400">...</p>
        </div>
        <div class="p-3 bg-indigo-500/10 rounded-xl text-indigo-400 text-2xl">🔑</div>
      </div>
      <div class="glass-panel p-6 rounded-2xl shadow-xl flex items-center justify-between">
        <div>
          <p class="text-sm font-semibold text-slate-400 uppercase">活跃授权码 (启用)</p>
          <p id="stat-active" class="text-3xl font-bold mt-2 text-emerald-400">...</p>
        </div>
        <div class="p-3 bg-emerald-500/10 rounded-xl text-emerald-400 text-2xl">✅</div>
      </div>
      <div class="glass-panel p-6 rounded-2xl shadow-xl flex items-center justify-between">
        <div>
          <p class="text-sm font-semibold text-slate-400 uppercase">已激活电脑台数</p>
          <p id="stat-devices" class="text-3xl font-bold mt-2 text-blue-400">...</p>
        </div>
        <div class="p-3 bg-blue-500/10 rounded-xl text-blue-400 text-2xl">💻</div>
      </div>
    </div>

    <!-- Generate Panel & Search Panel -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
      <!-- Batch Generator Form -->
      <div class="glass-panel p-6 rounded-2xl shadow-xl lg:col-span-2">
        <h2 class="text-xl font-bold text-slate-200 mb-4 flex items-center gap-2">
          <span>⚡</span> 批量生成激活码
        </h2>
        <form id="gen-form" class="grid grid-cols-1 sm:grid-cols-3 gap-4" onsubmit="generateKeys(event)">
          <div>
            <label class="block text-xs text-slate-400 font-semibold mb-1">使用天数 (有效期)</label>
            <select id="gen-days" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-sm">
              <option value="30">30天</option>
              <option value="90">90天</option>
              <option value="365">365天</option>
              <option value="-1">永久</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-slate-400 font-semibold mb-1">最大允许电脑台数</label>
            <input id="gen-devices" type="number" value="1" min="1" required class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-sm">
          </div>
          <div>
            <label class="block text-xs text-slate-400 font-semibold mb-1">生成码数量</label>
            <input id="gen-count" type="number" value="5" min="1" max="100" required class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-sm">
          </div>
          <div class="sm:col-span-3">
            <label class="block text-xs text-slate-400 font-semibold mb-1">自定义激活码名称 (选填，仅限生成 1 个码时使用)</label>
            <input id="gen-custom-key" type="text" placeholder="例: VIP-SPECIAL-CODE" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-sm">
          </div>
          <div class="sm:col-span-3 mt-2">
            <button type="submit" class="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2.5 px-4 rounded-lg transition text-sm">
              立即生成并录入数据库
            </button>
          </div>
        </form>
      </div>

      <!-- Quick Actions / Search -->
      <div class="glass-panel p-6 rounded-2xl shadow-xl flex flex-col justify-between">
        <div>
          <h2 class="text-xl font-bold text-slate-200 mb-4 flex items-center gap-2">
            <span>🔍</span> 快速检索激活码
          </h2>
          <input id="search-input" type="text" placeholder="输入激活码进行实时过滤..." oninput="filterKeys()" class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-sm mb-4">
          <p class="text-xs text-slate-400 leading-relaxed">
            * 激活码默认为 16 位不重复的字母和数字组合。<br>
            * 可在列表中点击激活码旁的 <b>“复制”</b> 按钮进行一键复制。<br>
            * 下方支持分页选项卡查看“已激活”与“未激活”列表。<br>
            * <b>使用时长：</b> 支持30天、90天、365天与永久有效（首次激活起算）。
          </p>
        </div>
        <div id="toast" class="hidden text-xs py-2 px-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg mt-4 text-center">
          操作成功！
        </div>
      </div>
    </div>

    <!-- Tab Switching & Table -->
    <div class="glass-panel rounded-2xl shadow-xl overflow-hidden">
      <!-- Tabs header -->
      <div class="px-6 pt-6 border-b border-slate-800 bg-slate-900/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <!-- Sub-pages Navigation Tabs -->
        <div class="flex border-b border-transparent gap-6 text-sm w-full sm:w-auto">
          <button onclick="switchTab('all')" id="tab-all" class="pb-3 border-b-2 border-indigo-500 font-bold text-white transition">
            全部激活码
          </button>
          <button onclick="switchTab('activated')" id="tab-activated" class="pb-3 border-b-2 border-transparent text-slate-400 hover:text-slate-200 transition">
            已激活电脑的 (Activated)
          </button>
          <button onclick="switchTab('unactivated')" id="tab-unactivated" class="pb-3 border-b-2 border-transparent text-slate-400 hover:text-slate-200 transition">
            未激活的 (Unactivated)
          </button>
        </div>
        <button onclick="fetchLicenses()" class="pb-3 text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1">
          🔄 刷新数据
        </button>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-slate-900/50 border-b border-slate-800 text-slate-400 text-xs uppercase font-semibold">
              <th class="p-4">激活码 (Key)</th>
              <th class="p-4">过期时间 (Expires)</th>
              <th class="p-4 text-center">设备限额</th>
              <th class="p-4 text-center">状态</th>
              <th class="p-4">已绑定的电脑设备 (UUID)</th>
              <th class="p-4 text-right">管理操作</th>
            </tr>
          </thead>
          <tbody id="license-table-body" class="divide-y divide-slate-800 text-sm">
            <tr>
              <td colspan="6" class="p-8 text-center text-slate-500">数据加载中...</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- Generated Keys Modal -->
  <div id="keys-modal" class="hidden fixed inset-0 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
    <div class="bg-slate-900 border border-slate-800 max-w-md w-full rounded-2xl p-6 shadow-2xl">
      <h3 class="text-xl font-bold text-slate-100 mb-2 flex items-center gap-2">
        <span>🎉</span> 激活码生成成功
      </h3>
      <p class="text-xs text-slate-400 mb-4">请复制以下生成的激活码发送给用户：</p>
      <textarea id="modal-textarea" readonly class="w-full bg-slate-950 border border-slate-800 text-indigo-300 font-mono text-sm p-3 rounded-lg h-36 focus:outline-none mb-4"></textarea>
      <div class="flex gap-3">
        <button onclick="copyGeneratedKeys()" class="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 rounded-lg transition text-sm">
          复制到剪贴板
        </button>
        <button onclick="closeModal()" class="px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition text-sm">
          关闭
        </button>
      </div>
    </div>
  </div>

  <!-- Custom Confirmation Modal (No Browser Dialogs!) -->
  <div id="confirm-modal" class="hidden fixed inset-0 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm z-50">
    <div class="bg-slate-900 border border-slate-800 max-w-sm w-full rounded-2xl p-6 shadow-2xl relative overflow-hidden">
      <div class="absolute top-0 left-0 w-full h-1 bg-indigo-500"></div>
      <h3 id="confirm-title" class="text-lg font-bold text-slate-100 mb-2">确认操作</h3>
      <p id="confirm-message" class="text-xs text-slate-400 mb-6 leading-relaxed">确定要执行此操作吗？</p>
      <div class="flex gap-3">
        <button id="confirm-yes-btn" class="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 rounded-lg transition text-sm">
          确定
        </button>
        <button onclick="closeConfirmModal()" class="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition text-sm border border-slate-750">
          取消
        </button>
      </div>
    </div>
  </div>

  <script>
    let allLicenses = [];
    let currentTab = 'all';

    async function fetchLicenses() {
      try {
        const res = await fetch('/api/admin/licenses');
        if (res.status === 401) {
          window.location.reload();
          return;
        }
        const data = await res.json();
        allLicenses = data.licenses || [];
        renderStats();
        filterKeys();
      } catch (err) {
        showToast("加载数据失败", true);
      }
    }

    function renderStats() {
      document.getElementById('stat-total').innerText = allLicenses.length;
      document.getElementById('stat-active').innerText = allLicenses.filter(l => l.is_active === 1).length;
      
      let deviceCount = 0;
      allLicenses.forEach(l => {
        if (l.devices) deviceCount += l.devices.length;
      });
      document.getElementById('stat-devices').innerText = deviceCount;
    }

    function switchTab(tabName) {
      currentTab = tabName;
      
      const tabs = ['all', 'activated', 'unactivated'];
      tabs.forEach(t => {
        const el = document.getElementById("tab-" + t);
        if (t === tabName) {
          el.className = "pb-3 border-b-2 border-indigo-500 font-bold text-white transition";
        } else {
          el.className = "pb-3 border-b-2 border-transparent text-slate-400 hover:text-slate-200 transition";
        }
      });

      filterKeys();
    }

    function filterKeys() {
      const q = document.getElementById('search-input').value.trim().toUpperCase();
      let filtered = allLicenses;

      if (currentTab === 'activated') {
        filtered = filtered.filter(l => l.devices && l.devices.length > 0);
      } else if (currentTab === 'unactivated') {
        filtered = filtered.filter(l => !l.devices || l.devices.length === 0);
      }

      if (q) {
        filtered = filtered.filter(l => l.key.toUpperCase().includes(q));
      }

      renderTable(filtered);
    }

    function copyToClipboard(text, btnElement) {
      navigator.clipboard.writeText(text).then(() => {
        const originalText = btnElement.innerText;
        btnElement.innerText = "已复制!";
        btnElement.className = "text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-bold transition";
        setTimeout(() => {
          btnElement.innerText = originalText;
          btnElement.className = "text-xs text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded transition border border-indigo-500/10";
        }, 1500);
      }).catch(err => {
        showToast("复制失败，请手动选择复制", true);
      });
    }

    // Custom confirm dialog trigger helper
    function triggerConfirm(title, message, onYesAction) {
      document.getElementById("confirm-title").innerText = title;
      document.getElementById("confirm-message").innerText = message;
      
      const yesBtn = document.getElementById("confirm-yes-btn");
      const newYesBtn = yesBtn.cloneNode(true);
      yesBtn.parentNode.replaceChild(newYesBtn, yesBtn);
      
      newYesBtn.addEventListener("click", () => {
        onYesAction();
        closeConfirmModal();
      });
      
      document.getElementById("confirm-modal").classList.remove("hidden");
    }

    function closeConfirmModal() {
      document.getElementById("confirm-modal").classList.add("hidden");
    }

    function renderTable(licenses) {
      const tbody = document.getElementById('license-table-body');
      if (licenses.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-slate-500">没有找到任何匹配的激活码</td></tr>';
        return;
      }

      tbody.innerHTML = licenses.map(l => {
        const isActivated = l.expires_at !== null;
        const isLifetime = l.validity_days === -1 || l.expires_at === '9999-12-31T23:59:59Z';
        const isExpired = !isLifetime && isActivated && (new Date(l.expires_at) < new Date());
        
        let expiryText = '';
        if (isLifetime) {
          expiryText = '<span class="text-indigo-400 font-bold">永久有效</span>';
        } else if (!isActivated) {
          expiryText = '<span class="text-indigo-400 font-semibold">首次激活起 ' + l.validity_days + ' 天</span>';
        } else {
          expiryText = new Date(l.expires_at).toLocaleString();
        }
        
        let statusBadge = '';
        if (l.is_active !== 1) {
          statusBadge = '<span class="px-2 py-1 text-xs font-semibold bg-red-500/10 text-red-400 rounded-full border border-red-500/20">已禁用</span>';
        } else if (!isActivated) {
          statusBadge = '<span class="px-2 py-1 text-xs font-semibold bg-indigo-500/10 text-indigo-400 rounded-full border border-indigo-500/20">新卡/待激活</span>';
        } else if (isExpired) {
          statusBadge = '<span class="px-2 py-1 text-xs font-semibold bg-red-500/10 text-red-400 rounded-full border border-red-500/20">已过期</span>';
        } else {
          statusBadge = '<span class="px-2 py-1 text-xs font-semibold bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/20">使用中</span>';
        }

        let devicesHtml = '<span class="text-slate-500 text-xs">无设备绑定</span>';
        if (l.devices && l.devices.length > 0) {
          devicesHtml = l.devices.map(d => 
            '<div class="flex items-center gap-2 mb-1 bg-slate-900 border border-slate-800 rounded px-2 py-1 max-w-xs">' +
              '<span class="font-mono text-xs text-slate-300 truncate flex-1" title="' + d.machine_uuid + '">' + d.machine_uuid + '</span>' +
              '<button onclick="deleteDevice(\\\'' + l.key + '\\\', \\\'' + d.machine_uuid + '\\\')" class="text-red-400 hover:text-red-300 text-xs font-bold px-1" title="强制解绑此设备">解绑</button>' +
            '</div>'
          ).join('');
        }

        return '<tr class="hover:bg-slate-900/30 transition">' +
          '<td class="p-4">' +
            '<div class="flex items-center gap-2">' +
              '<span class="font-mono font-semibold text-indigo-300 text-base">' + l.key + '</span>' +
              '<button onclick="copyToClipboard(\\\'' + l.key + '\\\', this)" class="text-xs text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/10 transition">' +
                '复制' +
              '</button>' +
            '</div>' +
          '</td>' +
          '<td class="p-4 text-xs text-slate-400 ' + (isExpired ? 'line-through' : '') + '">' + expiryText + '</td>' +
          '<td class="p-4 text-center font-bold text-slate-300">' + (l.devices ? l.devices.length : 0) + ' / ' + l.max_devices + '</td>' +
          '<td class="p-4 text-center">' + statusBadge + '</td>' +
          '<td class="p-4">' + devicesHtml + '</td>' +
          '<td class="p-4 text-right flex justify-end gap-2">' +
            '<button onclick="toggleLicense(\\\'' + l.key + '\\\')" class="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition">' +
              (l.is_active === 1 ? '禁用' : '启用') +
            '</button>' +
            '<button onclick="deleteLicense(\\\'' + l.key + '\\\')" class="px-2.5 py-1 text-xs bg-red-650 hover:bg-red-600 text-white rounded border border-red-500/20 transition">' +
              '删除' +
            '</button>' +
          '</td>' +
        '</tr>';
      }).join('');
    }

    function toggleLicense(key) {
      triggerConfirm(
        "更改激活码状态", 
        "确定要" + (allLicenses.find(l => l.key === key)?.is_active === 1 ? "禁用" : "启用") + "激活码 [" + key + "] 吗？",
        () => toggleLicenseAction(key)
      );
    }

    async function toggleLicenseAction(key) {
      try {
        const res = await fetch('/api/admin/toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key })
        });
        if (res.ok) {
          showToast("激活码状态更新成功");
          fetchLicenses();
        } else {
          showToast("更新激活码状态失败", true);
        }
      } catch (err) {
        showToast("网络连接错误", true);
      }
    }

    function deleteDevice(key, uuid) {
      triggerConfirm(
        "解绑电脑设备",
        "确定要解绑该电脑设备指纹 [" + uuid + "] 吗？解绑后此设备将无法使用本软件，直到重新激活。",
        () => deleteDeviceAction(key, uuid)
      );
    }

    async function deleteDeviceAction(key, uuid) {
      try {
        const res = await fetch('/api/admin/delete-device', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, machine_uuid: uuid })
        });
        if (res.ok) {
          showToast("设备解绑成功");
          fetchLicenses();
        } else {
          showToast("设备解绑失败", true);
        }
      } catch (err) {
        showToast("网络连接错误", true);
      }
    }

    function deleteLicense(key) {
      triggerConfirm(
        "⚠️ 彻底删除激活码",
        "警告：此操作不可逆！确定要从数据库中彻底清除激活码 [" + key + "] 吗？这将会强制注销目前所有已激活的用户设备！",
        () => deleteLicenseAction(key)
      );
    }

    async function deleteLicenseAction(key) {
      try {
        const res = await fetch('/api/admin/delete-license', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key })
        });
        if (res.ok) {
          showToast("激活码已从数据库彻底删除");
          fetchLicenses();
        } else {
          showToast("删除激活码失败", true);
        }
      } catch (err) {
        showToast("网络连接错误", true);
      }
    }

    async function generateKeys(event) {
      event.preventDefault();
      const days = document.getElementById('gen-days').value;
      const devices = document.getElementById('gen-devices').value;
      const count = document.getElementById('gen-count').value;
      const customKey = document.getElementById('gen-custom-key').value.trim();

      try {
        const res = await fetch('/api/admin/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expires_in_days: days,
            max_devices: devices,
            count: count,
            custom_key: customKey || undefined
          })
        });
        const data = await res.json();
        if (res.ok) {
          const keysStr = data.keys.map(k => k.key).join('\\n');
          document.getElementById('modal-textarea').value = keysStr;
          document.getElementById('keys-modal').classList.remove('hidden');
          document.getElementById('gen-form').reset();
          document.getElementById('gen-days').value = 30;
          document.getElementById('gen-devices').value = 1;
          document.getElementById('gen-count').value = 5;
          fetchLicenses();
        } else {
          showToast(data.message || "生成激活码失败", true);
        }
      } catch (err) {
        showToast("生成接口错误，请检查网络", true);
      }
    }

    function closeModal() {
      document.getElementById('keys-modal').classList.add('hidden');
    }

    function copyGeneratedKeys() {
      const textarea = document.getElementById('modal-textarea');
      textarea.select();
      document.execCommand('copy');
      showToast("激活码已复制到剪切板");
      closeModal();
    }

    function showToast(msg, isError = false) {
      const toast = document.getElementById('toast');
      toast.innerText = msg;
      toast.classList.remove('hidden', 'bg-emerald-500/10', 'border-emerald-500/20', 'text-emerald-400', 'bg-red-500/10', 'border-red-500/20', 'text-red-400');
      
      if (isError) {
        toast.classList.add('bg-red-500/10', 'border-red-500/20', 'text-red-400');
      } else {
        toast.classList.add('bg-emerald-500/10', 'border-emerald-500/20', 'text-emerald-400');
      }
      setTimeout(() => {
        toast.classList.add('hidden');
      }, 3000);
    }

    async function logout() {
      try {
        await fetch('/api/admin/logout', { method: 'POST' });
        window.location.reload();
      } catch (err) {
        showToast("退出失败，请重试", true);
      }
    }

    // Init load
    fetchLicenses();
  </script>
</body>
</html>`;
}

export default {
  async fetch(request, env) {
    // 1. Handle CORS Preflight
    if (request.method === "OPTIONS") {
      return handleOptions();
    }

    const url = new URL(request.url);
    const secret = env.JWT_SECRET || env.JWT_SECRET_FALLBACK || "super-secret-key-change-me";
    const adminToken = env.ADMIN_TOKEN || env.ADMIN_TOKEN_FALLBACK || "admin-token-123456";

    try {
      // --- PUBLIC ENDPOINTS ---

      // API Route: GET /api/status
      if (url.pathname === "/api/status" && request.method === "GET") {
        const bypassActive = env.BYPASS_LICENSE === "true";
        return jsonResponse({
          success: true,
          require_key: !bypassActive
        });
      }

      // API Route: POST /api/activate
      if (url.pathname === "/api/activate" && request.method === "POST") {
        const { key, machine_uuid } = await request.json();
        
        if (!key || !machine_uuid) {
          return jsonResponse({ message: "激活码(key)和机器ID(machine_uuid)不能为空" }, 400);
        }

        // 1. Query the license key status
        const license = await env.DB.prepare(
          "SELECT * FROM licenses WHERE key = ?"
        ).bind(key).first();

        if (!license) {
          return jsonResponse({ message: "激活码不存在，请检查输入" }, 403);
        }

        if (license.is_active !== 1) {
          return jsonResponse({ message: "激活码已被禁用或失效，请联系客服" }, 403);
        }

        const now = new Date();
        let expiresAtStr = license.expires_at;

        // If expires_at is NULL, calculate the real expiration time based on first activation!
        if (!expiresAtStr) {
          if (license.validity_days === -1) {
            // Lifetime: Set a far future date
            expiresAtStr = '9999-12-31T23:59:59Z';
          } else {
            const expiresAt = new Date();
            expiresAt.setDate(now.getDate() + license.validity_days);
            expiresAtStr = expiresAt.toISOString();
          }

          // Save the calculated expiry date to database
          await env.DB.prepare(
            "UPDATE licenses SET expires_at = ? WHERE key = ?"
          ).bind(expiresAtStr, key).run();
        }

        // 2. Expiry check (Lifetime key with 9999-12-31 will naturally pass)
        const expiresAt = new Date(expiresAtStr);
        if (now > expiresAt) {
          return jsonResponse({ message: "激活码已过期" }, 403);
        }

        // 3. Device check
        // Check if this machine is already registered for this key
        const existingDevice = await env.DB.prepare(
          "SELECT * FROM devices WHERE key = ? AND machine_uuid = ?"
        ).bind(key, machine_uuid).first();

        if (existingDevice) {
          // Re-generate and return token
          const tokenPayload = {
            key,
            machine_uuid,
            expires_at: expiresAtStr
          };
          const token = await signJwt(tokenPayload, secret);
          return jsonResponse({
            success: true,
            message: "设备已激活，成功返回授权令牌",
            token,
            expires_at: expiresAtStr
          });
        }

        // Check total devices registered to this key
        const { count } = await env.DB.prepare(
          "SELECT COUNT(*) as count FROM devices WHERE key = ?"
        ).bind(key).first();

        if (count >= license.max_devices) {
          return jsonResponse({ message: `激活失败：已超过最大电脑台数限制(${license.max_devices}台)` }, 403);
        }

        // Register new device
        const activatedAt = now.toISOString();
        await env.DB.prepare(
          "INSERT INTO devices (key, machine_uuid, activated_at) VALUES (?, ?, ?)"
        ).bind(key, machine_uuid, activatedAt).run();

        // Sign JWT Token
        const tokenPayload = {
          key,
          machine_uuid,
          expires_at: expiresAtStr
        };
        const token = await signJwt(tokenPayload, secret);

        return jsonResponse({
          success: true,
          message: "激活成功",
          token,
          expires_at: expiresAtStr
        });
      }

      // API Route: POST /api/verify
      if (url.pathname === "/api/verify" && request.method === "POST") {
        const { key, token, machine_uuid } = await request.json();

        if (!key || !token) {
          return jsonResponse({ message: "激活码或令牌(token)不能为空" }, 400);
        }

        // 1. Verify token signature and authenticity
        const payload = await verifyJwt(token, secret);
        if (!payload) {
          return jsonResponse({ message: "令牌无效或已被篡改" }, 403);
        }

        // 2. Validate token payload matches requested credentials
        if (payload.key !== key || (machine_uuid && payload.machine_uuid !== machine_uuid)) {
          return jsonResponse({ message: "安全凭证不匹配" }, 403);
        }

        // 3. Expiry check against server time
        const expiresAt = new Date(payload.expires_at);
        const now = new Date();
        if (now > expiresAt) {
          return jsonResponse({ message: "授权已过期" }, 403);
        }

        // 4. Double check database in case of revoking/blocking
        const license = await env.DB.prepare(
          "SELECT * FROM licenses WHERE key = ? AND is_active = 1"
        ).bind(key).first();

        if (!license) {
          return jsonResponse({ message: "该授权码已被注销或封禁" }, 403);
        }

        // Verify device still bound in DB
        if (machine_uuid) {
          const bound = await env.DB.prepare(
            "SELECT 1 FROM devices WHERE key = ? AND machine_uuid = ?"
          ).bind(key, machine_uuid).first();
          if (!bound) {
            return jsonResponse({ message: "该设备绑定已被管理员移除" }, 403);
          }
        }

        return jsonResponse({
          success: true,
          valid: true,
          message: "授权状态有效",
          expires_at: payload.expires_at,
          server_time: now.toISOString()
        });
      }

      // --- ADMIN ENDPOINTS & PAGES ---

      // Page: GET /admin
      if (url.pathname === "/admin" && request.method === "GET") {
        if (!checkAdminAuth(request, adminToken)) {
          const loginHtml = getLoginHtml();
          return new Response(loginHtml, {
            headers: { "Content-Type": "text/html; charset=utf-8" }
          });
        }
        const html = getAdminHtml();
        return new Response(html, {
          headers: { "Content-Type": "text/html; charset=utf-8" }
        });
      }

      // API Route: POST /api/admin/login
      if (url.pathname === "/api/admin/login" && request.method === "POST") {
        const { password } = await request.json();
        if (password === adminToken) {
          // Set secure cookie valid for 1 day
          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Set-Cookie": `admin_session=${encodeURIComponent(adminToken)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`
            }
          });
        }
        return jsonResponse({ message: "密码错误" }, 401);
      }

      // API Route: POST /api/admin/logout
      if (url.pathname === "/api/admin/logout" && request.method === "POST") {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": "admin_session=; Path=/; HttpOnly; SameSite=Strict; Expires=Thu, 01 Jan 1970 00:00:00 GMT"
          }
        });
      }

      // API Route: GET /api/admin/licenses
      if (url.pathname === "/api/admin/licenses" && request.method === "GET") {
        if (!checkAdminAuth(request, adminToken)) {
          return jsonResponse({ message: "未授权操作" }, 401);
        }

        // Fetch all licenses
        const { results: licenses } = await env.DB.prepare(
          "SELECT * FROM licenses ORDER BY expires_at DESC"
        ).all();

        // Fetch all registered devices
        const { results: devices } = await env.DB.prepare(
          "SELECT * FROM devices"
        ).all();

        // Join them in memory
        const joined = licenses.map(l => {
          return {
            ...l,
            devices: devices.filter(d => d.key === l.key)
          };
        });

        return jsonResponse({ success: true, licenses: joined });
      }

      // API Route: POST /api/admin/generate
      if (url.pathname === "/api/admin/generate" && request.method === "POST") {
        if (!checkAdminAuth(request, adminToken)) {
          return jsonResponse({ message: "未授权操作" }, 401);
        }

        const { expires_in_days = 30, max_devices = 1, count = 1, custom_key } = await request.json();

        const generatedKeys = [];

        if (custom_key) {
          const exists = await env.DB.prepare(
            "SELECT 1 FROM licenses WHERE key = ?"
          ).bind(custom_key).first();
          
          if (exists) {
            return jsonResponse({ message: `自定义激活码 ${custom_key} 已存在` }, 400);
          }

          // expires_at is set to NULL initially
          await env.DB.prepare(
            "INSERT INTO licenses (key, expires_at, validity_days, max_devices, is_active) VALUES (?, NULL, ?, ?, 1)"
          ).bind(custom_key, parseInt(expires_in_days), parseInt(max_devices)).run();
          
          generatedKeys.push({ key: custom_key, validity_days: parseInt(expires_in_days), max_devices });
        } else {
          for (let i = 0; i < parseInt(count); i++) {
            const key = generateRandomKey();
            // expires_at is set to NULL initially
            await env.DB.prepare(
              "INSERT INTO licenses (key, expires_at, validity_days, max_devices, is_active) VALUES (?, NULL, ?, ?, 1)"
            ).bind(key, parseInt(expires_in_days), parseInt(max_devices)).run();
            generatedKeys.push({ key, validity_days: parseInt(expires_in_days), max_devices });
          }
        }

        return jsonResponse({
          success: true,
          message: `成功生成 ${generatedKeys.length} 个激活码`,
          keys: generatedKeys
        });
      }

      // API Route: POST /api/admin/toggle
      if (url.pathname === "/api/admin/toggle" && request.method === "POST") {
        if (!checkAdminAuth(request, adminToken)) {
          return jsonResponse({ message: "未授权操作" }, 401);
        }

        const { key } = await request.json();
        if (!key) return jsonResponse({ message: "Key 不能为空" }, 400);

        const license = await env.DB.prepare(
          "SELECT is_active FROM licenses WHERE key = ?"
        ).bind(key).first();

        if (!license) return jsonResponse({ message: "激活码不存在" }, 404);

        const newStatus = license.is_active === 1 ? 0 : 1;
        await env.DB.prepare(
          "UPDATE licenses SET is_active = ? WHERE key = ?"
        ).bind(newStatus, key).run();

        return jsonResponse({ success: true, is_active: newStatus });
      }

      // API Route: POST /api/admin/delete-device
      if (url.pathname === "/api/admin/delete-device" && request.method === "POST") {
        if (!checkAdminAuth(request, adminToken)) {
          return jsonResponse({ message: "未授权操作" }, 401);
        }

        const { key, machine_uuid } = await request.json();
        if (!key || !machine_uuid) return jsonResponse({ message: "参数缺失" }, 400);

        await env.DB.prepare(
          "DELETE FROM devices WHERE key = ? AND machine_uuid = ?"
        ).bind(key, machine_uuid).run();

        return jsonResponse({ success: true });
      }

      // API Route: POST /api/admin/delete-license
      if (url.pathname === "/api/admin/delete-license" && request.method === "POST") {
        if (!checkAdminAuth(request, adminToken)) {
          return jsonResponse({ message: "未授权操作" }, 401);
        }

        const { key } = await request.json();
        if (!key) return jsonResponse({ message: "Key 不能为空" }, 400);

        // Delete bound devices first, then delete key
        await env.DB.prepare("DELETE FROM devices WHERE key = ?").bind(key).run();
        await env.DB.prepare("DELETE FROM licenses WHERE key = ?").bind(key).run();

        return jsonResponse({ success: true });
      }

      // 404 Route
      return jsonResponse({ message: "Resource not found" }, 404);

    } catch (error) {
      console.error("Server Error:", error);
      return jsonResponse({ message: "内部服务器错误", error: error.message }, 500);
    }
  }
};
