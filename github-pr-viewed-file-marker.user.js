// ==UserScript==
// @name         GitHub PR Viewed File Marker
// @namespace    https://github.com/jjjjackson/tamper-monkey-scripts
// @version      3.0.0
// @description  Show a checkmark for viewed files in GitHub PR file tree
// @author       jjjjackson
// @match        https://github.com/*/*/pull/*
// @updateURL    https://raw.githubusercontent.com/jjjjackson/tamper-monkey-scripts/main/github-pr-viewed-file-marker.user.js
// @downloadURL  https://raw.githubusercontent.com/jjjjackson/tamper-monkey-scripts/main/github-pr-viewed-file-marker.user.js
// @homepageURL  https://github.com/jjjjackson/tamper-monkey-scripts
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const MARKED_CLASS = 'tm-pr-viewed-file';

  // ---------------------------------------------------------------------------
  // Style
  // ---------------------------------------------------------------------------

  const style = document.createElement('style');

  style.textContent = `
    a.${MARKED_CLASS}::before {
      content: "✓";
      display: inline-block;
      margin-right: 5px;
      color: var(--fgColor-success, #3fb950);
      font-weight: 700;
    }

    a.${MARKED_CLASS} {
      opacity: 0.6;
    }
  `;

  document.head.appendChild(style);

  // ---------------------------------------------------------------------------
  // Viewed state
  // ---------------------------------------------------------------------------

  function isViewedControl(element) {
    const label = element.getAttribute('aria-label') ?? '';
    const text = element.textContent?.trim() ?? '';

    if (!/viewed/i.test(`${label} ${text}`)) {
      return false;
    }

    if (element instanceof HTMLInputElement) {
      return element.checked;
    }

    const pressed = element.getAttribute('aria-pressed');

    if (pressed !== null) {
      return pressed === 'true';
    }

    const checked = element.getAttribute('aria-checked');

    if (checked !== null) {
      return checked === 'true';
    }

    return (
      /^viewed$/i.test(label) ||
      /^viewed$/i.test(text)
    );
  }

  function getViewedControls() {
    return document.querySelectorAll(
      'button, input[type="checkbox"], [role="checkbox"]'
    );
  }

  // ---------------------------------------------------------------------------
  // Diff ID
  // ---------------------------------------------------------------------------

  function findDiffId(control) {
    let element = control;

    for (let depth = 0; depth < 12 && element; depth++) {
      if (element.id?.startsWith('diff-')) {
        return element.id;
      }

      const diff = element.querySelector?.('[id^="diff-"]');

      if (diff) {
        return diff.id;
      }

      element = element.parentElement;
    }

    return null;
  }

  function getViewedDiffIds() {
    const ids = new Set();

    for (const control of getViewedControls()) {
      if (!isViewedControl(control)) {
        continue;
      }

      const diffId = findDiffId(control);

      if (diffId) {
        ids.add(diffId);
      }
    }

    return ids;
  }

  // ---------------------------------------------------------------------------
  // Sidebar
  // ---------------------------------------------------------------------------

  function isTreeViewLink(link) {
    return Boolean(
      link.closest(
        [
          '.PRIVATE_TreeView-item-content-text',
          '[class*="TreeView-item-content-text"]',
          '[class*="TreeViewItemContentText"]'
        ].join(',')
      )
    );
  }

  function getSidebarLink(diffId) {
    const selector = `a[href="#${CSS.escape(diffId)}"]`;

    return [...document.querySelectorAll(selector)]
      .find(isTreeViewLink);
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  function update() {
    const viewedDiffIds = getViewedDiffIds();

    // Remove marks that are no longer viewed.
    for (const link of document.querySelectorAll(`a.${MARKED_CLASS}`)) {
      const diffId = link.hash.slice(1);

      if (!viewedDiffIds.has(diffId)) {
        link.classList.remove(MARKED_CLASS);
      }
    }

    // Add missing marks.
    for (const diffId of viewedDiffIds) {
      const link = getSidebarLink(diffId);

      link?.classList.add(MARKED_CLASS);
    }
  }

  // ---------------------------------------------------------------------------
  // Scheduling
  // ---------------------------------------------------------------------------

  let timer;

  function scheduleUpdate(delay = 100) {
    clearTimeout(timer);
    timer = setTimeout(update, delay);
  }

  // GitHub updates Viewed state through React.
  const observer = new MutationObserver(scheduleUpdate);

  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: [
      'aria-pressed',
      'aria-checked',
      'checked'
    ]
  });

  // GitHub SPA navigation.
  document.addEventListener('turbo:load', () => {
    scheduleUpdate(300);
  });

  window.addEventListener('popstate', () => {
    scheduleUpdate(300);
  });

  // Initial state.
  scheduleUpdate(500);
})();
