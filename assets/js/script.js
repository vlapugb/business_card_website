const storageKeys = {
  user: "vc_user",
  comments: "vc_comments",
};

// Настройки OAuth: вставьте свои client_id
const OAUTH_CONFIG = {
  githubClientId: "Ov23licLGRGeChpkP29C",
  // Для GitHub device flow client_secret не обязателен, но GitHub может его требовать для некоторых приложений.
  // Если авторизация не проходит, создайте secret в настройках OAuth App и вставьте сюда.
  githubClientSecret: "REPLACE_WITH_GITHUB_CLIENT_SECRET",
  vkClientId: "REPLACE_WITH_VK_CLIENT_ID",
  // Фиксируем redirect на путь GitHub Pages, чтобы совпадало с настройкой OAuth App.
  redirectUri: "https://vlapugb.github.io/business_card_website/",
};

const demoProfiles = {
  github: {
    name: "vlapugb",
    handle: "@github/vlapugb",
    link: "https://github.com/vlapugb",
    accent: "#6bb8ff",
  },
  vk: {
    name: "bystepgoing",
    handle: "@vk/bystepgoing",
    link: "https://vk.com/bystepgoing",
    accent: "#4fe4ad",
  },
};

const state = {
  user: loadUser(),
  comments: loadComments(),
};

document.addEventListener("DOMContentLoaded", () => {
  handleVkRedirect();
  bindAuthButtons();
  renderAuthStatus();
  renderComments();
  bindCommentForm();
});

function bindAuthButtons() {
  document.querySelectorAll("[data-auth]").forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.auth;
      if (mode === "github-device") {
        startGitHubDeviceFlow();
      } else if (mode === "vk-implicit") {
        startVkImplicitFlow();
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
    return;
  }

  setAuthNote("GitHub: запрашиваем код авторизации…");
  try {
    const deviceData = await requestGitHubDeviceCode();
    setAuthNote(`GitHub: введите код ${deviceData.user_code} на ${deviceData.verification_uri}`, false, deviceData.user_code);
    window.open(deviceData.verification_uri, "_blank");
    pollGitHubToken(deviceData);
  } catch (error) {
    console.error(error);
    setAuthNote("Не удалось начать GitHub OAuth. Проверьте client_id и попробуйте снова.", true);
  }
}

async function requestGitHubDeviceCode() {
  const res = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: OAUTH_CONFIG.githubClientId,
      ...(OAUTH_CONFIG.githubClientSecret && !OAUTH_CONFIG.githubClientSecret.startsWith("REPLACE")
        ? { client_secret: OAUTH_CONFIG.githubClientSecret }
        : {}),
      scope: "read:user",
    }),
  });
  if (!res.ok) throw new Error("Failed to request device code");
  return res.json();
}

async function pollGitHubToken(deviceData) {
  const intervalMs = Math.max(5, deviceData.interval || 5) * 1000;
  const deadline = Date.now() + (deviceData.expires_in || 900) * 1000;

  const attempt = async (currentInterval) => {
    if (Date.now() > deadline) {
      setAuthNote("GitHub: код устарел, запустите авторизацию заново.", true);
      return;
    }

    let tokenResponse;
    try {
      tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: OAUTH_CONFIG.githubClientId,
        device_code: deviceData.device_code,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        ...(OAUTH_CONFIG.githubClientSecret && !OAUTH_CONFIG.githubClientSecret.startsWith("REPLACE")
          ? { client_secret: OAUTH_CONFIG.githubClientSecret }
          : {}),
      }),
    });
    } catch (err) {
      setAuthNote("GitHub: ошибка сети, пробуем снова…");
      return setTimeout(() => attempt(currentInterval), currentInterval);
    }

    const data = await tokenResponse.json();

    if (data.error === "authorization_pending") {
      return setTimeout(() => attempt(currentInterval), currentInterval);
    }
    if (data.error === "slow_down") {
      return setTimeout(() => attempt(currentInterval + 5000), currentInterval + 5000);
    }
    if (data.error === "access_denied" || data.error === "expired_token") {
      setAuthNote("GitHub: авторизация отменена или истекла.", true);
      return;
    }
    if (data.error) {
      const reason = data.error_description || data.error;
      setAuthNote(`GitHub: ошибка авторизации (${reason}).`, true);
      return;
    }

    if (data.access_token) {
      await saveGitHubUser(data.access_token);
      setAuthNote("GitHub: авторизация успешна.");
      return;
    }

    setAuthNote("GitHub: неизвестная ошибка авторизации.", true);
  };

  setTimeout(() => attempt(intervalMs), intervalMs);
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

// ---------------- VK OAuth (Implicit Flow) ----------------
function startVkImplicitFlow() {
  if (!OAUTH_CONFIG.vkClientId || OAUTH_CONFIG.vkClientId.startsWith("REPLACE")) {
    setAuthNote("Укажите VK client_id в OAUTH_CONFIG.vkClientId.", true);
    return;
  }

  const url = new URL("https://oauth.vk.com/authorize");
  url.searchParams.set("client_id", OAUTH_CONFIG.vkClientId);
  url.searchParams.set("display", "page");
  url.searchParams.set("redirect_uri", OAUTH_CONFIG.redirectUri);
  url.searchParams.set("scope", "offline");
  url.searchParams.set("response_type", "token");
  url.searchParams.set("v", "5.131");
  window.location.href = url.toString();
}

async function handleVkRedirect() {
  if (!window.location.hash.includes("access_token")) return;

  const params = new URLSearchParams(window.location.hash.slice(1));
  const token = params.get("access_token");
  const userId = params.get("user_id");
  if (!token || !userId) return;

  try {
    const user = await fetchVkUser(token, userId);
    persistUser(user);
    setAuthNote("VK: авторизация успешна.");
  } catch (err) {
    console.error(err);
    setAuthNote("Не удалось получить данные VK.", true);
  } finally {
    history.replaceState(null, document.title, window.location.pathname + window.location.search);
  }
}

async function fetchVkUser(token, userId) {
  const url = new URL("https://api.vk.com/method/users.get");
  url.searchParams.set("user_ids", userId);
  url.searchParams.set("fields", "photo_100");
  url.searchParams.set("access_token", token);
  url.searchParams.set("v", "5.131");

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("VK request failed");
  const data = await res.json();
  if (data.error || !data.response || !data.response.length) {
    throw new Error("VK returned error");
  }
  const profile = data.response[0];
  return {
    name: `${profile.first_name} ${profile.last_name}`.trim(),
    provider: "vk-oauth",
    handle: `id${profile.id}`,
    link: `https://vk.com/id${profile.id}`,
    accent: "#4fe4ad",
    avatar: profile.photo_100,
    token,
  };
}

// ---------------- Demo (fallback) ----------------
function handleDemoLogin() {
  const name = prompt("Демо-вход: укажите имя", "Гость");
  if (!name) return;
  const profile = demoProfiles.github;
  const user = {
    name: name.trim(),
    provider: "demo",
    handle: profile.handle,
    link: profile.link,
    accent: profile.accent,
  };
  persistUser(user);
  setAuthNote("Демо-вход активирован (локально).");
}

// ---------------- UI helpers ----------------
function persistUser(user) {
  state.user = user;
  localStorage.setItem(storageKeys.user, JSON.stringify(user));
  renderAuthStatus();
  renderFormState();
}

function handleLogout() {
  state.user = null;
  localStorage.removeItem(storageKeys.user);
  setAuthNote("Вы вышли.");
  renderAuthStatus();
  renderFormState();
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

function setAuthNote(text, alert = false, code = "") {
  const el = document.getElementById("authNote");
  if (!el) return;
  el.textContent = code ? `${text} (код: ${code})` : text;
  el.className = alert ? "auth__note auth__note--alert" : "auth__note";
}

// ---------------- Comments ----------------
function bindCommentForm() {
  const form = document.getElementById("commentForm");
  if (!form) return;

  renderFormState();

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!state.user) {
      alert("Сначала войдите через GitHub или VK.");
      return;
    }

    const textarea = document.getElementById("commentInput");
    const message = textarea.value.trim();
    if (!message) return;

    const newComment = {
      id: Date.now(),
      message,
      user: state.user,
      createdAt: new Date().toISOString(),
    };

    state.comments.unshift(newComment);
    localStorage.setItem(storageKeys.comments, JSON.stringify(state.comments));
    textarea.value = "";
    renderComments();
  });
}

function renderFormState() {
  const textarea = document.getElementById("commentInput");
  const submit = document.querySelector("#commentForm button[type='submit']");
  if (!textarea || !submit) return;

  const disabled = !state.user;
  textarea.disabled = disabled;
  submit.disabled = disabled;
  textarea.placeholder = disabled
    ? "Чтобы оставить комментарий, авторизуйтесь через соц. сеть выше."
    : "Что думаете о проектах или опыте?";
}

function renderComments() {
  const list = document.getElementById("commentList");
  if (!list) return;

  list.innerHTML = "";

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
    case "vk-oauth":
      return "VK OAuth";
    case "demo":
      return "Demo";
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

function loadUser() {
  try {
    const raw = localStorage.getItem(storageKeys.user);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn("Не удалось загрузить пользователя", e);
    return null;
  }
}

function loadComments() {
  try {
    const raw = localStorage.getItem(storageKeys.comments);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.warn("Не удалось загрузить комментарии", e);
    return [];
  }
}
