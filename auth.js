import { register, login } from './api.js';

function showLogin() {
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('registerForm').style.display = 'none';
    document.getElementById('authMessage').innerText = '';
}

function showRegister() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'block';
    document.getElementById('authMessage').innerText = '';
}

async function registerUser() {
    const username = document.getElementById('regUsername').value.trim();
    const password = document.getElementById('regPassword').value.trim();
    if (!username || !password) { alert("Введите имя и пароль"); return; }
    const result = await register(username, password);
    if (result.success) {
        alert("Аккаунт создан! Войдите.");
        showLogin();
    } else {
        alert(result.error || "Ошибка");
    }
}

async function loginUser() {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    const result = await login(username, password);
    if (result.success) {
        sessionStorage.setItem('blockverse_session', JSON.stringify({ username: result.user.username }));
        window.location.href = 'index.html';
    } else {
        document.getElementById('authMessage').innerText = result.error || "Неверные данные";
    }
}

function guestLogin() {
    const guestName = "Guest_" + Math.floor(Math.random() * 10000);
    sessionStorage.setItem('blockverse_session', JSON.stringify({ username: guestName, isGuest: true }));
    window.location.href = 'index.html';
}

document.getElementById('showLoginBtn').onclick = showLogin;
document.getElementById('showRegisterBtn').onclick = showRegister;
document.getElementById('doLoginBtn').onclick = loginUser;
document.getElementById('doRegisterBtn').onclick = registerUser;
document.getElementById('guestLoginBtn').onclick = guestLogin;
document.getElementById('guestRegisterBtn').onclick = guestLogin;

// Если уже есть сессия, перенаправляем на главную
if (sessionStorage.getItem('blockverse_session')) {
    window.location.href = 'index.html';
}