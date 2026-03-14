(function () {
  'use strict';

  var STORAGE_KEY = 'banxuexing_auth_session';
  var LOGIN_PAGE = 'login.html';
  var HOME_PAGE = 'index.html';

  function normalizeUsers() {
    var users = window.BANXUEXING_AUTH_USERS;
    if (!Array.isArray(users)) {
      return [];
    }

    return users
      .filter(function (user) {
        return user && typeof user.username === 'string' && typeof user.password === 'string';
      })
      .map(function (user) {
        return {
          username: user.username,
          password: user.password,
          displayName: typeof user.displayName === 'string' && user.displayName.trim()
            ? user.displayName.trim()
            : user.username
        };
      });
  }

  function getSession() {
    try {
      var raw = window.sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function setSession(user) {
    var session = {
      username: user.username,
      displayName: user.displayName,
      loggedInAt: new Date().toISOString()
    };
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    return session;
  }

  function clearSession() {
    window.sessionStorage.removeItem(STORAGE_KEY);
  }

  function isAuthenticated() {
    var session = getSession();
    return !!(session && session.username);
  }

  function findUser(username, password) {
    return normalizeUsers().find(function (user) {
      return user.username === username && user.password === password;
    }) || null;
  }

  function currentPath() {
    var path = window.location.pathname || '';
    return path.split('/').pop() || HOME_PAGE;
  }

  function goToLogin() {
    var path = currentPath();
    var search = path && path !== LOGIN_PAGE ? '?redirect=' + encodeURIComponent(path) : '';
    window.location.replace(LOGIN_PAGE + search);
  }

  function goToHome() {
    var params = new URLSearchParams(window.location.search || '');
    var redirect = params.get('redirect');
    var target = redirect && redirect !== LOGIN_PAGE ? redirect : HOME_PAGE;
    window.location.replace(target);
  }

  function guardHome() {
    if (!isAuthenticated()) {
      goToLogin();
    }
  }

  function guardLogin() {
    if (isAuthenticated()) {
      goToHome();
    }
  }

  function ensureLogoutMenuItem() {
    var menu = document.getElementById('accountMenu');
    if (!menu || document.getElementById('logoutAuthBtn')) {
      return;
    }

    var divider = document.createElement('hr');
    divider.id = 'logoutAuthDivider';

    var item = document.createElement('li');
    item.id = 'logoutAuthBtn';
    item.className = 'danger';
    item.innerHTML = '<i class="fas fa-right-from-bracket"></i>退出登录';
    item.addEventListener('click', function () {
      clearSession();
      goToLogin();
    });

    menu.appendChild(divider);
    menu.appendChild(item);
  }

  function mountHomeAuthUi() {
    var menu = document.getElementById('accountMenu');
    if (!menu) {
      return;
    }

    ensureLogoutMenuItem();

    var observer = new MutationObserver(function () {
      ensureLogoutMenuItem();
    });

    observer.observe(menu, {
      childList: true,
      subtree: true
    });
  }

  function mountLoginForm() {
    var form = document.getElementById('loginForm');
    if (!form) {
      return;
    }

    var usernameEl = document.getElementById('loginUsername');
    var passwordEl = document.getElementById('loginPassword');
    var errorEl = document.getElementById('loginError');

    form.addEventListener('submit', function (event) {
      event.preventDefault();

      var username = usernameEl.value.trim();
      var password = passwordEl.value;
      var user = findUser(username, password);

      if (!user) {
        if (errorEl) {
          errorEl.textContent = '用户名或密码错误，请重新输入。';
          errorEl.style.display = 'block';
        }
        passwordEl.value = '';
        passwordEl.focus();
        return;
      }

      if (errorEl) {
        errorEl.textContent = '';
        errorEl.style.display = 'none';
      }

      setSession(user);
      goToHome();
    });
  }

  window.BanxuexingAuth = {
    clearSession: clearSession,
    getSession: getSession,
    guardHome: guardHome,
    guardLogin: guardLogin,
    isAuthenticated: isAuthenticated,
    mountHomeAuthUi: mountHomeAuthUi,
    mountLoginForm: mountLoginForm
  };
})();
