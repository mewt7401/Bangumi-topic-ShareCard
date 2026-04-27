// ==UserScript==
// @name         Bangumi-topic-ShareCard
// @namespace    http://tampermonkey.net/
// @version      2.4
// @description  底部文字替换为 Logo 图片,移除 AI 标签，显示小组名称和回复数，保留布局样式与动画，布局配色方案优化，增加bangumi独家表情随机显示
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

    let currentOverlay = null;

    const style = document.createElement('style');
    const CUSTOM_GIF_URL = (n=>`https://lain.bgm.tv/img/smiles/${n}/${n}_${Math.floor(Math.random()*117)+1}.gif`)(['musume','blake'][Math.random()<0.5?0:1]);
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
        .close-overlay-btn:hover {
            background: rgba(255,255,255,0.3);
            transform: scale(1.1);
        }
        @keyframes drawCircle {
            from { stroke-dashoffset: 125.66; }
            to   { stroke-dashoffset: 0; }
        }
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
            position: relative;
            padding: 25px 25px 20px; display: flex; align-items: center; gap: 15px;
            background: rgba(40,40,40,0.85); backdrop-filter: blur(10px);
        }
        .card-header::after {
            content: '';
            position: absolute;
            bottom: 0;
            left: 6%;          /* 左右各留 6% 空白，中间88% */
            width: 88%;
            height: 1px;
            background: #B39CD0;
            border-radius: 1px;
            pointer-events: none;
        }
        .header-gif {
            width: 54px;
            height: 54px;
            border-radius: 12px;
            background: transparent;
            overflow: hidden;
            flex-shrink: 0;
        }
        .header-gif img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        .avatar-img { width: 54px; height: 54px; border-radius: 12px; background: #eee; background-size: cover; border: 1px solid #f0f0f0; }
        .user-meta { display: flex; flex-direction: column; justify-content: center; height: 54px; flex: 1;  /* 新增，让中间区域撑开，使 GIF 靠右 */ }
        .user-meta .name { font-weight: bold; color: #F09199; font-size: 17px; }
        .user-meta .time { font-size: 12px; color: #f0f0f0; margin-top: 4px; }
        .card-body { padding: 15px 25px 25px; background: rgba(40,40,40,0.85); backdrop-filter: blur(10px); }
        .main-title { font-size: 20px; color: #fff; margin: 0 0 15px; font-weight: 600; }
        .content-box { background: #262626; padding: 20px; border-radius: 12px; position: relative; }
        .content-box.hover-visible::after, .content-box:hover::after {
            content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0;
            border: 1px solid #F09199; border-radius: 16px; pointer-events: none;
        }
        .content-text { font-size: 14px; color: #fff; line-height: 1.8; white-space: pre-wrap; word-break: break-word;}
        .tags-container { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 15px; }
        .tag-item { background: #FEEFF0; color: #F09199; font-size: 12px; padding: 6px 12px; border-radius: 20px; font-weight: bold; border: 1px solid #F0919944; }
        .card-footer { position: relative;background: rgba(40,40,40,0.85); padding: 20px 25px; display: flex; justify-content: space-between; align-items: center; }
        .card-footer::before {
            content: '';
            position: absolute;
            top: 0;
            left: 6%;
            width: 88%;
            height: 1px;
            background: #B39CD0;
            border-radius: 1px;
            pointer-events: none;
        }
        .qr-img { background: rgba(40,40,40,0.85); width: 55px; height: 55px; }
        .footer-logo { height: 20px; width: auto; vertical-align: middle; margin-right: 4px; }
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

    async function createShareImage() {
        if (typeof html2canvas === 'undefined') {
            alert("截图库加载失败，请刷新页面。");
            return;
        }

        const loading = document.createElement('div');
        loading.innerHTML = '<div id="bgm-share-overlay" style="display:flex"><div id="loading-info">正在生成分享卡片...</div></div>';
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

        // 获取头像、二维码、Logo 的 Base64
        const [base64Avatar, base64QR, base64Logo, base64Gif] = await Promise.all([
            fetchAsBase64(avatarUrl),
            fetchAsBase64(`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(currentFullUrl)}&color=F09199&bgcolor=262626`),
            fetchAsBase64('https://bgm.tv/img/logo_riff.png'),
            fetchAsBase64(CUSTOM_GIF_URL)
        ]);

        // 获取小组名称和回复数
        let groupName = "未知小组";
        const groupLink = document.querySelector('#pageHeader h1 a:first-child');
        if (groupLink) {
            groupName = groupLink.textContent.trim();
        }
        let replyCount = "0";
        if (masterPost) {
            const replyTitle = masterPost.querySelector('.post_actions .action .title');
            if (replyTitle) {
                const match = replyTitle.textContent.match(/\d+/);
                if (match) replyCount = match[0];
            }
        }
        const tagsHtml = `
            <span class="tag-item">#${groupName}</span>
            <span class="tag-item">#${replyCount}回复</span>
        `;

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
                        <div class="header-gif">
                            <img src="${base64Gif}" alt="custom gif">
                        </div>
                    </div>
                    <div class="card-body">
                        <h1 class="main-title">${pureTitle}</h1>
                        <div class="content-box"><p class="content-text">${displayContent}</p></div>
                        <div class="tags-container">${tagsHtml}</div>
                    </div>
                    <div class="card-footer">
                        <div style="text-align:left">
                            <img class="footer-logo" src="${base64Logo}" alt="Bangumi">
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
            svg.style.transform = "rotate(-90deg)";
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
                align-items: center;
                justify-content: center;
                vertical-align: middle;
                height: 25px;
                line-height: 1;
            `;
            btn.innerHTML = '<span>生成分享卡片</span>';
            container.appendChild(btn);
            btn.addEventListener('click', createShareImage);

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
    // ========== 新增：供客户端调用的 API（修复 html2canvas 未定义 + oklch 错误）==========
    async function generateCardImageForClient() {
        // 等待 html2canvas 加载完成（最多等 5 秒）
        if (typeof html2canvas === 'undefined') {
            for (let i = 0; i < 50; i++) { // 每 100ms 检测一次，共 5 秒
                await new Promise(r => setTimeout(r, 100));
                if (typeof html2canvas !== 'undefined') break;
            }
            if (typeof html2canvas === 'undefined') {
                throw new Error('html2canvas 加载失败，请刷新页面重试');
            }
        }

        // 数据抓取（与 createShareImage 完全一致）
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

        const [base64Avatar, base64QR, base64Logo, base64Gif] = await Promise.all([
            fetchAsBase64(avatarUrl),
            fetchAsBase64(`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(currentFullUrl)}&color=F09199&bgcolor=262626`),
            fetchAsBase64('https://bgm.tv/img/logo_riff.png'),
            fetchAsBase64(CUSTOM_GIF_URL)
        ]);

        let groupName = "未知小组";
        const groupLink = document.querySelector('#pageHeader h1 a:first-child');
        if (groupLink) groupName = groupLink.textContent.trim();
        let replyCount = "0";
        if (masterPost) {
            const replyTitle = masterPost.querySelector('.post_actions .action .title');
            if (replyTitle) {
                const match = replyTitle.textContent.match(/\d+/);
                if (match) replyCount = match[0];
            }
        }
        const tagsHtml = `<span class="tag-item">#${groupName}</span><span class="tag-item">#${replyCount}回复</span>`;

        // 构建卡片 HTML（样式和原有卡片完全一致）
        const cardHtml = `
        <div class="share-card">
            <div class="card-top-bar"></div>
            <div class="card-header">
                <img class="avatar-img" src="${base64Avatar}">
                <div class="user-meta">
                    <span class="name">${username}</span>
                    <span class="time">${postTime}</span>
                </div>
                <div class="header-gif">
                    <img src="${base64Gif}" alt="custom gif">
                </div>
            </div>
            <div class="card-body">
                <h1 class="main-title">${pureTitle}</h1>
                <div class="content-box"><p class="content-text">${displayContent}</p></div>
                <div class="tags-container">${tagsHtml}</div>
            </div>
            <div class="card-footer">
                <div style="text-align:left">
                    <img class="footer-logo" src="${base64Logo}" alt="Bangumi">
                    <div style="font-size:10px; color:#fff; margin-top:2px;">${displayUrl}</div>
                </div>
                <img class="qr-img" src="${base64QR}">
            </div>
        </div>
    `;

        const tempDiv = document.createElement('div');
        tempDiv.style.position = 'fixed';
        tempDiv.style.left = '-9999px';
        tempDiv.style.top = '-9999px';
        tempDiv.style.width = '420px';
        tempDiv.innerHTML = cardHtml;
        document.body.appendChild(tempDiv);

        await new Promise(r => setTimeout(r, 50));

        // 截图并过滤 oklch 样式
        const canvas = await html2canvas(tempDiv, {
            scale: 2,
            backgroundColor: null,
            useCORS: true,
            logging: false,
            onclone: (clonedDoc) => {
                // 移除包含 oklch 的第三方样式（与原有逻辑一致）
                clonedDoc.querySelectorAll('style').forEach(styleTag => {
                    if (styleTag.id !== 'bgm-share-card-style' && styleTag.innerHTML && styleTag.innerHTML.includes('oklch')) {
                        styleTag.remove();
                    }
                });
            }
        });

        tempDiv.remove();
        return canvas.toDataURL('image/png');
    }

    // 暴露全局 API（供客户端调用）
    window.BangumiShareCard = {
        generate: generateCardImageForClient,
        version: '2.4'
    };
    if (typeof unsafeWindow !== 'undefined') {
        unsafeWindow.BangumiShareCard = window.BangumiShareCard;
    }
    // ========== 新增代码结束 ==========
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', insertButton);
    else setTimeout(insertButton, 500);
})();