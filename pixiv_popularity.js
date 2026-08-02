// ==UserScript==
// @name         pixiv Sort by Popularity
// @namespace    https://pixiv.net/
// @version      1.0.1
// @description  Add a "Popular" button to pixiv tag & search pages. Shows works sorted by popularity without pixiv Premium.
// @author       Yukari Kaname
// @license      MIT
// @icon         https://www.pixiv.net/favicon.ico
// @homepageURL  https://github.com/yukarikaname/pixiv-popularity
// @match        https://www.pixiv.net/tags/*
// @match        https://www.pixiv.net/*/tags/*
// @match        https://www.pixiv.net/search*
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // Configuration constants
    const BUTTON_ID = 'ppapi-popularity-button';
    const MODAL_ID = 'ppapi-popularity-modal';
    const POLL_INTERVAL = 2000;
    const POPULARITY_ORDER = 'popular_d';

    // Extract search term from URL.
    // Works on tag pages in ANY language (/tags/xxx, /en/tags/xxx, /ja/tags/xxx, ...)
    // and on search pages (/search?q=...).
    const getSearchTermFromUrl = () => {
        const path = location.pathname;

        // Tag page: take the segment right after the LAST "/tags/".
        const tagIdx = path.lastIndexOf('/tags/');
        if (tagIdx !== -1) {
            const segment = path.slice(tagIdx + 6).split('/')[0];
            return segment ? decodeURIComponent(segment) : null;
        }

        // Search page: use the "q" query parameter.
        if (/\/search/.test(path)) {
            const q = new URLSearchParams(location.search).get('q');
            return q || null;
        }

        return null;
    };

    const isTagPage = () => location.pathname.includes('/tags/');
    const isSearchPage = () => /\/search/.test(location.pathname);

    // Create modal dialog element
    const createModalDialog = () => {
        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: white;
            width: 90%;
            max-width: 1200px;
            height: 80vh;
            border-radius: 8px;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
        `;
        return dialog;
    };

    // Create modal header with title and close button
    const createModalHeader = (illustCount, onClose) => {
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 16px 20px;
            border-bottom: 1px solid #eee;
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #fafafa;
        `;

        const title = document.createElement('h2');
        title.textContent = `Popular Works (${illustCount} results)`;
        title.style.cssText = `
            margin: 0;
            font-size: 18px;
            font-weight: 600;
            color: #333;
        `;
        header.appendChild(title);

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = `
            background: none;
            border: none;
            font-size: 24px;
            color: #999;
            cursor: pointer;
            padding: 0;
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        closeBtn.onclick = onClose;
        header.appendChild(closeBtn);

        return header;
    };

    // Create image grid item
    const createGridItem = (illust) => {
        const item = document.createElement('div');
        item.style.cssText = `
            position: relative;
            overflow: hidden;
            aspect-ratio: 1;
            border-radius: 4px;
            background: #ddd;
            cursor: pointer;
            transition: transform 0.2s;
        `;

        item.addEventListener('mouseenter', () => {
            item.style.transform = 'scale(1.05)';
        });
        item.addEventListener('mouseleave', () => {
            item.style.transform = '';
        });

        const link = document.createElement('a');
        link.href = 'https://www.pixiv.net/artworks/' + illust.id;
        link.target = '_blank';
        link.style.cssText = `
            display: block;
            width: 100%;
            height: 100%;
            text-decoration: none;
        `;

        const img = document.createElement('img');
        img.src = illust.image_urls.medium;
        img.alt = illust.title || '';
        img.style.cssText = `
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
        `;

        link.appendChild(img);
        item.appendChild(link);
        return item;
    };

    // Create grid with all illustrations
    const createImageGrid = (illusts) => {
        const grid = document.createElement('div');
        grid.style.cssText = `
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
            gap: 12px;
        `;

        illusts.forEach((illust) => {
            if (illust.id && illust.image_urls && illust.image_urls.medium) {
                grid.appendChild(createGridItem(illust));
            }
        });

        return grid;
    };

    // Display popular works in a modal popup
    const showPopularModal = (illusts) => {
        // Remove any existing modal
        const existing = document.getElementById(MODAL_ID);
        if (existing) existing.remove();

        // Create modal overlay
        const modal = document.createElement('div');
        modal.id = MODAL_ID;
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 99999;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        `;

        const dialog = createModalDialog();
        const header = createModalHeader(illusts.length, () => modal.remove());

        const content = document.createElement('div');
        content.style.cssText = `
            flex: 1;
            overflow-y: auto;
            padding: 16px;
        `;
        content.appendChild(createImageGrid(illusts));

        dialog.appendChild(header);
        dialog.appendChild(content);
        modal.appendChild(dialog);
        document.body.appendChild(modal);

        // Close when clicking background
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };
    };

    // Normalize API response to consistent format
    const normalizeWebIllusts = (data) => {
        return (data || [])
            .map((it) => {
                const id = it.id || it.illustId || it.workId;
                if (!id) return null;

                // Extract image URL - try multiple possible field names
                let imageUrl = it.url || '';
                if (!imageUrl && it.urls) {
                    imageUrl =
                        it.urls.regular ||
                        it.urls.small ||
                        it.urls.thumb_mini ||
                        it.urls.px_128x128_90 ||
                        it.urls.px_480mw ||
                        '';
                }
                if (!imageUrl && it.image_urls) {
                    imageUrl =
                        it.image_urls.medium ||
                        it.image_urls.square_medium ||
                        it.image_urls.large ||
                        '';
                }

                if (!imageUrl) return null;

                return {
                    id: id,
                    title: it.title || '',
                    image_urls: {
                        medium: imageUrl
                    }
                };
            })
            .filter(Boolean);
    };

    const pickWebPopularSource = (body) => {
        const popular = body && body.popular;
        const popularList = [];

        if (popular) {
            if (typeof popular === 'object') {
                // Extract from nested object structure
                if (!Array.isArray(popular)) {
                    const possibleKeys = ['permanent', 'recent', 'illusts', 'data', 'items'];
                    for (let key of possibleKeys) {
                        if (Array.isArray(popular[key]) && popular[key].length > 0) {
                            popularList.push(...popular[key]);
                        }
                    }
                }
            }

            if (Array.isArray(popular) && popular.length > 0) {
                popularList.push(...popular);
            }
        }

        // NOTE: Do NOT fall back to the regular (non-popular) list here.
        // When pixiv has no popularity ranking for a tag (e.g. small tags like
        // "pippi"), the API returns an empty `popular` block plus the ordinary
        // 60-item list. Showing those as "popular" would be misleading.
        return popularList;
    };

    // Fetch popular works via Pixiv API
    const fetchWebPopularByCookie = (tag) => {
        const encodedTagPath = encodeURIComponent(tag);
        const params = new URLSearchParams({
            word: tag,
            order: POPULARITY_ORDER,
            mode: 'all',
            p: '1',
            s_mode: 's_tag',
            type: 'all',
            lang: document.documentElement.lang || 'en'
        });

        const url = '/ajax/search/artworks/' + encodedTagPath + '?' + params.toString();

        return fetch(url, {
            method: 'GET',
            credentials: 'include',
            headers: {
                'x-requested-with': 'XMLHttpRequest'
            }
        })
            .then((res) => {
                if (!res.ok) throw new Error('Web API HTTP ' + res.status);
                return res.json();
            })
            .then((json) => {
                if (json.error) throw new Error(json.message || 'Pixiv web API returned error');
                const body = json.body || {};
                const source = pickWebPopularSource(body);
                return { illusts: normalizeWebIllusts(source) };
            });
    };

    // ==== Button: label / creation ====

    // Language-aware label (works on any pixiv locale, not just English).
    const getButtonLabel = () => {
        const lang = (document.documentElement.lang || '').toLowerCase();
        if (lang.startsWith('ja')) return '人気順';
        if (lang.startsWith('zh')) return '人气';
        return 'Popular';
    };

    // Message shown when pixiv has no popularity ranking for the current tag.
    const getUnavailableMessage = () => {
        const lang = (document.documentElement.lang || '').toLowerCase();
        if (lang.startsWith('ja')) return 'このタグでは人気順の結果を表示できません。';
        if (lang.startsWith('zh')) return '该标签暂无可用的人气排序结果。';
        return 'Popular results are unavailable for this tag.';
    };

    const createButton = (term) => {
        const btn = document.createElement('button');
        btn.id = BUTTON_ID;
        btn.type = 'button';
        btn.dataset.term = term;
        btn.textContent = getButtonLabel();
        btn.style.cssText = `
            all: unset;
            cursor: pointer;
            font-size: 13px;
            font-weight: 700;
            line-height: 1;
            padding: 0 16px;
            height: 32px;
            border-radius: 6px;
            background: #0096fa;
            color: #fff;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            white-space: nowrap;
            flex-shrink: 0;
            transition: background-color 0.2s;
        `;

        btn.addEventListener('mouseenter', () => {
            btn.style.background = '#007bd6';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.background = '#0096fa';
        });
        btn.addEventListener('click', () => onButtonClick(btn));

        return btn;
    };

    // Find where to insert the button: { parent, reference } -> insert before `reference`.
    const findInsertionTarget = () => {
        if (isTagPage()) {
            // Tag header row: [title | Add-to-favorites]. Insert before the favorites button.
            const header = document.querySelector('[data-ga4-entity-id^="tag/"]');
            if (header) {
                const row = header.querySelector('.justify-between') || header;
                return { parent: row, reference: row.lastElementChild };
            }
            return null;
        }

        if (isSearchPage()) {
            // Sort row: [sort dropdown | divider | "Sort by popularity" premium]. Insert at the start.
            const row = Array.from(document.querySelectorAll('div')).find((d) => {
                const cls = (d.className || '').toString();
                return (
                    cls.includes('justify-start') &&
                    cls.includes('items-center') &&
                    cls.includes('h-32')
                );
            });
            if (row) return { parent: row, reference: row.firstElementChild };
            return null;
        }

        return null;
    };

    // Handle button clicks: fetch popular works and show them in a modal.
    const onButtonClick = (btn) => {
        const term = getSearchTermFromUrl();
        if (!term) {
            alert('Unable to detect search term from URL.');
            return;
        }

        const originalText = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Loading…';

        fetchWebPopularByCookie(term)
            .then((data) => {
                const illusts = data.illusts || [];
                if (illusts.length > 0) {
                    showPopularModal(illusts);
                } else {
                    alert(getUnavailableMessage());
                }
            })
            .catch((err) => {
                alert('Error loading popular results: ' + (err.message || String(err)));
            })
            .finally(() => {
                btn.disabled = false;
                btn.textContent = originalText;
            });
    };

    // Keep the button in sync with the current page (works with SPA navigation).
    const syncButton = () => {
        const term = getSearchTermFromUrl();

        // Not a supported page -> remove any leftover button.
        if (!term) {
            const existing = document.getElementById(BUTTON_ID);
            if (existing) existing.remove();
            return;
        }

        // Recreate the button if the search term changed.
        const existing = document.getElementById(BUTTON_ID);
        if (existing && existing.dataset.term !== term) {
            existing.remove();
        }

        if (document.getElementById(BUTTON_ID)) return;

        const target = findInsertionTarget();
        if (!target) return;

        const btn = createButton(term);
        target.parent.insertBefore(btn, target.reference);
    };

    // Monitor DOM changes for SPA navigation
    const installSpaHooks = () => {
        new MutationObserver(syncButton).observe(document.documentElement, {
            childList: true,
            subtree: true
        });
        setInterval(syncButton, POLL_INTERVAL);
    };

    syncButton();
    installSpaHooks();
})();
