// ==UserScript==
// @name         Giphy GIF URL Copier
// @namespace    https://github.com/jjjjackson/tamper-monkey-scripts
// @version      2.1.3
// @description  進入 Giphy 頁面時自動複製 GIF img tag 到剪貼簿
// @author       jjjjackson
// @match        *://giphy.com/*
// @match        *://*.giphy.com/*
// @run-at       document-idle
// @grant        GM_setClipboard
// @updateURL    https://raw.githubusercontent.com/jjjjackson/tamper-monkey-scripts/main/giphy-gif-copier.user.js
// @downloadURL  https://raw.githubusercontent.com/jjjjackson/tamper-monkey-scripts/main/giphy-gif-copier.user.js
// @homepageURL  https://github.com/jjjjackson/tamper-monkey-scripts
// ==/UserScript==

(function() {
    'use strict';

    if (window.__GIPHY_COPIER_LOADED__) return;
    window.__GIPHY_COPIER_LOADED__ = true;

    let lastCopiedSrc = '';
    let debounceTimer = null;

    const toastStyle = document.createElement('style');
    toastStyle.textContent = `
        .giphy-gif-toast {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            width: 100%;
            color: #fff;
            padding: 16px 24px;
            border-radius: 0;
            font-size: 16px;
            font-weight: 500;
            text-align: center;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            z-index: 2147483647;
            animation: giphy-gif-toast-fade 0.3s ease;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            pointer-events: none;
            box-sizing: border-box;
        }
        .giphy-gif-toast--success {
            background: rgba(34, 139, 34, 0.95);
        }
        .giphy-gif-toast--error {
            background: rgba(220, 53, 69, 0.95);
        }
        @keyframes giphy-gif-toast-fade {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
        }
    `;
    document.head.appendChild(toastStyle);

    function showToast(message, type = 'success') {
        const existing = document.querySelector('.giphy-gif-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = `giphy-gif-toast giphy-gif-toast--${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => toast.remove(), 2500);
    }

    function copyToClipboard(text) {
        GM_setClipboard(text, { type: 'text', mimetype: 'text/plain' });
    }

    function stripUrlQuery(url) {
        if (!url) return url;
        const questionMarkIndex = url.indexOf('?');
        return questionMarkIndex > -1 ? url.slice(0, questionMarkIndex) : url;
    }

    function findMainGifImg() {
        const previewPanel = document.querySelector('div.flex.flex-col[style*="500px"]');
        if (previewPanel) {
            const img = previewPanel.querySelector('img.giphy-gif-img');
            if (img?.src) return img;
        }

        const previewRow = document.querySelector('div.mb-3.flex');
        if (previewRow) {
            const img = previewRow.querySelector('img.giphy-gif-img');
            if (img?.src) return img;
        }

        const mainGif = document.querySelector('.giphy-gif img.giphy-gif-img.giphy-img-loaded');
        if (mainGif?.src) return mainGif;

        return document.querySelector('.giphy-gif img.giphy-gif-img');
    }

    function tryAutoCopy() {
        const img = findMainGifImg();
        if (!img?.src) return;

        const url = stripUrlQuery(img.src);
        if (!url.includes('.gif') || url === lastCopiedSrc) return;

        lastCopiedSrc = url;

        const alt = img.alt || 'Giphy GIF';
        const imageTag = `<img src="${url}" width="300" alt="${alt}">`;

        try {
            copyToClipboard(imageTag);
            showToast('✓ GIF img tag 已複製到剪貼簿', 'success');
        } catch (err) {
            lastCopiedSrc = '';
            console.error('[Giphy Copier] 複製失敗:', err);
            showToast('✗ 複製失敗，請檢查 Tampermonkey 權限', 'error');
        }
    }

    function scheduleAutoCopy() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(tryAutoCopy, 200);
    }

    function boot() {
        scheduleAutoCopy();

        const observer = new MutationObserver(scheduleAutoCopy);
        observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'class'] });

        window.addEventListener('popstate', () => {
            lastCopiedSrc = '';
            scheduleAutoCopy();
        });

        const originalPushState = history.pushState.bind(history);
        const originalReplaceState = history.replaceState.bind(history);

        history.pushState = function(...args) {
            originalPushState(...args);
            lastCopiedSrc = '';
            scheduleAutoCopy();
        };

        history.replaceState = function(...args) {
            originalReplaceState(...args);
            lastCopiedSrc = '';
            scheduleAutoCopy();
        };
    }

    if (document.body) {
        boot();
    } else {
        window.addEventListener('DOMContentLoaded', boot, { once: true });
    }
})();
