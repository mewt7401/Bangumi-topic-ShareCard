// ==UserScript==
// @name         Bangumi-topic-ShareCard
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  仅移除包含 oklch 的 style 标签，保留布局样式，避免文字偏移，增添关闭按钮动画
// @author       Bangumi_0809_Mewtw0
// @match        *://bgm.tv/group/topic/*
// @match        *://bangumi.tv/group/topic/*
// @match        *://chii.in/group/topic/*
// @grant        GM_xmlhttpRequest
// @connect      *
// @require      https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js
// @license      MIT
// @downloadURL https://update.greasyfork.org/scripts/559776/Bangumi-topic-ShareCard.user.js
// @updateURL https://update.greasyfork.org/scripts/559776/Bangumi-topic-ShareCard.meta.js
// ==/UserScript==

(function() {
    'use strict';

    const AI_CONFIG = {
        apiUrl: "在此处填入你的_API_URL",
        apiKey: "在此处填入你的_API_KEY",
        model: "gpt-3.5-turbo",
    };

    let currentOverlay = null;

    const style = document.createElement('style');
    style.id = 'bgm-share-card-style';
    style.innerHTML = `
        #bgm-share-overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.85); display: none; justify-content: center;
            align-items: center; z-index: 100000; cursor: pointer;
        }
        .close-overlay-btn {
            position: fixed; top: 20px; right: 20px;
            background: rgba(255,255,255,0.2); border: none; width: 40px; height: 40px;
            border-radius: 50%; color: white; font-size: 24px; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            z-index: 100001; backdrop-filter: blur(5px);
            -webkit-backdrop-filter: blur(5px);
        }

        /* 悬停时仍保留原有放大效果 */
        .close-overlay-btn:hover {
            background: rgba(255,255,255,0.3);
            transform: scale(1.1);
        }

        /* SVG 圆环动画 */
        @keyframes drawCircle {
            from { stroke-dashoffset: 125.66; }  /* 周长 = 2 * PI * 20 ≈ 125.66 */
            to   { stroke-dashoffset: 0; }
        }

        /* 线段相对旋转效果 */
        @keyframes spin {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
        }

        .share-card {
            width: 420px; background: rgba(40,40,40,0.85); border-radius: 20px; overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            box-shadow: 0 25px 60px rgba(0,0,0,0.5);
            backdrop-filter: blur(10px); cursor: default;
        }
        .card-top-bar { height: 0px; background: #F09199; }
        .card-header {
            padding: 25px 25px 20px; display: flex; align-items: center; gap: 15px;
            background: rgba(40,40,40,0.85); backdrop-filter: blur(10px);
            border-bottom: 1px solid #fff;
        }
        .avatar-img { width: 54px; height: 54px; border-radius: 12px; background: #eee; background-size: cover; border: 1px solid #f0f0f0; }
        .user-meta { display: flex; flex-direction: column; justify-content: center; height: 54px; }
        .user-meta .name { font-weight: bold; color: #F09199; font-size: 17px; }
        .user-meta .time { font-size: 12px; color: #aaa; margin-top: 4px; }
        .card-body { padding: 15px 25px 25px; background: rgba(40,40,40,0.85); backdrop-filter: blur(10px); }
        .main-title { font-size: 20px; color: #fff; margin: 0 0 15px; font-weight: 800; }
        .content-box { background: #262626; padding: 20px; border-radius: 12px; position: relative; }
        .content-box.hover-visible::after, .content-box:hover::after {
            content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0;
            border: 1px solid #F09199; border-radius: 16px; pointer-events: none;
        }
        .content-text { font-size: 14px; color: #fff; line-height: 1.8; white-space: pre-wrap; }
        .tags-container { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 15px; }
        .tag-item { background: #FEEFF0; color: #F09199; font-size: 12px; padding: 6px 12px; border-radius: 20px; font-weight: bold; border: 1px solid #F0919944; }
        .card-footer { background: rgba(40,40,40,0.85); padding: 20px 25px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #fff; }
        .qr-img { background: rgba(40,40,40,0.85); width: 55px; height: 55px; }
        #loading-info { position: fixed; top: 55%; left: 50%; transform: translateX(-50%); color: #fff; z-index: 100001; }
        .copy-success { position: fixed; top: 20px; right: 20px; background: #4CAF50; color: white; padding: 12px 20px; border-radius: 8px; z-index: 100002; }
    `;
    document.head.appendChild(style);

    function setupGlobalClickHandler() {
        document.addEventListener('click', (e) => {
            if (currentOverlay?.style.display === 'flex' && (e.target === currentOverlay || e.target.classList.contains('close-overlay-btn')))
                removeOverlay();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && currentOverlay?.style.display === 'flex') removeOverlay();
        });
    }

    function removeOverlay() { currentOverlay?.remove(); currentOverlay = null; }

    function getElementByXpath(path) {
        return document.evaluate(path, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    }

    function fetchAsBase64(url) {
        return new Promise((resolve) => {
            if (!url) { resolve(""); return; }
            const finalUrl = url.startsWith('//') ? 'https:' + url : url;
            GM_xmlhttpRequest({
                method: "GET", url: finalUrl, responseType: "blob",
                onload: (res) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(res.response);
                },
                onerror: () => resolve("")
            });
        });
    }

    function showCopySuccess() {
        const div = document.createElement('div');
        div.className = 'copy-success';
        div.textContent = '✓ 图片已复制到剪贴板！';
        document.body.appendChild(div);
        setTimeout(() => div.remove(), 1000);
    }

    function fallbackDownload(canvas) {
        const link = document.createElement('a');
        link.download = `Bangumi分享卡片_${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        const div = document.createElement('div');
        div.className = 'copy-success';
        div.textContent = '✓ 图片已保存到本地！';
        div.style.background = '#2196F3';
        document.body.appendChild(div);
        setTimeout(() => div.remove(), 1000);
    }

    async function getAITags(title, content) {
        if (!AI_CONFIG.apiKey || AI_CONFIG.apiKey.includes("填入")) return ["话题", "讨论", "Bangumi"];
        return new Promise((resolve) => {
            const prompt = `根据标题和内容生成3个短标签，只要标签名，空格隔开。内容：${title} ${content.substring(0, 150)}`;
            GM_xmlhttpRequest({
                method: "POST", url: AI_CONFIG.apiUrl,
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${AI_CONFIG.apiKey}` },
                data: JSON.stringify({ model: AI_CONFIG.model, messages: [{ role: "user", content: prompt }], temperature: 0.5 }),
                onload: (res) => {
                    try {
                        const tags = JSON.parse(res.responseText).choices[0].message.content.trim().split(/\s+/).slice(0, 3);
                        resolve(tags);
                    } catch (e) { resolve(["话题", "讨论", "Bangumi"]); }
                },
                onerror: () => resolve(["话题", "讨论", "Bangumi"])
            });
        });
    }

    async function createShareImage() {
        if (typeof html2canvas === 'undefined') {
            alert("截图库加载失败，请刷新页面。");
            return;
        }

        const loading = document.createElement('div');
        loading.innerHTML = '<div id="bgm-share-overlay" style="display:flex"><div id="loading-info">AI 正在提炼标签...</div></div>';
        document.body.appendChild(loading);

        const idNode = getElementByXpath("/html/body/div[1]/div[2]/div[1]/div[1]/div[2]/div[2]/strong/a");
        const username = idNode ? idNode.innerText.trim() : "未知用户";
        const timeNode = getElementByXpath("/html/body/div[1]/div[2]/div[1]/div[1]/div[2]/div[1]/div[1]/small");
        let postTime = timeNode ? (timeNode.innerText.match(/\d{4}-\d{1,2}-\d{1,2}\s\d{1,2}:\d{1,2}/)?.[0] || "未知时间") : "未知时间";

        const h1Node = document.querySelector('#pageHeader h1') || document.querySelector('h1');
        let pureTitle = "";
        if (h1Node) h1Node.childNodes.forEach(n => { if (n.nodeType === 3) pureTitle += n.textContent; });
        pureTitle = pureTitle.replace(/[»\n]/g, '').trim() || "分享话题";

        const masterPost = document.querySelector('.postTopic') || document.querySelector('[id^="post_"]');
        let fullContent = (masterPost?.querySelector('.topic_content') || masterPost?.querySelector('.inner'))?.innerText?.trim() || "";
        let displayContent = fullContent.length > 300 ? fullContent.substring(0, 300) + "..." : fullContent;

        const avatarBox = masterPost?.querySelector('.avatarSize48');
        let avatarUrl = avatarBox ? window.getComputedStyle(avatarBox).backgroundImage.replace(/url\(["']?([^"']+)["']?\)/, '$1') : "";

        const currentFullUrl = window.location.origin + window.location.pathname;
        const displayUrl = currentFullUrl.replace(/^https?:\/\//, '');

        const [tags, base64Avatar, base64QR] = await Promise.all([
            getAITags(pureTitle, fullContent),
            fetchAsBase64(avatarUrl),
            fetchAsBase64(`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(currentFullUrl)}&color=F09199&bgcolor=262626`)
        ]);

        const tagsHtml = tags.map(tag => `<span class="tag-item">#${tag}</span>`).join('');
        loading.remove();

        const overlay = document.createElement('div');
        overlay.id = 'bgm-share-overlay';
        overlay.style.display = 'flex';
        overlay.innerHTML = `
            <button class="close-overlay-btn" title="关闭">×</button>
            <div id="capture-area" style="padding: 2px; background: transparent;">
                <div class="share-card">
                    <div class="card-top-bar"></div>
                    <div class="card-header">
                        <img class="avatar-img" src="${base64Avatar}">
                        <div class="user-meta">
                            <span class="name">${username}</span>
                            <span class="time">${postTime}</span>
                        </div>
                    </div>
                    <div class="card-body">
                        <h1 class="main-title">${pureTitle}</h1>
                        <div class="content-box"><p class="content-text">${displayContent}</p></div>
                        <div class="tags-container">${tagsHtml}</div>
                    </div>
                    <div class="card-footer">
                        <div style="text-align:left">
                            <div style="font-size:14px; font-weight:bold; color:#f09199">Bangumi 番组计划</div>
                            <div style="font-size:10px; color:#fff; margin-top:2px;">${displayUrl}</div>
                        </div>
                        <img class="qr-img" src="${base64QR}">
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        currentOverlay = overlay;

        // 为关闭按钮添加 SVG 圆环动画+旋转效果
        const closeBtn = overlay.querySelector('.close-overlay-btn');
        if (closeBtn) {
            const svgNS = "http://www.w3.org/2000/svg";
            const svg = document.createElementNS(svgNS, "svg");
            svg.setAttribute("width", "44");
            svg.setAttribute("height", "44");
            svg.setAttribute("viewBox", "0 0 44 44");
            svg.style.position = "absolute";
            svg.style.top = "-2px";
            svg.style.left = "-2px";
            svg.style.pointerEvents = "none";
            svg.style.transform = "rotate(-90deg)";/* 起点逆时针转90度 */
            svg.style.animation = "spin 15s linear forwards";
            svg.style.transformOrigin = "center";

            const circle = document.createElementNS(svgNS, "circle");
            circle.setAttribute("cx", "22");
            circle.setAttribute("cy", "22");
            circle.setAttribute("r", "20");
            circle.setAttribute("fill", "none");
            circle.setAttribute("stroke", "white");
            circle.setAttribute("stroke-width", "2");
            circle.setAttribute("stroke-dasharray", "125.66");
            circle.setAttribute("stroke-dashoffset", "125.66");
            circle.style.animation = "drawCircle 15s linear forwards";

            svg.appendChild(circle);
            closeBtn.style.position = "fixed";
            closeBtn.appendChild(svg);
        }

        // 自动关闭计时器（15秒）
        const autoCloseTimer = setTimeout(() => {
            if (currentOverlay) removeOverlay();
        }, 15000);
        overlay._autoCloseTimer = autoCloseTimer;


        setTimeout(async () => {
            const captureArea = document.querySelector('#capture-area');
            if (!captureArea) return;

            const contentBox = captureArea.querySelector('.content-box');
            if (contentBox) contentBox.classList.add('hover-visible');
            await new Promise(r => setTimeout(r, 50));

            try {
                const canvas = await html2canvas(captureArea, {
                    scale: 2,
                    backgroundColor: null,
                    useCORS: true,
                    logging: false,
                    onclone: (clonedDoc, element) => {
                        // 只删除那些内容中包含 'oklch' 的 style 标签（且不是我们自己添加的）
                        // 保留所有 link 样式表和其它不包含 oklch 的 style 标签，以维持正常布局
                        clonedDoc.querySelectorAll('style').forEach(styleTag => {
                            if (styleTag.id !== 'bgm-share-card-style' && styleTag.innerHTML.includes('oklch')) {
                                styleTag.remove();
                            }
                        });
                    }
                });
                if (contentBox) contentBox.classList.remove('hover-visible');
                canvas.toBlob(async (blob) => {
                    try {
                        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                        showCopySuccess();
                    } catch (err) {
                        fallbackDownload(canvas);
                    }
                }, 'image/png');
            } catch (err) {
                console.error(err);
                if (contentBox) contentBox.classList.remove('hover-visible');
                const errorDiv = document.createElement('div');
                errorDiv.className = 'copy-success';
                errorDiv.textContent = '❌ 截图失败，请重试';
                errorDiv.style.background = '#f44336';
                document.body.appendChild(errorDiv);
                setTimeout(() => errorDiv.remove(), 3000);
            }
        }, 800);
    }

    function insertButton() {
        const container = getElementByXpath("/html/body/div[1]/div[2]/div[1]/div[1]/div[2]/div[2]/div[2]");
        if (container && !document.getElementById('gen-card-btn')) {
            const btn = document.createElement('a');
            btn.id = 'gen-card-btn';
            btn.href = "javascript:void(0);";
            btn.className = 'chiiBtn';
            btn.style.cssText = `
            background: transparent;
            color: rgb(240, 145, 153);
            margin-left: 10px;
            padding: 1px 10px;
            border-radius: 16px;
            display: inline-flex;
            align-items: center;      /* 内部文字垂直居中 */
            justify-content: center;
            vertical-align: middle;   /* 与周围行内元素对齐 */
            height: 25px;             /* 固定高度，与周围元素协调 */
            line-height: 1;           /* 避免继承干扰 */
            `;
            btn.innerHTML = '<span>生成分享卡片</span>';
            container.appendChild(btn);
            btn.addEventListener('click', createShareImage);

            // 添加 hover 样式（紧接着）
            const hoverStyle = document.createElement('style');
            hoverStyle.textContent = `
            #gen-card-btn:hover {
            background-color: #0084b4 !important;
            }
            `;
            document.head.appendChild(hoverStyle);
        }
    }

    setupGlobalClickHandler();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', insertButton);
    else setTimeout(insertButton, 500);
})();