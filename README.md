## Сайт-визитка

Статическая страница `index.html` с данными из резюме `pugovkin.pdf`. Внутри подключены GTM, Яндекс.Метрика, демо-вход через GitHub/VK и локальные комментарии.

### Как посмотреть локально
1. Откройте `index.html` в браузере напрямую, либо
2. Запустите локальный сервер: `python -m http.server 8000` и откройте `http://localhost:8000/`.

### Структура
- `index.html` — страница.
- `assets/css/styles.css` — стили.
- `assets/js/script.js` — логика демо-авторизации и комментариев (localStorage).
- `.github/workflows/deploy.yml` — автодеплой на GitHub Pages.
- `.nojekyll` — отключение Jekyll на Pages.

### Настройки метрик
- В `index.html` уже проставлен GTM контейнер `GTM-NND7T8GJ`; при необходимости замените на свой.
- Яндекс.Метрика подключена с ID `105796523`; при необходимости замените на свой.

### Социальный вход и комментарии
- Кнопки «Войти через GitHub/VK» включают форму комментариев. Авторизация демо-режима работает на клиенте и хранит данные в `localStorage` вашего браузера.
- Комментарии сохраняются локально, без сервера.

### Настройка реальной авторизации
- Укажите client_id в `assets/js/script.js` → `OAUTH_CONFIG.githubClientId` и `OAUTH_CONFIG.vkClientId`.
- GitHub OAuth (device flow):
  1. Создайте OAuth App на https://github.com/settings/developers → New OAuth App.
  2. Callback URL: `https://<username>.github.io/<repo>/` (корень страницы).
  3. Скопируйте `Client ID` в `OAUTH_CONFIG.githubClientId`. Device flow не требует client secret на фронте.
  4. На сайте жмите «GitHub (OAuth device flow)», откройте ссылку, введите выданный код, дождитесь авторизации.
- VK OAuth (implicit):
  1. Создайте Standalone-приложение VK.
  2. Redirect URI: `https://<username>.github.io/<repo>/`.
  3. Скопируйте `client_id` в `OAUTH_CONFIG.vkClientId`.
  4. На сайте жмите «VK (OAuth implicit)» → после логина вернёт на страницу и включит форму комментариев.
- Демо-вход оставлен как локальный fallback без серверной авторизации.

### Деплой на GitHub Pages (Actions)
- Файл `.github/workflows/deploy.yml` собирает (статический экспорт) и публикует корень репозитория на GitHub Pages при пуше в `main`.
- Включите Pages в настройках репозитория: Settings → Pages → Source: `GitHub Actions`.
- Закоммитьте изменения:  
  ```bash
  git add .
  git commit -m "Add business card page"
  git push origin main
  ```
- Откройте страницу по адресу `https://<username>.github.io/<repo>/`.

### Альтернативный деплой (без Actions)
- Создайте ветку `gh-pages`, положите туда содержимое репозитория и включите Pages со Source: `gh-pages`/`root`.
- Или используйте `git subtree push --prefix . origin gh-pages`.

### Контакты из резюме
- ФИО: Владимир Пуговкин
- GitHub: https://github.com/vlapugb
- Telegram: https://t.me/bystepgoing
- VK: https://vk.com/bystepgoing
- Телефон: +7 993-939-42-09
