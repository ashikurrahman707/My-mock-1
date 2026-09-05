// ============================================================
// My-Mock — shared nav + footer, injected into every page
// ============================================================

function renderNav(active) {
  const user = window.MyMock.Auth.currentUser();
  const link = (href, label, key) =>
    `<a href="${href}" class="px-3 py-2 rounded-lg text-sm font-medium ${active === key ? "bg-indigo-50 text-indigo-700" : "text-gray-600 hover:text-indigo-700"}">${label}</a>`;

  const rightSide = user
    ? `<a href="dashboard.html" class="px-3 py-2 text-sm font-medium text-gray-600 hover:text-indigo-700">Dashboard</a>
       <button id="nav-logout" class="ml-2 px-4 py-2 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200">Log out</button>`
    : `<a href="login.html" class="px-3 py-2 text-sm font-medium text-gray-600 hover:text-indigo-700">Login</a>
       <a href="signup.html" class="ml-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700">Sign Up</a>`;

  document.getElementById("site-nav").innerHTML = `
    <div class="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
      <a href="index.html" class="flex items-center">
        <img src="assets/logo.png" class="h-10 w-auto" alt="My-Mock — IELTS Speaking Practice" />
      </a>
      <nav class="hidden md:flex items-center gap-1">
        ${link("index.html", "Home", "home")}
        ${link("dashboard.html#practice", "Practice", "practice")}
        ${link("dashboard.html#mock", "Mock Test", "mock")}
        ${link("index.html#features", "Features", "features")}
      </nav>
      <div class="flex items-center">${rightSide}</div>
    </div>
  `;

  document.getElementById("nav-logout")?.addEventListener("click", () => {
    window.MyMock.Auth.logout();
    window.location.href = "index.html";
  });
}

function renderFooter() {
  const el = document.getElementById("site-footer");
  if (!el) return;
  el.innerHTML = `
    <div class="max-w-6xl mx-auto px-4 py-10 grid grid-cols-1 md:grid-cols-3 gap-8">
      <div>
        <div class="mb-3">
          <img src="assets/logo.png" class="h-12 w-auto" alt="My-Mock — IELTS Speaking Practice" />
        </div>
        <p class="text-sm text-gray-400">Practice IELTS Speaking with instant, structured feedback — Part 1, Part 2, and Part 3, plus full mock tests.</p>
      </div>
      <div>
        <h4 class="text-white font-semibold mb-3">Contact</h4>
        <a href="https://wa.me/8801642685001" target="_blank" rel="noopener"
           class="inline-flex items-center gap-2 text-sm text-green-400 hover:text-green-300 mb-2">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.6 6.3A8.9 8.9 0 0 0 12 4a8.9 8.9 0 0 0-7.7 13.4L3 21l3.7-1.2A8.9 8.9 0 0 0 12 21a8.9 8.9 0 0 0 8.9-9c0-2.4-.9-4.6-2.6-6.3zM12 19.3a7.3 7.3 0 0 1-3.7-1l-.3-.2-2.7.9.9-2.6-.2-.3A7.3 7.3 0 1 1 19.3 12 7.3 7.3 0 0 1 12 19.3zm4-5.5c-.2-.1-1.3-.7-1.5-.7s-.4-.1-.5.1-.6.7-.7.9-.3.2-.5.1a6 6 0 0 1-1.8-1.1 6.6 6.6 0 0 1-1.2-1.5c-.1-.2 0-.4.1-.5l.4-.4c.1-.1.2-.3.2-.4a.5.5 0 0 0 0-.5c-.1-.1-.5-1.3-.7-1.7s-.4-.4-.5-.4h-.5a.9.9 0 0 0-.6.3 2.8 2.8 0 0 0-.9 2.1 4.9 4.9 0 0 0 1 2.6 11.2 11.2 0 0 0 4.3 3.8c.6.2 1 .4 1.4.5a3.4 3.4 0 0 0 1.5.1 2.5 2.5 0 0 0 1.6-1.1 2 2 0 0 0 .1-1.1c-.1-.1-.2-.2-.5-.3z"/></svg>
          WhatsApp: +880 1642685001
        </a>
        <a href="mailto:easyieltsforeveryone@gmail.com" class="block text-sm text-gray-400 hover:text-white">easyieltsforeveryone@gmail.com</a>
      </div>
      <div>
        <h4 class="text-white font-semibold mb-3">About</h4>
        <p class="text-sm text-gray-400">This is a free AI-style IELTS speaking practice tool. Scores are practice estimates only, not official IELTS results.</p>
      </div>
    </div>
    <div class="border-t border-gray-800 py-5 text-center text-sm text-gray-500">
      All credit by <span class="text-gray-300 font-medium">Ashikur Rahman</span> · My-Mock &copy; ${new Date().getFullYear()}
    </div>
  `;
}

window.MyMock = window.MyMock || {};
window.MyMock.renderNav = renderNav;
window.MyMock.renderFooter = renderFooter;
