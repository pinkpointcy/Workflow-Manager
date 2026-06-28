const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const url = require('url');
const { exec } = require('child_process');

const DATA_PATH = path.join(__dirname, '..', 'data', 'workflows.json');
const HTML_DIR = __dirname;
const START_PORT = 3000;
const MAX_PORT_TRIES = 10;

function findPortPid(port) {
    return new Promise((resolve) => {
        if (process.platform !== 'win32') { resolve(null); return; }
        exec(`netstat -ano | findstr ":${port}" | findstr LISTENING`, (err, stdout) => {
            if (err || !stdout.trim()) { resolve(null); return; }
            const lines = stdout.trim().split(/\r?\n/);
            const pids = new Set();
            lines.forEach(line => {
                const parts = line.trim().split(/\s+/);
                const pid = parts[parts.length - 1];
                if (pid && /^\d+$/.test(pid)) pids.add(pid);
            });
            resolve(pids.size ? Array.from(pids) : null);
        });
    });
}

function openBrowser(url) {
    const cmd = process.platform === 'win32'
        ? `start "" "${url}"`
        : process.platform === 'darwin'
            ? `open "${url}"`
            : `xdg-open "${url}"`;
    exec(cmd, (err) => {
        if (err) console.log('[提示] 未能自动打开浏览器，请手动访问：' + url);
    });
}

function startListen(port, tries = 0) {
    server.removeAllListeners('error');
    server.once('error', async (err) => {
        if (err.code === 'EADDRINUSE' && tries < MAX_PORT_TRIES) {
            const pids = await findPortPid(port);
            console.log(`[提示] 端口 ${port} 已被占用。`);
            if (pids) {
                console.log(`       占用进程 PID：${pids.join(', ')}`);
                console.log(`       可在 PowerShell 中执行： Stop-Process -Id ${pids.join(',')} -Force  结束占用后重试`);
            }
            const nextPort = port + 1;
            console.log(`       自动尝试下一端口 ${nextPort} ...\n`);
            startListen(nextPort, tries + 1);
        } else {
            console.error('启动失败：', err.message);
            process.exit(1);
        }
    });
    server.listen(port, () => {
        const url = 'http://localhost:' + port;
        console.log('服务启动成功，访问地址：' + url);
        setTimeout(() => openBrowser(url), 300);
    });
}

const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = decodeURIComponent(parsedUrl.pathname || '/');

    const MIME = {
        '.html': 'text/html;charset=utf-8',
        '.css': 'text/css;charset=utf-8',
        '.js': 'application/javascript;charset=utf-8',
        '.json': 'application/json;charset=utf-8',
        '.svg': 'image/svg+xml',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.ico': 'image/x-icon',
        '.txt': 'text/plain;charset=utf-8',
    };

    function safeJoin(base, relPath) {
        const target = path.resolve(base, '.' + relPath);
        if (!target.startsWith(base)) return null;
        return target;
    }

    async function serveStatic(rel) {
        let relPath = rel;
        if (relPath.endsWith('/')) relPath = relPath + 'index.html';
        const filePath = safeJoin(HTML_DIR, relPath);
        if (!filePath) return false;
        try {
            const stat = await fs.stat(filePath).catch(() => null);
            if (!stat || !stat.isFile()) return false;
            const ext = path.extname(filePath).toLowerCase();
            const contentType = MIME[ext] || 'application/octet-stream';
            const content = await fs.readFile(filePath);
            res.setHeader('Content-Type', contentType);
            res.end(content);
            return true;
        } catch (e) {
            return false;
        }
    }

    const sendJson = (data, status = 200) => {
        res.writeHead(status, { 'Content-Type': 'application/json;charset=utf-8' });
        res.end(JSON.stringify(data));
    };

    if (pathname === '/' || pathname === '/index.html') {
        if (await serveStatic(pathname)) return;
    }

    if (pathname === '/organize.html' || pathname === '/workflow.html' || pathname === '/manager.html') {
        if (await serveStatic(pathname)) return;
    }

    if (pathname === '/getJson') {
        const jsonText = await fs.readFile(DATA_PATH, 'utf8');
        res.setHeader('Content-Type', 'application/json;charset=utf-8');
        res.end(jsonText);
        return;
    }

    if (pathname === '/getAll') {
        const jsonText = await fs.readFile(DATA_PATH, 'utf8');
        res.setHeader('Content-Type', 'application/json;charset=utf-8');
        res.end(jsonText);
        return;
    }

    if (pathname === '/getById') {
        const id = parseInt(parsedUrl.query.id, 10);
        const raw = await fs.readFile(DATA_PATH, 'utf8');
        const data = JSON.parse(raw);
        const item = data.find(it => it.id === id);
        if (item) {
            sendJson({ success: true, data: item });
        } else {
            sendJson({ success: false, message: '未找到该ID的数据' });
        }
        return;
    }

    if (pathname === '/updateById' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
            try {
                const payload = JSON.parse(body);
                const id = parseInt(payload.id, 10);
                const raw = await fs.readFile(DATA_PATH, 'utf8');
                const data = JSON.parse(raw);
                const index = data.findIndex(it => it.id === id);
                if (index === -1) {
                    sendJson({ success: false, message: '未找到该ID的数据' });
                    return;
                }
                const allowedFields = ['id', 'name', 'description', 'type', 'status', 'log', 'version', 'steps', 'foundation', 'link'];
                const complexFields = ['log', 'version', 'steps', 'foundation', 'link'];
                allowedFields.forEach(field => {
                    if (payload[field] !== undefined) {
                        if (field === 'id') {
                            data[index][field] = parseInt(payload[field], 10);
                        } else if (complexFields.includes(field)) {
                            try {
                                data[index][field] = typeof payload[field] === 'string'
                                    ? JSON.parse(payload[field])
                                    : payload[field];
                            } catch (e) {
                                data[index][field] = payload[field];
                            }
                        } else {
                            data[index][field] = payload[field];
                        }
                    }
                });
                await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2), 'utf8');
                sendJson({ success: true, data: data[index] });
            } catch (err) {
                sendJson({ success: false, message: err.message }, 400);
            }
        });
        return;
    }

    if (await serveStatic(pathname)) return;

    res.writeHead(404, { 'Content-Type': 'text/plain;charset=utf-8' });
    res.end('页面不存在 404');
});

startListen(START_PORT);
// 保存