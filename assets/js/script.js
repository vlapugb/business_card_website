const storageKeys = {
  user: "vc_user",
};

// Настройки OAuth: вставьте свои client_id
const OAUTH_CONFIG = {
  githubClientId: "Ov23licLGRGeChpkP29C",
  // GitHub secret в фронт не кладём; device flow работает только с client_id.
  githubClientSecret: "",
  googleClientId: "815683495320-jipk985qjf1q5sg0aqosrpk4lgo24gna.apps.googleusercontent.com",
  yandexClientId: "4910aed257e9419f98d24ff02b73c143",
  // Redirect ведёт на страницу авторизации (auth.html), домен должен совпадать с настройками OAuth App.
  redirectUri: "https://vlapugb.github.io/business_card_website/auth.html",
};
const APP_HOME = "https://vlapugb.github.io/business_card_website/";

// GitHub login/oauth endpoints не отдают CORS. Используем публичный CORS-прокси для фронтенд-доступа.
// Для продакшена лучше поднять свой прокси/серверлесс и спрятать secret там.
const GITHUB_PROXIES = [
  "https://cors.isomorphic-git.org/",
  "https://corsproxy.io/?",
];

// Глобальное хранилище комментариев (Supabase REST API).
const SUPABASE_CONFIG = {
  url: "https://axexawnoagsuknsquxfj.supabase.co",
  anonKey: "sb_publishable_iC1Hejrn74QpxzFHT_Mrew_SzPqpq1g",
  table: "comments",
};

const demoProfiles = {
  github: {
    name: "vlapugb",
    handle: "@github/vlapugb",
    link: "https://github.com/vlapugb",
    accent: "#6bb8ff",
  },
  google: {
    name: "vlapugb",
    handle: "@google/vlapugb",
    link: "https://profiles.google.com/",
    accent: "#fbbc05",
  },
  yandex: {
    name: "vlapugb",
    handle: "@yandex/vlapugb",
    link: "https://passport.yandex.ru/",
    accent: "#ffcc00",
  },
};

const state = {
  user: loadUser(),
  comments: [],
};

const commentsState = {
  loading: false,
  error: "",
};

document.addEventListener("DOMContentLoaded", () => {
  handleGoogleRedirect();
  handleYandexRedirect();
  bindAuthButtons();
  renderAuthStatus();
  renderTopAuthButton();
  fetchAndRenderComments();
  bindCommentForm();
});

function bindAuthButtons() {
  document.querySelectorAll("[data-auth]").forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.auth;
      if (mode === "github-device") {
        startGitHubDeviceFlow();
      } else if (mode === "google-implicit") {
        startGoogleImplicitFlow();
      } else if (mode === "yandex-implicit") {
        startYandexImplicitFlow();
      } else if (mode === "demo") {
        handleDemoLogin();
      }
    });
  });
}

// ---------------- GitHub OAuth (Device Flow) ----------------
async function startGitHubDeviceFlow() {
  if (!OAUTH_CONFIG.githubClientId || OAUTH_CONFIG.githubClientId.startsWith("REPLACE")) {
    setAuthNote("Укажите GitHub client_id в OAUTH_CONFIG.githubClientId.", true);
    renderAuthCode("");
    return;
  }

    setAuthNote("GitHub: запрашиваем код авторизации…");
    renderAuthCode("");
    try {
      const deviceData = await requestGitHubDeviceCode();
      renderAuthCode(deviceData.user_code, deviceData.verification_uri);
      setAuthNote("GitHub: код скопирован, вставьте его на github.com/login/device и нажмите Continue.");
      window.open(deviceData.verification_uri, "_blank");
      pollGitHubToken(deviceData);
    } catch (error) {
      console.error(error);
      renderAuthCode("");
    const reason = error?.message
      ? `GitHub OAuth: ${error.message}`
      : "Не удалось начать GitHub OAuth. Проверьте client_id и попробуйте снова.";
    setAuthNote(reason, true);
  }
}

async function requestGitHubDeviceCode() {
  const payload = new URLSearchParams({
    client_id: OAUTH_CONFIG.githubClientId,
    ...(OAUTH_CONFIG.githubClientSecret && !OAUTH_CONFIG.githubClientSecret.startsWith("REPLACE")
      ? { client_secret: OAUTH_CONFIG.githubClientSecret }
      : {}),
    scope: "read:user",
  });
  const res = await fetchViaProxy("https://github.com/login/device/code", payload);
  if (!res || res.error) {
    const reason = res?.error_description || res?.error || "GitHub вернул пустой ответ на device flow.";
    throw new Error(reason);
  }
  return res;
}

async function pollGitHubToken(deviceData) {
  const intervalMs = Math.max(5, deviceData.interval || 5) * 1000;
  const deadline = Date.now() + (deviceData.expires_in || 900) * 1000;

  const attempt = async (currentInterval) => {
    if (Date.now() > deadline) {
      setAuthNote("GitHub: код устарел, запустите авторизацию заново.", true);
      renderAuthCode("");
      return;
    }

    let tokenData;
    try {
      tokenData = await fetchViaProxy("https://github.com/login/oauth/access_token", new URLSearchParams({
        client_id: OAUTH_CONFIG.githubClientId,
        device_code: deviceData.device_code,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        ...(OAUTH_CONFIG.githubClientSecret && !OAUTH_CONFIG.githubClientSecret.startsWith("REPLACE")
          ? { client_secret: OAUTH_CONFIG.githubClientSecret }
          : {}),
      }), true);
    } catch (err) {
      setAuthNote("GitHub: ошибка сети, пробуем снова…");
      return setTimeout(() => attempt(currentInterval), currentInterval);
    }

    const data = tokenData;

    if (data.error === "authorization_pending") {
      return setTimeout(() => attempt(currentInterval), currentInterval);
    }
    if (data.error === "slow_down") {
      return setTimeout(() => attempt(currentInterval + 5000), currentInterval + 5000);
    }
    if (data.error === "access_denied" || data.error === "expired_token") {
      setAuthNote("GitHub: авторизация отменена или истекла.", true);
      renderAuthCode("");
      return;
    }
    if (data.error) {
      const reason = data.error_description || data.error;
      setAuthNote(`GitHub: ошибка авторизации (${reason}).`, true);
      renderAuthCode("");
      return;
    }

    if (data.access_token) {
      await saveGitHubUser(data.access_token);
      setAuthNote("GitHub: авторизация успешна.");
      renderAuthCode("");
      redirectHomeAfterAuth();
      return;
    }

    setAuthNote("GitHub: неизвестная ошибка авторизации.", true);
    renderAuthCode("");
  };

  setTimeout(() => attempt(intervalMs), intervalMs);
}

async function fetchViaProxy(url, bodyParams, expectJson = true) {
  let lastError;
  for (const proxy of GITHUB_PROXIES) {
    const proxiedUrl = proxy.endsWith("?") ? `${proxy}${encodeURIComponent(url)}` : `${proxy}${url}`;
    try {
      const res = await fetch(proxiedUrl, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: bodyParams,
      });
      if (!res.ok) {
        lastError = new Error(`Proxy ${proxy} returned ${res.status}`);
        continue;
      }
      if (!expectJson) {
        return res;
      }
      return await parseOauthResponse(res);
    } catch (err) {
      lastError = err;
      continue;
    }
  }
  throw lastError || new Error("All proxies failed");
}

async function parseOauthResponse(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (jsonErr) {
    try {
      const params = new URLSearchParams(text);
      return Object.fromEntries(params.entries());
    } catch (parseErr) {
      throw jsonErr;
    }
  }
}

async function saveGitHubUser(accessToken) {
  const res = await fetch("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) throw new Error("Failed to fetch GitHub user");
  const data = await res.json();

  const user = {
    name: data.name || data.login,
    provider: "github-oauth",
    handle: `@${data.login}`,
    link: data.html_url,
    accent: "#6bb8ff",
    avatar: data.avatar_url,
    token: accessToken,
  };
  persistUser(user);
}

// ---------------- Google OAuth (Implicit Flow) ----------------
function startGoogleImplicitFlow() {
  if (!OAUTH_CONFIG.googleClientId || OAUTH_CONFIG.googleClientId.startsWith("REPLACE")) {
    setAuthNote("Укажите Google client_id в OAUTH_CONFIG.googleClientId.", true);
    return;
  }

  renderAuthCode("");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", OAUTH_CONFIG.googleClientId);
  url.searchParams.set("redirect_uri", OAUTH_CONFIG.redirectUri);
  url.searchParams.set("response_type", "token");
  url.searchParams.set("scope", "profile email");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");
  window.location.href = url.toString();
}

async function handleGoogleRedirect() {
  if (!window.location.hash.includes("access_token")) return;

  const params = new URLSearchParams(window.location.hash.slice(1));
  const token = params.get("access_token");
  if (!token) return;

  try {
    renderAuthCode("");
    const user = await fetchGoogleUser(token);
    persistUser(user);
    setAuthNote("Google: авторизация успешна.");
    redirectHomeAfterAuth();
  } catch (err) {
    console.error(err);
    setAuthNote("Не удалось получить данные Google.", true);
  } finally {
    history.replaceState(null, document.title, window.location.pathname + window.location.search);
  }
}

async function fetchGoogleUser(token) {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) throw new Error("Google request failed");
  const data = await res.json();

  return {
    name: data.name || data.email || "Google User",
    provider: "google-oauth",
    handle: data.email ? data.email : data.id ? `id${data.id}` : "google-user",
    link: data.link || "https://myaccount.google.com/",
    accent: "#fbbc05",
    avatar: data.picture,
    token,
  };
}

// ---------------- Yandex OAuth (Implicit Flow) ----------------
function startYandexImplicitFlow() {
  if (!OAUTH_CONFIG.yandexClientId || OAUTH_CONFIG.yandexClientId.startsWith("REPLACE")) {
    setAuthNote("Укажите Yandex client_id в OAUTH_CONFIG.yandexClientId.", true);
    return;
  }

  renderAuthCode("");
  const url = new URL("https://oauth.yandex.ru/authorize");
  url.searchParams.set("client_id", OAUTH_CONFIG.yandexClientId);
  url.searchParams.set("redirect_uri", OAUTH_CONFIG.redirectUri);
  url.searchParams.set("response_type", "token");
  url.searchParams.set("scope", "login:info login:email");
  url.searchParams.set("force_confirm", "yes");
  window.location.href = url.toString();
}

async function handleYandexRedirect() {
  if (!window.location.hash.includes("access_token")) return;

  const params = new URLSearchParams(window.location.hash.slice(1));
  const token = params.get("access_token");
  if (!token) return;

  try {
    renderAuthCode("");
    const user = await fetchYandexUser(token);
    persistUser(user);
    setAuthNote("Yandex: авторизация успешна.");
    redirectHomeAfterAuth();
  } catch (err) {
    console.error(err);
    setAuthNote("Не удалось получить данные Yandex.", true);
  } finally {
    history.replaceState(null, document.title, window.location.pathname + window.location.search);
  }
}

async function fetchYandexUser(token) {
  const res = await fetch("https://login.yandex.ru/info?format=json", {
    headers: {
      Authorization: `OAuth ${token}`,
    },
  });
  if (!res.ok) throw new Error("Yandex request failed");
  const data = await res.json();

  return {
    name: data.real_name || data.display_name || data.login || "Yandex User",
    provider: "yandex-oauth",
    handle: data.default_email ? data.default_email : data.id ? `id${data.id}` : data.login || "yandex-user",
    link: "https://passport.yandex.ru",
    accent: "#ffcc00",
    avatar: data.is_avatar_empty ? null : data.default_avatar_id ? `https://avatars.yandex.net/get-yapic/${data.default_avatar_id}/islands-200` : null,
    token,
  };
}

// ---------------- Demo (fallback) ----------------
function handleDemoLogin() {
  const name = prompt("Демо-вход: укажите имя", "Гость");
  if (!name) return;
  const profile = demoProfiles.google;
  const user = {
    name: name.trim(),
    provider: "demo",
    handle: profile.handle,
    link: profile.link,
    accent: profile.accent,
  };
  persistUser(user);
  renderAuthCode("");
  setAuthNote("Демо-вход активирован (локально).");
}

// ---------------- UI helpers ----------------
function persistUser(user) {
  state.user = user;
  localStorage.setItem(storageKeys.user, JSON.stringify(user));
  renderAuthStatus();
  renderFormState();
  renderTopAuthButton();
  if (document.getElementById("commentList")) {
    fetchAndRenderComments();
  }
}

function handleLogout() {
  state.user = null;
  localStorage.removeItem(storageKeys.user);
  setAuthNote("Вы вышли.");
  renderAuthCode("");
  renderAuthStatus();
  renderFormState();
  renderTopAuthButton();
}

function renderAuthStatus() {
  const container = document.getElementById("authStatus");
  if (!container) return;
  container.innerHTML = "";

  if (!state.user) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "Вы пока не авторизованы.";
    container.appendChild(p);
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "comment__meta";

  const avatar = state.user.avatar
    ? Object.assign(document.createElement("img"), { src: state.user.avatar, alt: state.user.name })
    : document.createElement("div");
  avatar.className = state.user.avatar ? "avatar avatar--img" : "avatar";
  if (!state.user.avatar) {
    avatar.style.background = `linear-gradient(135deg, ${state.user.accent}, #62f4a6)`;
    avatar.textContent = state.user.name.charAt(0).toUpperCase();
  }

  const info = document.createElement("div");
  const nameEl = document.createElement("p");
  nameEl.style.margin = "0";
  nameEl.textContent = state.user.name;
  const handleEl = document.createElement("p");
  handleEl.className = "comment__provider";
  handleEl.textContent = `${providerLabel(state.user.provider)} · ${state.user.handle}`;

  info.append(nameEl, handleEl);

  const logout = document.createElement("button");
  logout.className = "button button--ghost";
  logout.textContent = "Выйти";
  logout.addEventListener("click", handleLogout);

  wrapper.append(avatar, info, logout);
  container.appendChild(wrapper);
}

function setAuthNote(text, alert = false) {
  const el = document.getElementById("authNote");
  if (!el) return;
  el.textContent = text;
  el.className = alert ? "auth__note auth__note--alert" : "auth__note";
}

function renderTopAuthButton() {
  const btn = document.getElementById("authTopButton");
  if (!btn) return;
  if (state.user) {
    btn.textContent = "Logout";
    btn.onclick = () => handleLogout();
  } else {
    btn.textContent = "Авторизация";
    btn.onclick = () => (window.location.href = OAUTH_CONFIG.redirectUri);
  }
}

function renderAuthCode(code = "", verificationUri = "https://github.com/login/device") {
  const notice = document.getElementById("authCodeNotice");
  const textEl = document.getElementById("authCodeText");
  const btn = document.getElementById("authCodeButton");
  if (!notice || !textEl || !btn) return;

  if (!code) {
    notice.hidden = true;
    return;
  }

  notice.hidden = false;
  textEl.textContent = "Код сгенерирован и скопирован. Откройте страницу GitHub и нажмите Continue.";
  const targetUrl = verificationUri || "https://github.com/login/device";
  btn.onclick = () => window.open(targetUrl, "_blank");

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(code).catch(() => {});
  }
}

// ---------------- Comments ----------------
async function fetchAndRenderComments() {
  const list = document.getElementById("commentList");
  if (!list) return;

  commentsState.loading = true;
  commentsState.error = "";
  renderComments();

  if (!isSupabaseConfigured()) {
    commentsState.loading = false;
    commentsState.error = "Укажите Supabase URL и anon key, чтобы включить глобальные комментарии.";
    renderComments();
    renderFormState();
    return;
  }

  try {
    const headers = supabaseHeaders();
    const res = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/${SUPABASE_CONFIG.table}?select=*&order=created_at.desc`, {
      headers,
    });
    if (!res.ok) {
      throw new Error("Не удалось загрузить комментарии.");
    }
    const data = await res.json();
    state.comments = data.map(mapSupabaseComment);
  } catch (err) {
    console.error(err);
    commentsState.error = err?.message || "Не удалось загрузить комментарии.";
  } finally {
    commentsState.loading = false;
    renderComments();
    renderFormState();
  }
}

function bindCommentForm() {
  const form = document.getElementById("commentForm");
  if (!form) return;

  renderFormState();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const textarea = document.getElementById("commentInput");
    const message = textarea.value.trim();
    if (!message) return;
    if (!state.user) {
      alert("Авторизуйтесь, чтобы оставить комментарий.");
      return;
    }
    if (!isSupabaseConfigured()) {
      alert("Supabase не настроен. Укажите url и anon key в assets/js/script.js.");
      return;
    }

    const submit = form.querySelector("button[type='submit']");
    textarea.disabled = true;
    submit.disabled = true;

    try {
      await postSupabaseComment(message);
      textarea.value = "";
      await fetchAndRenderComments();
    } catch (err) {
      console.error(err);
      alert(err?.message || "Не удалось отправить комментарий.");
    } finally {
      textarea.disabled = false;
      submit.disabled = false;
      renderFormState();
    }
  });
}

function renderFormState() {
  const textarea = document.getElementById("commentInput");
  const submit = document.querySelector("#commentForm button[type='submit']");
  const hint = document.getElementById("commentsHint");
  if (!textarea || !submit) return;

  const hasUser = Boolean(state.user);
  const disabled = !hasUser || commentsState.loading || !isSupabaseConfigured();
  textarea.disabled = disabled;
  submit.disabled = disabled;

  if (!hasUser) {
    textarea.placeholder = "Авторизуйтесь через GitHub/Google/Yandex, чтобы оставить комментарий.";
    if (hint) hint.textContent = "Любая авторизация — комментарий уйдёт в общее хранилище (Supabase).";
    return;
  }

  if (!isSupabaseConfigured()) {
    textarea.placeholder = "Supabase не настроен: укажите url и anon key.";
    if (hint) hint.textContent = "Укажите Supabase URL и anon key в assets/js/script.js → SUPABASE_CONFIG.";
    return;
  }

  if (commentsState.loading) {
    textarea.placeholder = "Загружаем поток комментариев…";
  } else {
    textarea.placeholder = "Что думаете о проектах или опыте?";
  }
}

function renderComments() {
  const list = document.getElementById("commentList");
  if (!list) return;

  list.innerHTML = "";

  if (commentsState.loading) {
    const loading = document.createElement("p");
    loading.className = "muted";
    loading.textContent = "Загружаем комментарии…";
    list.appendChild(loading);
    return;
  }

  if (commentsState.error) {
    const errorEl = document.createElement("p");
    errorEl.className = "muted";
    errorEl.textContent = commentsState.error;
    list.appendChild(errorEl);
    if (!state.comments.length) {
      return;
    }
  }

  if (!state.comments.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Пока нет комментариев — оставьте первый.";
    list.appendChild(empty);
    return;
  }

  state.comments.forEach((comment) => {
    const item = document.createElement("div");
    item.className = "comment__item";

    const meta = document.createElement("div");
    meta.className = "comment__meta";

    const avatar = comment.user.avatar
      ? Object.assign(document.createElement("img"), { src: comment.user.avatar, alt: comment.user.name })
      : document.createElement("div");
    avatar.className = comment.user.avatar ? "avatar avatar--img" : "avatar";
    if (!comment.user.avatar) {
      avatar.style.background = `linear-gradient(135deg, ${comment.user.accent}, #6bb8ff)`;
      avatar.textContent = comment.user.name.charAt(0).toUpperCase();
    }

    const info = document.createElement("div");
    const nameEl = document.createElement("p");
    nameEl.style.margin = "0";
    nameEl.textContent = comment.user.name;
    const providerEl = document.createElement("p");
    providerEl.className = "comment__provider";
    providerEl.textContent = `${providerLabel(comment.user.provider)} · ${timeAgo(comment.createdAt)}`;

    info.append(nameEl, providerEl);
    meta.append(avatar, info);
    const text = document.createElement("p");
    text.style.margin = "4px 0 0 0";
    text.textContent = comment.message;

    item.append(meta, text);
    list.appendChild(item);
  });
}

function providerLabel(provider) {
  switch (provider) {
    case "github-oauth":
      return "GitHub OAuth";
    case "google-oauth":
      return "Google OAuth";
    case "yandex-oauth":
      return "Yandex OAuth";
    case "demo":
      return "Demo";
    case "github-issue":
      return "GitHub";
    default:
      return "Соц. сеть";
  }
}

function timeAgo(timestamp) {
  const now = new Date();
  const past = new Date(timestamp);
  const diff = Math.floor((now - past) / 1000);

  if (diff < 60) return "только что";
  const minutes = Math.floor(diff / 60);
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  return `${days} дн назад`;
}

async function postSupabaseComment(message) {
  const headers = { ...supabaseHeaders(), "Content-Type": "application/json", Prefer: "return=representation" };
  const payload = {
    message,
    provider: state.user.provider,
    user_name: state.user.name,
    user_handle: state.user.handle || "",
    user_link: state.user.link || "",
    user_avatar: state.user.avatar || null,
    user_accent: state.user.accent || "#6bb8ff",
    created_at: new Date().toISOString(),
  };
  const res = await fetch(`${SUPABASE_CONFIG.url}/rest/v1/${SUPABASE_CONFIG.table}`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error("Не удалось отправить комментарий (Supabase). Проверьте ключ и URL.");
  }
  const data = await res.json();
  if (Array.isArray(data) && data.length) {
    return mapSupabaseComment(data[0]);
  }
  return null;
}

function mapSupabaseComment(row) {
  return {
    id: row.id || row.created_at,
    message: row.message,
    user: {
      name: row.user_name,
      provider: row.provider,
      handle: row.user_handle,
      link: row.user_link,
      accent: row.user_accent || "#6bb8ff",
      avatar: row.user_avatar,
    },
    createdAt: row.created_at,
  };
}

function supabaseHeaders() {
  if (!isSupabaseConfigured()) {
    throw new Error("Укажите Supabase URL и anon key в SUPABASE_CONFIG.");
  }
  return {
    apikey: SUPABASE_CONFIG.anonKey,
    Authorization: `Bearer ${SUPABASE_CONFIG.anonKey}`,
  };
}

function isSupabaseConfigured() {
  return Boolean(
    SUPABASE_CONFIG.url &&
      SUPABASE_CONFIG.anonKey &&
      !SUPABASE_CONFIG.url.includes("REPLACE") &&
      !SUPABASE_CONFIG.anonKey.startsWith("REPLACE")
  );
}

function redirectHomeAfterAuth() {
  setTimeout(() => {
    window.location.href = APP_HOME;
  }, 800);
}

function loadUser() {
  try {
    const raw = localStorage.getItem(storageKeys.user);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn("Не удалось загрузить пользователя", e);
    return null;
  }
}
