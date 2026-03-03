// ==UserScript==
// @name         pixiv Sort by Popularity
// @namespace    https://pixiv.net/
// @version      1.0.0
// @description  Show 12 images sorted by popularity without pixiv Premium.
// @author       Yukari Kaname
// @license      MIT
// @icon         https://www.pixiv.net/favicon.ico
// @homepageURL  https://github.com/yukarikaname/pixiv-popularity
// @contributionURL https://www.patreon.com/c/yukarikaname
// @match        https://www.pixiv.net/*tags*
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    const HIJACK_FLAG = 'ppapiPopularityHijacked';
    let bindTimer = null;

    function getTagFromUrl() {
        const m = location.pathname.match(/\/tags\/([^/?]+)/);
        return m ? decodeURIComponent(m[1]) : null;
    }

    // Find the main illustration container on the page
    function findIllustContainer() {
        // Try to find the main content container
        const selectors = [
            'ul[class*="List"] li:first-child',
            'ul li a[href*="/artworks/"]',
            'div[class*="grid"] a[href*="/artworks/"]',
            'section a[href*="/artworks/"]'
        ];
        
        for (let selector of selectors) {
            const el = document.querySelector(selector);
            if (el) {
                // Find the parent ul or grid container
                let container = el.closest('ul') || el.closest('div[class*="grid"]') || el.closest('section');
                if (container) return container;
            }
        }
        return null;
    }

    // Update menu selection to highlight "Sort by popularity"
    function updateMenuSelection() {
        // Update dropdown button text
        const dropdownBtn = document.querySelector('button[data-ga4-label="open_dropdown_button"]');
        if (dropdownBtn) {
            const textSpan = dropdownBtn.querySelector('span');
            if (textSpan) {
                textSpan.textContent = 'Sort by popularity';
            }
        }
        
        // Find all order buttons in the dropdown menu
        const buttons = document.querySelectorAll('button[data-ga4-label="select_order_button"]');
        
        buttons.forEach((btn) => {
            const entityId = btn.getAttribute('data-ga4-entity-id');
            const iconContainer = btn.querySelector('pixiv-icon, div.size-16');
            
            // Only highlight the standard "Sort by popularity" (popular_d), not male/female variants
            if (entityId === 'search-option/popular_d') {
                // Add checkmark to popularity button
                if (iconContainer) {
                    if (iconContainer.tagName === 'DIV') {
                        const check = document.createElement('pixiv-icon');
                        check.setAttribute('name', '16/Check');
                        iconContainer.replaceWith(check);
                    }
                }
            } else {
                // Remove checkmark from other buttons
                if (iconContainer && iconContainer.tagName === 'PIXIV-ICON') {
                    const div = document.createElement('div');
                    div.className = 'size-16';
                    iconContainer.replaceWith(div);
                }
            }
        });
    }

    // Replace page content with popularity sorted results
    function replacePageResults(illusts) {
        const container = findIllustContainer();
        if (!container) {
            console.error('[Pixiv Popularity] Could not find illustration container');
            alert('Unable to find illustration container on page');
            return;
        }

        // Store first child as template (save before clearing container)
        const firstChild = container.querySelector('li') || container.querySelector('div[class*="item"]') || container.querySelector('a[href*="/artworks/"]');
        if (!firstChild) {
            console.error('[Pixiv Popularity] No template element found');
            return;
        }

        // Extract size parameter from original image URL
        const originalImg = firstChild.querySelector('img');
        let sizeParam = '/c/250x250_80_a2/'; // Default size
        
        if (originalImg && originalImg.src) {
            const match = originalImg.src.match(/\/c\/[^/]+\//);
            if (match) {
                sizeParam = match[0];
            }
        }

        // Clone structure to keep classes and styles
        const template = firstChild.cloneNode(true);
        
        // Clear container
        container.innerHTML = '';

        // Add new items
        illusts.slice(0, 60).forEach((illust) => {
            const clone = template.cloneNode(true);
            const link = clone.querySelector('a[href*="/artworks/"]') || (clone.tagName === 'A' ? clone : null);
            const img = clone.querySelector('img');
            
            if (link) {
                link.href = '/artworks/' + illust.id;
            }
            
            // Update image using API URL with correct size parameter
            if (img && illust.image_urls) {
                const imgUrl = (illust.image_urls.medium || illust.image_urls.square_medium || '').replace(/\/c\/[^/]+\//, sizeParam);
                
                if (imgUrl) {
                    img.src = imgUrl;
                    if (img.hasAttribute('srcset')) img.srcset = imgUrl + ' 1x, ' + imgUrl + ' 2x';
                    if (img.hasAttribute('data-src')) img.setAttribute('data-src', imgUrl);
                    if (img.hasAttribute('data-srcset')) img.setAttribute('data-srcset', imgUrl + ' 1x, ' + imgUrl + ' 2x');
                    img.alt = illust.title || '';
                }
            }
            
            // Update title if found
            const titleEl = clone.querySelector('[class*="title"]') || clone.querySelector('h3') || clone.querySelector('p');
            if (titleEl && illust.title) {
                titleEl.textContent = illust.title;
            }
            
            container.appendChild(clone);
        });
        
        // Update menu selection state
        updateMenuSelection();
    }

    // Show loading state
    function showLoading() {
        const container = findIllustContainer();
        if (container) {
            container.style.opacity = '0.5';
            container.style.pointerEvents = 'none';
        }
    }

    // Hide loading state
    function hideLoading() {
        const container = findIllustContainer();
        if (container) {
            container.style.opacity = '';
            container.style.pointerEvents = '';
        }
    }

    function normalizeWebIllusts(data) {
        return (data || []).map(function (it) {
            const id = it.id || it.illustId || it.workId;
            
            // Extract image URL from API response
            let imageUrl = it.url || '';
            if (!imageUrl && it.urls) {
                imageUrl = it.urls.regular || it.urls.small || it.urls.thumb_mini || '';
            }
            
            return {
                id: id,
                title: it.title || '',
                image_urls: {
                    medium: imageUrl,
                    square_medium: imageUrl
                }
            };
        }).filter(function (it) { return !!it.id; });
    }

    // Prioritize body.popular over body.data to get popularity-sorted results
    // (body.data often returns newest-first for free accounts)
    function pickWebPopularSource(body) {
        const fullList = [];
        const addList = function (arr) {
            if (Array.isArray(arr)) fullList.push.apply(fullList, arr);
        };

        addList(body && body.data);
        addList(body && body.illust && body.illust.data);
        addList(body && body.illustManga && body.illustManga.data);

        const fullById = {};
        fullList.forEach(function (item) {
            const id = item && (item.id || item.illustId || item.workId);
            if (id !== undefined && id !== null) {
                fullById[String(id)] = item;
            }
        });

        // Try to extract popularity section first
        const popular = body && body.popular;
        const popularRaw = [];
        if (Array.isArray(popular)) {
            popularRaw.push.apply(popularRaw, popular);
        } else if (popular && typeof popular === 'object') {
            ['permanent', 'recent', 'illusts', 'data'].forEach(function (key) {
                if (Array.isArray(popular[key])) {
                    popularRaw.push.apply(popularRaw, popular[key]);
                }
            });
        }

        // Resolve IDs to full objects
        const popularResolved = popularRaw.map(function (item) {
            if (item === null || item === undefined) return null;
            if (typeof item === 'number' || typeof item === 'string') {
                return fullById[String(item)] || { id: item };
            }
            const id = item.id || item.illustId || item.workId;
            if (id !== undefined && id !== null && fullById[String(id)]) {
                return Object.assign({}, fullById[String(id)], item);
            }
            return item;
        }).filter(Boolean);

        if (popularResolved.length > 0) {
            return popularResolved;
        }

        return fullList;
    }

    function fetchWebPopularByCookie(tag) {
        const encodedTagPath = encodeURIComponent(tag);
        const params = new URLSearchParams({
            word: tag,
            order: 'popular_d',
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
        }).then(function (res) {
            if (!res.ok) {
                throw new Error('Web API HTTP ' + res.status);
            }
            return res.json();
        }).then(function (json) {
            if (json.error) {
                throw new Error(json.message || 'Pixiv web API returned error');
            }
            const body = json.body || {};
            const source = pickWebPopularSource(body);
            return { illusts: normalizeWebIllusts(source) };
        });
    }

    function getElementText(el) {
        return (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }

    function isPopularityControl(el) {
        // Don't hijack the dropdown menu button itself
        const ga4Label = el.getAttribute('data-ga4-label');
        if (ga4Label === 'open_dropdown_button') {
            return false;
        }
        
        // Check data-ga4-entity-id first for precise match
        const entityId = el.getAttribute('data-ga4-entity-id');
        if (entityId === 'search-option/popular_d') {
            return true;
        }
        
        // Fallback to text matching for "Sort by popularity" only (not male/female variants)
        // This matches buttons inside carousel or other locations
        const t = getElementText(el);
        return (t.includes('sort by popularity') || t.includes('人気順')) && 
               !t.includes('male') && !t.includes('female');
    }

    // Intercept clicks on popularity buttons using capture phase
    function onPopularityClick(e) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();

        const tag = getTagFromUrl();
        if (!tag) {
            alert('Unable to detect tag from URL.');
            return;
        }

        showLoading();
        
        fetchWebPopularByCookie(tag)
            .then(function (data) {
                hideLoading();
                if (data.illusts && data.illusts.length > 0) {
                    replacePageResults(data.illusts);
                } else {
                    alert('No popular results found.');
                }
            })
            .catch(function (err) {
                hideLoading();
                alert('Error loading popular results: ' + (err.message || String(err)));
            });
    }

    // Scan DOM and hijack native popularity sort buttons
    function bindHijack() {
        const candidates = document.querySelectorAll('button, a[role="button"], div[role="button"]');
        candidates.forEach(function (el) {
            if (el.dataset[HIJACK_FLAG] === '1') return;
            if (!isPopularityControl(el)) return;
            el.dataset[HIJACK_FLAG] = '1';
            el.addEventListener('click', onPopularityClick, true);
        });
    }

    function scheduleBind() {
        clearTimeout(bindTimer);
        bindTimer = setTimeout(bindHijack, 80);
    }

    // Monitor SPA navigation and DOM changes to rebind buttons
    function installSpaHooks() {
        const rawPushState = history.pushState;
        history.pushState = function () {
            const ret = rawPushState.apply(this, arguments);
            scheduleBind();
            return ret;
        };
        const rawReplaceState = history.replaceState;
        history.replaceState = function () {
            const ret = rawReplaceState.apply(this, arguments);
            scheduleBind();
            return ret;
        };
        window.addEventListener('popstate', scheduleBind);
        new MutationObserver(scheduleBind).observe(document.documentElement, { childList: true, subtree: true });
        setInterval(bindHijack, 1500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindHijack, { once: true });
    } else {
        bindHijack();
    }
    installSpaHooks();
})();
