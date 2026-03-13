(function () {
  'use strict';

  const SUPABASE_URL = 'https://uwxehtozkpwlasagvaja.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_DYxPO-Br6aOq2BELrHRs1g_lz1zMG53';
  const TABLE_NAME = 'banxuexing_storage';
  const RECORD_ID = 'global';

  const INITIAL_SYNC_TIMEOUT_MS = 4500;
  const SYNC_DEBOUNCE_MS = 800;

  const localStorageRef = window.localStorage;
  const storageProto = Object.getPrototypeOf(localStorageRef);

  const nativeGetItem = storageProto.getItem;
  const nativeSetItem = storageProto.setItem;
  const nativeRemoveItem = storageProto.removeItem;
  const nativeClear = storageProto.clear;
  const nativeKey = storageProto.key;

  let storageCache = readNativeSnapshot();
  let supabaseClient = null;
  let cloudReady = false;
  let cloudDisabled = false;
  let applyingRemote = false;
  let pushTimer = null;
  let pushPromise = null;
  let importModalObserver = null;

  function logWarn(message, error) {
    if (error) {
      console.warn('[banxuexing-supabase]', message, error);
      return;
    }
    console.warn('[banxuexing-supabase]', message);
  }

  function readNativeSnapshot() {
    const snapshot = {};
    for (let i = 0; i < localStorageRef.length; i += 1) {
      const key = nativeKey.call(localStorageRef, i);
      if (key === null) {
        continue;
      }
      const value = nativeGetItem.call(localStorageRef, key);
      if (value !== null) {
        snapshot[key] = String(value);
      }
    }
    return snapshot;
  }

  function normalizeSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      return {};
    }

    const normalized = {};
    Object.keys(snapshot).forEach(function (key) {
      const rawValue = snapshot[key];
      if (rawValue === null || rawValue === undefined) {
        return;
      }
      normalized[String(key)] = String(rawValue);
    });

    return normalized;
  }

  function applySnapshotToNative(snapshot) {
    nativeClear.call(localStorageRef);

    Object.keys(snapshot).forEach(function (key) {
      nativeSetItem.call(localStorageRef, key, snapshot[key]);
    });
  }

  function queueCloudPush(reason) {
    if (!cloudReady || cloudDisabled || !supabaseClient || applyingRemote) {
      return;
    }

    if (pushTimer) {
      window.clearTimeout(pushTimer);
    }

    pushTimer = window.setTimeout(function () {
      pushTimer = null;
      pushSnapshot(reason);
    }, SYNC_DEBOUNCE_MS);
  }

  async function pushSnapshot(reason) {
    if (!cloudReady || cloudDisabled || !supabaseClient) {
      return;
    }

    if (pushPromise) {
      return pushPromise;
    }

    const payload = {
      id: RECORD_ID,
      storage: storageCache,
      updated_at: new Date().toISOString()
    };

    pushPromise = supabaseClient
      .from(TABLE_NAME)
      .upsert(payload, { onConflict: 'id' })
      .then(function (result) {
        if (result.error) {
          throw result.error;
        }
      })
      .catch(function (error) {
        logWarn('云端写入失败（已保留本地数据）', error);
      })
      .finally(function () {
        pushPromise = null;
      });

    return pushPromise;
  }

  function withTimeout(promise, timeoutMs) {
    return new Promise(function (resolve, reject) {
      let settled = false;

      const timeoutId = window.setTimeout(function () {
        if (settled) {
          return;
        }
        settled = true;
        reject(new Error('云端初始化超时'));
      }, timeoutMs);

      promise
        .then(function (value) {
          if (settled) {
            return;
          }
          settled = true;
          window.clearTimeout(timeoutId);
          resolve(value);
        })
        .catch(function (error) {
          if (settled) {
            return;
          }
          settled = true;
          window.clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  async function fetchRemoteSnapshot() {
    const result = await supabaseClient
      .from(TABLE_NAME)
      .select('storage, updated_at')
      .eq('id', RECORD_ID)
      .maybeSingle();

    if (result.error) {
      throw result.error;
    }

    return result.data;
  }

  function patchLocalStorage() {
    storageProto.getItem = function (key) {
      if (this !== localStorageRef) {
        return nativeGetItem.call(this, key);
      }

      const normalizedKey = String(key);
      if (Object.prototype.hasOwnProperty.call(storageCache, normalizedKey)) {
        return storageCache[normalizedKey];
      }

      const fallback = nativeGetItem.call(localStorageRef, normalizedKey);
      if (fallback !== null) {
        storageCache[normalizedKey] = String(fallback);
      }
      return fallback;
    };

    storageProto.setItem = function (key, value) {
      if (this !== localStorageRef) {
        nativeSetItem.call(this, key, value);
        return;
      }

      const normalizedKey = String(key);
      const normalizedValue = String(value);

      storageCache[normalizedKey] = normalizedValue;
      nativeSetItem.call(localStorageRef, normalizedKey, normalizedValue);
      queueCloudPush('setItem:' + normalizedKey);
    };

    storageProto.removeItem = function (key) {
      if (this !== localStorageRef) {
        nativeRemoveItem.call(this, key);
        return;
      }

      const normalizedKey = String(key);
      delete storageCache[normalizedKey];
      nativeRemoveItem.call(localStorageRef, normalizedKey);
      queueCloudPush('removeItem:' + normalizedKey);
    };

    storageProto.clear = function () {
      if (this !== localStorageRef) {
        nativeClear.call(this);
        return;
      }

      storageCache = {};
      nativeClear.call(localStorageRef);
      queueCloudPush('clear');
    };

    storageProto.key = function (index) {
      return nativeKey.call(this, index);
    };
  }

  function showCloudSyncNotice() {
    const message = '数据已自动同步到云端，备份/导入功能已停用。';

    if (typeof window.showAlert === 'function') {
      window.showAlert('提示', message);
      return;
    }

    window.alert(message);
  }

  function hideBackupImportUi() {
    var exportBtn = document.getElementById('exportBtn');
    var importBtn = document.getElementById('importBtn');
    var congratsBackupBtn = document.getElementById('congratsBackupBtn');
    var importModal = document.getElementById('importConfirmModal');
    var backupTip = document.querySelector('#congratsModal .backup-tip');

    if (exportBtn) {
      exportBtn.style.display = 'none';
      exportBtn.setAttribute('aria-hidden', 'true');
    }

    if (importBtn) {
      importBtn.style.display = 'none';
      importBtn.setAttribute('aria-hidden', 'true');
    }

    if (congratsBackupBtn) {
      congratsBackupBtn.style.display = 'none';
      congratsBackupBtn.setAttribute('aria-hidden', 'true');
    }

    if (backupTip) {
      backupTip.textContent = '数据已自动同步到云端，无需手动备份。';
    }

    if (importModal) {
      importModal.style.display = 'none';
      importModal.setAttribute('aria-hidden', 'true');
      if (!importModalObserver) {
        importModalObserver = new MutationObserver(function () {
          importModal.style.display = 'none';
          importModal.setAttribute('aria-hidden', 'true');
        });
        importModalObserver.observe(importModal, {
          attributes: true,
          attributeFilter: ['style', 'class']
        });
      }
    }
  }

  function disableBackupImportFeatures() {
    document.addEventListener(
      'click',
      function (event) {
        var blocked = event.target.closest('#exportBtn, #importBtn, #congratsBackupBtn, #importConfirmBtn');
        if (!blocked) {
          return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();

        hideBackupImportUi();
        showCloudSyncNotice();
      },
      true
    );

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', hideBackupImportUi);
    } else {
      hideBackupImportUi();
    }

    const observer = new MutationObserver(function () {
      hideBackupImportUi();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function createSupabaseClient() {
    const supabaseFactory = window.supabase && window.supabase.createClient;
    if (typeof supabaseFactory !== 'function') {
      logWarn('未检测到 Supabase SDK，当前回退到本地存储模式。');
      return null;
    }

    return supabaseFactory(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });
  }

  async function initializeCloudStorage() {
    supabaseClient = createSupabaseClient();
    if (!supabaseClient) {
      cloudDisabled = true;
      return;
    }

    try {
      const remoteData = await withTimeout(fetchRemoteSnapshot(), INITIAL_SYNC_TIMEOUT_MS);

      if (remoteData && remoteData.storage) {
        const remoteSnapshot = normalizeSnapshot(remoteData.storage);

        applyingRemote = true;
        storageCache = remoteSnapshot;
        applySnapshotToNative(remoteSnapshot);
        applyingRemote = false;
      } else {
        cloudReady = true;
        await pushSnapshot('bootstrap-local-to-cloud');
      }

      cloudReady = true;
    } catch (error) {
      cloudDisabled = true;
      logWarn(
        '云端初始化失败，已回退到本地存储模式。请检查 Supabase 表是否已创建、RLS 策略是否放开。',
        error
      );
    }
  }

  patchLocalStorage();
  disableBackupImportFeatures();

  const readyPromise = initializeCloudStorage().finally(function () {
    if (pushTimer) {
      window.clearTimeout(pushTimer);
      pushTimer = null;
    }
  });

  window.__banxuexingStorageReady = readyPromise;

  window.addEventListener('beforeunload', function () {
    if (pushTimer) {
      window.clearTimeout(pushTimer);
      pushTimer = null;
      pushSnapshot('beforeunload');
    }
  });
})();
