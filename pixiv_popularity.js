// ==UserScript==
// @name         pixiv Sort by Popularity
// @namespace    https://pixiv.net/
// @version      1.0.0
// @description  Show images sorted by popularity without pixiv Premium.
// @author       Yukari Kaname
// @license      MIT
// @icon         https://www.pixiv.net/favicon.ico
// @homepageURL  https://github.com/yukarikaname/pixiv-popularity
// @match        https://www.pixiv.net/*tags*
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // Configuration constants
    const HIJACK_FLAG = 'ppapiPopularityHijacked';
    const MODAL_ID = 'pixiv-popularity-modal';
    const POLL_INTERVAL = 2000;
    const POPULARITY_ORDER = 'popular_d';
    const POPULARITY_ENTITY_ID = 'search-option/popular_d';

    // Extract tag name from URL
    const getTagFromUrl = () => {
        const m = location.pathname.match(/\/tags\/([^/?]+)/);
        return m ? decodeURIComponent(m[1]) : null;
    };

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

        if (popularList.length > 0) return popularList;

        // Fallback chain when popular data is not available
        const illustMangaData = body?.illustManga?.data;
        if (Array.isArray(illustMangaData) && illustMangaData.length > 0) {
            return illustMangaData;
        }

        const illustData = body?.illust?.data;
        if (Array.isArray(illustData) && illustData.length > 0) {
            return illustData;
        }

        const bodyData = body?.data;
        if (Array.isArray(bodyData) && bodyData.length > 0) {
            return bodyData;
        }

        return [];
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

    const getElementText = (el) => {
        return (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
    };

    const isPopularityControl = (el) => {
        const ga4Label = el.getAttribute('data-ga4-label');
        if (ga4Label === 'open_dropdown_button' || ga4Label === 'suggest_chip') {
            return false;
        }

        const entityId = el.getAttribute('data-ga4-entity-id');
        if (entityId === POPULARITY_ENTITY_ID) {
            return true;
        }

        const t = getElementText(el);
        const isPopularityText =
            (t.includes('sort by popularity') || t.includes('人気順')) &&
            !t.includes('male') &&
            !t.includes('female');

        if (isPopularityText) {
            const isClickable =
                el.tagName === 'BUTTON' ||
                el.tagName === 'A' ||
                el.getAttribute('role') === 'button';
            return isClickable;
        }

        return false;
    };

    // Handle popularity button clicks
    const onPopularityClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation?.();

        const tag = getTagFromUrl();
        if (!tag) {
            alert('Unable to detect tag from URL.');
            return;
        }

        fetchWebPopularByCookie(tag)
            .then((data) => {
                const illusts = data.illusts || [];
                if (illusts.length > 0) {
                    showPopularModal(illusts);
                } else {
                    alert('No popular results found.');
                }
            })
            .catch((err) => {
                alert('Error loading popular results: ' + (err.message || String(err)));
            });
    };

    // Scan DOM and hijack popularity sort buttons
    const bindHijack = () => {
        const hasPopularBanner = Array.from(document.querySelectorAll('h3')).some((h3) =>
            h3.textContent.includes('Popular works')
        );

        const candidates = document.querySelectorAll(
            'button, a[role="button"], div[role="button"]'
        );
        candidates.forEach((el) => {
            const isPopular = isPopularityControl(el);

            if (isPopular) {
                if (!hasPopularBanner) {
                    el.remove();
                    return;
                }
                if (el.dataset[HIJACK_FLAG] === '1') return;
                el.dataset[HIJACK_FLAG] = '1';
                el.addEventListener('click', onPopularityClick, true);
            }
        });
    };

    // Monitor DOM changes for SPA navigation
    const installSpaHooks = () => {
        new MutationObserver(bindHijack).observe(document.documentElement, {
            childList: true,
            subtree: true
        });
        setInterval(bindHijack, POLL_INTERVAL);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindHijack, { once: true });
    } else {
        bindHijack();
    }
    installSpaHooks();
})();
