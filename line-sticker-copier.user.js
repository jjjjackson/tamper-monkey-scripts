// ==UserScript==
// @name         LINE Sticker URL Copier
// @namespace    https://github.com/jjjjackson/tamper-monkey-scripts
// @version      1.0.0
// @description  點擊 LINE 貼圖時複製貼圖 URL 到剪貼簿
// @author       jjjjackson
// @match        https://store.line.me/stickershop/product*
// @updateURL    https://raw.githubusercontent.com/jjjjackson/tamper-monkey-scripts/main/line-sticker-copier.user.js
// @downloadURL  https://raw.githubusercontent.com/jjjjackson/tamper-monkey-scripts/main/line-sticker-copier.user.js
// @homepageURL  https://github.com/jjjjackson/tamper-monkey-scripts
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // 建立 Toast 樣式
    const toastStyle = document.createElement('style');
    toastStyle.textContent = `
        .line-sticker-toast {
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.85);
            color: #fff;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 14px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            z-index: 999999;
            animation: line-sticker-toast-fade 0.3s ease;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }
        @keyframes line-sticker-toast-fade {
            from { opacity: 0; transform: translateX(-50%) translateY(10px); }
            to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
    `;
    document.head.appendChild(toastStyle);

    function showToast(message) {
        const existing = document.querySelector('.line-sticker-toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'line-sticker-toast';
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => toast.remove(), 2000);
    }

    function copyToClipboard(text) {
        return navigator.clipboard.writeText(text);
    }

    // 移除 URL 的 query string（如 ?v=1）
    function stripUrlQuery(url) {
        if (!url) return url;
        const questionMarkIndex = url.indexOf('?');
        return questionMarkIndex > -1 ? url.slice(0, questionMarkIndex) : url;
    }

    function getStickerUrlFromElement(element) {
        // 往上找 li 元素 (mdCMN09Li FnStickerPreviewItem)
        let current = element;
        while (current && current !== document.body) {
            if (current.tagName === 'LI' && current.classList.contains('mdCMN09Li')) {
                const dataPreview = current.getAttribute('data-preview');
                if (dataPreview) {
                    try {
                        const preview = JSON.parse(dataPreview);
                        // 優先使用 animationUrl，若無則用 staticUrl
                        const url = preview.animationUrl || preview.staticUrl || '';
                        return url;
                    } catch (e) {
                        console.error('解析 data-preview 失敗:', e);
                        return null;
                    }
                }
            }
            current = current.parentElement;
        }
        return null;
    }

    document.addEventListener('click', function(e) {
        // 檢查點擊的是否為貼圖相關元素 (span.mdCMN09Image 或其父層)
        const target = e.target.closest('.mdCMN09Image, .mdCMN09LiInner, .mdCMN09Li');
        if (!target) return;

        const rawUrl = getStickerUrlFromElement(target);
        if (rawUrl) {
            const url = stripUrlQuery(rawUrl);
            const imageTag=`<img src="${url}" alt="LINE Sticker">`;
            copyToClipboard(imageTag)
                .then(() => {
                    showToast('✓ 貼圖 URL 已複製到剪貼簿');
                })
                .catch(err => {
                    console.error('複製失敗:', err);
                    showToast('✗ 複製失敗，請檢查權限');
                });
        }
    }, true); // 使用 capture 確保在預覽彈窗之前觸發
})();
