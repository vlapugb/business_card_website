const storageKeys = {
  user: "vc_user",
  comments: "vc_comments",
};

const presetProfiles = {
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
  bindAuthButtons();
  renderAuthStatus();
  renderComments();
  bindCommentForm();
});

function bindAuthButtons() {
  document.querySelectorAll("[data-provider]").forEach((button) => {
    button.addEventListener("click", () => {
      const provider = button.dataset.provider;
      handleLogin(provider);
    });
  });
}

function handleLogin(provider) {
  const preset = presetProfiles[provider];
  if (!preset) return;

  const name = prompt(
    `Войти через ${provider.toUpperCase()}. Укажите отображаемое имя:`,
    preset.name
  );

  if (!name) return;

  state.user = {
    name: name.trim(),
    provider,
    handle: preset.handle,
    link: preset.link,
    accent: preset.accent,
  };

  localStorage.setItem(storageKeys.user, JSON.stringify(state.user));
  renderAuthStatus();
  renderFormState();
}

function handleLogout() {
  state.user = null;
  localStorage.removeItem(storageKeys.user);
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
    p.textContent = "Вы пока не авторизованы. Выберите соц. сеть, чтобы включить комментарии.";
    container.appendChild(p);
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "comment__meta";

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.style.background = `linear-gradient(135deg, ${state.user.accent}, #62f4a6)`;
  avatar.textContent = state.user.name.charAt(0).toUpperCase();

  const info = document.createElement("div");
  const nameEl = document.createElement("p");
  nameEl.style.margin = "0";
  nameEl.textContent = state.user.name;
  const handleEl = document.createElement("p");
  handleEl.className = "comment__provider";
  handleEl.textContent = `${providerLabel(state.user.provider)} · ${state.user.handle}`;

  info.appendChild(nameEl);
  info.appendChild(handleEl);

  const logout = document.createElement("button");
  logout.className = "button button--ghost";
  logout.textContent = "Выйти";
  logout.addEventListener("click", handleLogout);

  wrapper.append(avatar, info, logout);
  container.appendChild(wrapper);
}

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

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.style.background = `linear-gradient(135deg, ${comment.user.accent}, #6bb8ff)`;
    avatar.textContent = comment.user.name.charAt(0).toUpperCase();

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
    case "github":
      return "GitHub";
    case "vk":
      return "VK";
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
