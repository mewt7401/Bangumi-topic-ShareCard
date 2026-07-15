// ==UserScript==
// @name         Bangumi-topic-ShareCard
// @namespace    http://tampermonkey.net/
// @version      2.9
// @description  底部文字替换为 Logo 图片，移除 AI 标签，显示小组名称和回复数，保留布局样式与动画，布局配色方案优化，增加bangumi独家表情随机显示，增加点赞表情显示（复用tag样式），实现content-box内背景图片完美自适应高清显示，并附带随机偏移值。
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
/* v2.9 - 2025-05-01
 * - 优先匹配楼主GIF
 * - 新增检查GIF函数并整合随机匹配逻辑
 * - GIF静态截图帧优化到中间帧
 */
(function() {
    'use strict';

    let currentOverlay = null;

    const style = document.createElement('style');
    const CUSTOM_GIF_URL = (n=>`https://lain.bgm.tv/img/smiles/${n}/${n}_${Math.floor(Math.random()*117)+1}.gif`)(['musume','blake'][Math.random()<0.5?0:1]);//对应参数gifUrl，可选客制化内容：替代成100%个性化GIF图集，逻辑可调此处为演示。
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
            background: #F09199;
            transform: scale(1.1);
        }
        .close-overlay-btn:hover svg circle {
            stroke: white !important;
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
            width: 430px; background: rgba(40,40,40,0.85); border-radius: 20px; overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            box-shadow: 0 25px 60px rgba(0,0,0,0.5);
            backdrop-filter: blur(10px); cursor: default;
        }
        .card-top-bar { height: 0px; background: #F09199; }
        .card-header {
            position: relative;
            padding: 20px 30px 20px; display: flex; align-items: center; gap: 15px;
            background: rgba(40,40,40,0.85); backdrop-filter: blur(10px);
        }
        .card-header::after {
            content: '';
            position: absolute;
            bottom: 0;
            left: 7%;
            width: 86%;
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
        .user-meta { display: flex; flex-direction: column; justify-content: center; height: 54px; flex: 1; }
        .user-meta .name { font-weight: bold; color: #F09199; font-size: 17px; }
        .user-meta .time { font-size: 12px; color: #f0f0f0; margin-top: 4px; }
        .card-body { padding: 15px 30px 15px; background: rgba(40,40,40,0.85); backdrop-filter: blur(10px); }
        .main-title {
            font-size: 20px;
            color: #fff;
            margin: 0 0 15px;
            font-weight: 600;
            line-height: 1.4;    /* 新增，改善多行行距 */
        }
        /* 补充：为了保险，确保 content-box 本身没有负边距干扰 */
        .content-box {
            background: rgba(240, 145, 153, 0.2);  /* 极淡的粉色光晕 */
            padding: 20px;
            border-radius: 24px;
            position: relative;
            overflow: hidden; /* 必须加上，确保图片圆角不溢出 */
        }
        .content-box.hover-visible::after, .content-box:hover::after {
            content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0;
            border: 1px solid #F09199; border-radius: 24px; pointer-events: none;
        }
        .content-text { font-size: 14px; color: #fff; line-height: 1.8; white-space: pre-wrap; word-break: break-word;}
        /* 修改后的 tags-container 样式 */
        .tags-container {
            display: block;            /* 确保它是块级元素以应用外边距 */
            margin-top: 20px;          /* 这里设置与 content-box 之间的间距，建议 20px 视觉效果更好 */
            text-align: left;          /* 确保标签左对齐 */
            line-height: 1.5;          /* 给予标签换行时的行间距 */
        }
        /* 修改后的 tag-item 样式 */
        .tag-item {
            background: #FEEFF0;
            color: #F09199;
            font-size: 12px;
            padding: 0 12px;           /* 取消上下 padding，靠 line-height 撑起 */
            border-radius: 20px;
            font-weight: bold;
            border: 1px solid #F0919944;
            display: inline-block;
            height: 28px;              /* 显式设置高度 */
            line-height: 26px;         /* 略小于高度，确保文字垂直居中 */
            vertical-align: middle;
            white-space: nowrap;
            margin-bottom: 4px;        /* 防止换行时挤在一起 */
        }

        /* 统一内部元素的对齐 */
        .tag-item span {
            display: inline-block;
            vertical-align: top;       /* 改用 top 配合 line-height 往往比 middle 在截图时更稳 */
            line-height: 26px;
        }

        /* 表情图标专用对齐补丁 */
        .tag-item .like-emoji {
            width: 16px;
            height: 16px;
            background-size: contain;
            background-repeat: no-repeat;
            margin-top: 5px;           /* 手动微调垂直居中（(26-16)/2 = 5px） */
            margin-right: 4px;
        }

        /* 文字部分 */
        .tag-item .tag-text {
            display: inline-block;
        }
        .card-footer { position: relative;background: rgba(40,40,40,0.85); padding: 20px 30px; display: flex; justify-content: space-between; align-items: center; }
        .card-footer::before {
            content: '';
            position: absolute;
            top: 0;
            left: 7%;
            width: 86%;
            height: 1px;
            background: #B39CD0;
            border-radius: 1px;
            pointer-events: none;
        }
        .qr-img { background: rgba(40,40,40,0.85); width: 55px; height: 55px; }
        .footer-logo { height: 20px; width: auto; vertical-align: middle; margin-right: 4px; }
        #loading-info { position: fixed; top: 55%; left: 50%; transform: translateX(-50%); color: #fff; z-index: 100001; }
        .copy-success { position: fixed; top: 20px; right: 20px; background: #4CAF50; color: white; padding: 12px 20px; border-radius: 8px; z-index: 100002; }
        /* 让 tag 内的表情图标整齐显示 */

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

    function getContentSmileSrc(masterPost) {
        if (!masterPost) return null;
        const smileImgs = masterPost.querySelectorAll('.topic_content img.smile');
        for (const img of smileImgs) {
            let src = img.getAttribute('src');
            if (!src) continue;
            // 只匹配 musume 或 blake 的动态表情
            if (!src.includes('/musume/') && !src.includes('/blake/')) continue;

            // 统一处理成完整的 https 地址
            if (src.startsWith('//')) {
                src = 'https:' + src;
            } else if (src.startsWith('/')) {
                src = 'https://bgm.tv' + src;
            }
            return src;
        }
        return null;
    }

    async function getValidGifUrl(contentSmileSrc) {
        // 优先使用帖子自带的表情
        if (contentSmileSrc) return contentSmileSrc;

        const maxAttempts = 30;
        for (let i = 0; i < maxAttempts; i++) {
            const folder = ['musume', 'blake'][Math.random() < 0.5 ? 0 : 1];
            const num = Math.floor(Math.random() * 117) + 1;
            const url = `https://lain.bgm.tv/img/smiles/${folder}/${folder}_${num}.gif`;

            const base64 = await fetchAsBase64(url);
            // 简单有效性检查：返回的是正常的 GIF 数据
            if (base64 && base64.startsWith('data:image/gif') && base64.length > 100) {
                return url;
            }
        }

        // 全部失败时使用一个已知有效的回落图（你可以换成自己确认过的地址）
        console.warn('未找到有效 GIF，使用 fallback');
        return 'https://lain.bgm.tv/img/smiles/musume/musume_01.gif'; //GIF动态表情的原链接路由至少为2位数
    }

    // 高级 SVG 转高分辨率 PNG，可指定输出宽度（像素）
    function svgBase64ToHighResPng(svgBase64, outputWidth = 1200) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                let originalWidth = img.width;
                let originalHeight = img.height;

                // 如果 SVG 没有明确宽高，img.width/height 可能为 0，此时尝试估算比例
                if (originalWidth === 0 || originalHeight === 0) {
                    // 可以从 viewBox 解析，这里简单 fallback 为 1:1 比例
                    originalWidth = 100;
                    originalHeight = 100;
                }

                const ratio = outputWidth / originalWidth;
                const canvas = document.createElement('canvas');
                canvas.width = outputWidth;
                canvas.height = originalHeight * ratio;

                const ctx = canvas.getContext('2d');
                // 关闭抗锯齿可以让边缘更清晰（按需），通常保持默认即可
                ctx.imageSmoothingEnabled = true;
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                resolve(canvas.toDataURL('image/png'));
            };
            img.onerror = (err) => {
                console.error('SVG 加载失败', err);
                reject(err);
            };
            img.src = svgBase64;
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
        const randomVerticalPos = Math.floor(Math.random() * 101) + '%'; // 0%-100%页面背景随机数
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

        const contentSmileSrc = getContentSmileSrc(masterPost);//2.8更新content内检查GIF存在函数调用以及常量参数
        const gifUrl = await getValidGifUrl(contentSmileSrc);//2.g更新检查GIF非空专用函数

        // ----- 新增：收集点赞表情数据（url + 数量）-----
        const likeItems = [];
        const likesContainer = document.querySelector('.likes_grid');
        if (likesContainer) {
            const items = likesContainer.querySelectorAll('.item');
            for (const item of items) {
                const emojiSpan = item.querySelector('.emoji');
                let emojiUrl = '';
                if (emojiSpan) {
                    let bg = emojiSpan.style.backgroundImage;
                    let match = bg.match(/url\(["']?([^"']+)["']?\)/);
                    if (match) {
                        let url = match[1];
                        if (url.startsWith('/')) url = 'https://bgm.tv' + url;
                        emojiUrl = url;
                    }
                }
                const numSpan = item.querySelector('.num');
                const count = numSpan ? numSpan.innerText.trim() : '0';
                if (emojiUrl) likeItems.push({ emojiUrl, count });
            }
        }

        const backgroundUrl = 'https://lsky.ry.mk/i/2026/01/03/background.svg';
        // 批量获取所有 base64（头像、二维码、Logo、随机GIF、所有表情）
        const allUrls = [
            avatarUrl,
            `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(currentFullUrl)}&color=F09199&bgcolor=262626`,
            'https://bgm.tv/img/logo_riff.png',
            gifUrl,
            'https://lsky.ry.mk/i/2026/01/03/background.svg',
            ...likeItems.map(item => item.emojiUrl)
        ];
        const allBase64 = await Promise.all(allUrls.map(fetchAsBase64));

        const base64Avatar = allBase64[0];
        const base64QR = allBase64[1];
        const base64Logo = allBase64[2];
        const base64Gif = allBase64[3];
        const base64Bg = allBase64[4];
        const base64Emojis = allBase64.slice(5); // 与 likeItems 顺序对应

        // ★ 将 SVG 背景转换为 PNG 格式
        let base64BgPng = base64Bg; // 默认保留原数据，转换失败时降级
        if (base64Bg && base64Bg.startsWith('data:image/svg+xml')) {
            try {
                // 输出宽度设为 1200 像素，足够清晰
                base64BgPng = await svgBase64ToHighResPng(base64Bg, 2000);
            } catch (err) {
                console.warn('SVG 转高分辨率 PNG 失败，使用原图', err);
            }
        }

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

        // 构建 tags（小组 + 回复 + 点赞表情）
        let tagsHtml = `
            <span class="tag-item"><span class="tag-text">#${groupName}</span></span>
            <span class="tag-item"><span class="tag-text">#${replyCount}回复</span></span>
        `;

        for (let i = 0; i < likeItems.length; i++) {
            const item = likeItems[i];
            const emojiBase64 = base64Emojis[i];
            if (emojiBase64) {
                tagsHtml += `
                    <span class="tag-item">
                        <span class="like-emoji" style="background-image: url('${emojiBase64}');"></span>
                        <span class="tag-text">${item.count}</span>
                    </span>
                `;
            } else {
                // 即使是纯文字 👍 也要包装
                tagsHtml += `<span class="tag-item"><span class="tag-text">👍 ${item.count}</span></span>`;
            }
        }
        const finalTagsHtml = `<div class="tags-container">${tagsHtml}</div>`;

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
                           <div class="content-box" style="position: relative; overflow: hidden; padding: 0;">
                              <img src="${base64BgPng}" style="position: absolute; top: 0; left: 0; width: 100%; height: auto; z-index: 0;">
                              <p class="content-text" style="position: relative; z-index: 1; padding: 20px; background: transparent; margin: 0;">${displayContent}</p>
                           </div>
                        ${finalTagsHtml}
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
        const contentBox = overlay.querySelector('.content-box');
        const bgImg = contentBox?.querySelector('img');
        if (bgImg && contentBox) {
            // 等待图片加载完成，获取真实尺寸
            bgImg.onload = () => {
                const containerHeight = contentBox.clientHeight;
                const imgHeight = bgImg.clientHeight;
                if (imgHeight > containerHeight) {
                    const maxOffset = imgHeight - containerHeight; // 可移动的最大距离（像素）
                    const randomOffset = Math.random() * maxOffset; // 随机偏移量（像素）
                    bgImg.style.top = `-${randomOffset}px`; // 向上移动
                } else {
                    bgImg.style.top = '0'; // 图片不够高，不移动
                }
            };
            // 如果图片已经加载完成，手动触发
            if (bgImg.complete) bgImg.onload();
        }

        document.body.appendChild(overlay);
        currentOverlay = overlay;


        // 为关闭按钮添加 SVG 圆环动画+旋转效果，并支持 hover 暂停
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
            circle.setAttribute("stroke", "#F09199");
            circle.setAttribute("stroke-width", "2");
            circle.setAttribute("stroke-dasharray", "125.66");
            circle.setAttribute("stroke-dashoffset", "125.66");
            circle.style.animation = "drawCircle 15s linear forwards";

            svg.appendChild(circle);
            closeBtn.style.position = "fixed";
            closeBtn.appendChild(svg);

            // 鼠标悬停时暂停动画，移出时恢复
            closeBtn.addEventListener('mouseenter', () => {
                svg.style.animationPlayState = 'paused';
                circle.style.animationPlayState = 'paused';
            });
            closeBtn.addEventListener('mouseleave', () => {
                svg.style.animationPlayState = 'running';
                circle.style.animationPlayState = 'running';
            });
        }

/*         // 自动关闭计时器（15秒）
        const autoCloseTimer = setTimeout(() => {
            if (currentOverlay) removeOverlay();
        }, 15000);
        overlay._autoCloseTimer = autoCloseTimer; */

        setTimeout(async () => {
            const captureArea = document.querySelector('#capture-area');
            if (!captureArea) return;

            // ★ 延迟 700ms 让 GIF 播放到中间，然后抓取当前帧的静态图
            const headerGifImg = captureArea.querySelector('.header-gif img');
            let staticFrame = null;
            if (headerGifImg && headerGifImg.complete) {
                const frameCanvas = document.createElement('canvas');
                frameCanvas.width = headerGifImg.naturalWidth;
                frameCanvas.height = headerGifImg.naturalHeight;
                const fctx = frameCanvas.getContext('2d');
                fctx.drawImage(headerGifImg, 0, 0);
                staticFrame = frameCanvas.toDataURL('image/png'); // 当前帧的静态图
            }

            const contentBox = captureArea.querySelector('.content-box');
            if (contentBox) contentBox.classList.add('hover-visible');
            await new Promise(r => setTimeout(r, 50));

            try {
                const canvas = await html2canvas(captureArea, {
                    scale: 3,
                    backgroundColor: null,
                    useCORS: true,
                    logging: false,
                    onclone: (clonedDoc, element) => {
                        clonedDoc.querySelectorAll('style').forEach(styleTag => {
                            if (styleTag.id !== 'bgm-share-card-style' && styleTag.innerHTML.includes('oklch')) {
                                styleTag.remove();
                            }
                        });
                        // ★ 在克隆文档中将动态 GIF 替换为刚才抓取的静态帧
                        if (staticFrame) {
                            const clonedGifImg = clonedDoc.querySelector('.header-gif img');
                            if (clonedGifImg) {
                                clonedGifImg.src = staticFrame;
                            }
                        }
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
        }, 700);
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

    // 供客户端调用的 API（不改变原有功能）
    async function generateCardImageForClient() {
        if (typeof html2canvas === 'undefined') {
            for (let i = 0; i < 50; i++) {
                await new Promise(r => setTimeout(r, 100));
                if (typeof html2canvas !== 'undefined') break;
            }
            if (typeof html2canvas === 'undefined') {
                throw new Error('html2canvas 加载失败，请刷新页面重试');
            }
        }

        // 数据抓取（与 createShareImage 完全一致，但省略显示 overlay 部分）
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

        const contentSmileSrc = getContentSmileSrc(masterPost);
        const gifUrl = await getValidGifUrl(contentSmileSrc);

        // 点赞数据收集
        const likeItems = [];
        const likesContainer = document.querySelector('.likes_grid');
        if (likesContainer) {
            const items = likesContainer.querySelectorAll('.item');
            for (const item of items) {
                const emojiSpan = item.querySelector('.emoji');
                let emojiUrl = '';
                if (emojiSpan) {
                    let bg = emojiSpan.style.backgroundImage;
                    let match = bg.match(/url\(["']?([^"']+)["']?\)/);
                    if (match) {
                        let url = match[1];
                        if (url.startsWith('/')) url = 'https://bgm.tv' + url;
                        emojiUrl = url;
                    }
                }
                const numSpan = item.querySelector('.num');
                const count = numSpan ? numSpan.innerText.trim() : '0';
                if (emojiUrl) likeItems.push({ emojiUrl, count });
            }
        }

        const allUrls = [
            avatarUrl,
            `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(currentFullUrl)}&color=F09199&bgcolor=262626`,
            'https://bgm.tv/img/logo_riff.png',
            gifUrl,
            'https://lsky.ry.mk/i/2026/01/03/background.svg',
            ...likeItems.map(item => item.emojiUrl)
        ];
        const allBase64 = await Promise.all(allUrls.map(fetchAsBase64));

        const base64Avatar = allBase64[0];
        const base64QR = allBase64[1];
        const base64Logo = allBase64[2];
        const base64Gif = allBase64[3];
        const base64Bg = allBase64[4];
        const base64Emojis = allBase64.slice(5);

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

        let tagsHtml = `
            <span class="tag-item">#${groupName}</span>
            <span class="tag-item">#${replyCount}回复</span>
        `;
        for (let i = 0; i < likeItems.length; i++) {
            const item = likeItems[i];
            const emojiBase64 = base64Emojis[i];
            if (emojiBase64) {
                tagsHtml += `
                    <span class="tag-item">
                        <span class="like-emoji" style="background-image: url('${emojiBase64}');"></span>
                        <span>${item.count}</span>
                    </span>
                `;
            } else {
                tagsHtml += `<span class="tag-item">👍 ${item.count}</span>`;
            }
        }
        const finalTagsHtml = `<div class="tags-container">${tagsHtml}</div>`;

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
                <div class="content-box">
                    <!-- 1. 直接在这里插入背景图标签 -->
                      <img src="${base64Bg}"
                      style="position:absolute; top:0; left:0; width:100%; height:100%; object-fit:cover; z-index:0; pointer-events:none;">

                    <!-- 2. 确保文字在图片上方 -->
                    <p class="content-text" style="position:relative; z-index:1;">${displayContent}</p>
                </div>
                ${finalTagsHtml}
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

        // ★ 抓取当前帧的静态图
        const headerGifImg = tempDiv.querySelector('.header-gif img');
        let staticFrame = null;
        if (headerGifImg && headerGifImg.complete) {
            const frameCanvas = document.createElement('canvas');
            frameCanvas.width = headerGifImg.naturalWidth;
            frameCanvas.height = headerGifImg.naturalHeight;
            frameCanvas.getContext('2d').drawImage(headerGifImg, 0, 0);
            staticFrame = frameCanvas.toDataURL('image/png');
        }

        const canvas = await html2canvas(tempDiv, {
            scale: 2,
            backgroundColor: null,
            useCORS: true,
            logging: false,
            onclone: (clonedDoc) => {
                clonedDoc.querySelectorAll('style').forEach(styleTag => {
                    if (styleTag.id !== 'bgm-share-card-style' && styleTag.innerHTML && styleTag.innerHTML.includes('oklch')) {
                        styleTag.remove();
                    }
                });
                // ★ 替换克隆文档中的 GIF
                if (staticFrame) {
                    const clonedGifImg = clonedDoc.querySelector('.header-gif img');
                    if (clonedGifImg) {
                        clonedGifImg.src = staticFrame;
                    }
                }
            }
        });

        tempDiv.remove();
        return canvas.toDataURL('image/png');
    }

    window.BangumiShareCard = {
        generate: generateCardImageForClient,
        version: '2.5'
    };
    if (typeof unsafeWindow !== 'undefined') {
        unsafeWindow.BangumiShareCard = window.BangumiShareCard;
    }

    setupGlobalClickHandler();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', insertButton);
    else setTimeout(insertButton, 500);
})();