MM2 SHOP — READY FOR PUBLICATION

В архиве:
- текущий дизайн магазина и товары;
- сервер Node.js;
- безопасная админка по адресу /admin (один вход);
- серверные заказы;
- PostgreSQL для постоянного хранения заказов на хостинге;
- локальный JSON fallback для тестов без базы;
- package.json и render.yaml для деплоя на Render.

ЛОКАЛЬНЫЙ ЗАПУСК:
1. Установить Node.js 20+.
2. Открыть PowerShell в папке сайта.
3. Выполнить:
   $env:ADMIN_PASSWORD="СЛОЖНЫЙ_ПАРОЛЬ"
   npm install
   npm start
4. Открыть http://localhost:3000
5. Админка: http://localhost:3000/admin

ПУБЛИКАЦИЯ:
1. Загрузить папку проекта в GitHub.
2. На Render создать Web Service из этого репозитория.
3. Build Command: npm install
4. Start Command: npm start
5. Добавить переменную ADMIN_PASSWORD со своим сложным паролем.
6. Добавить PostgreSQL и переменную DATABASE_URL.
7. После деплоя Render даст публичный адрес https://....onrender.com

ВАЖНО:
- Не публикуй ADMIN_PASSWORD в коде или GitHub.
- Для постоянных заказов на публичном сайте используй PostgreSQL (DATABASE_URL).
- Локальный JSON fallback предназначен для локального тестирования.
- Админ-сессии хранятся в памяти и после перезапуска сервера потребуется войти снова.
