const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const url = require('url');

const DATA_PATH = path.join(__dirname, '..', 'data', 'workflows.json');

const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    if (pathname === '/' || pathname === '/manager.html') {
        const html = await fs.readFile(path.join(__dirname, 'manager.html'), 'utf8');
        res.setHeader('Content-Type', 'text/html;charset=utf-8');
        res.end(html);
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
        res.setHeader('Content-Type', 'application/json;charset=utf-8');
        if (item) {
            res.end(JSON.stringify({ success: true, data: item }));
        } else {
            res.end(JSON.stringify({ success: false, message: '未找到该ID的数据' }));
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
                res.setHeader('Content-Type', 'application/json;charset=utf-8');
                if (index === -1) {
                    res.end(JSON.stringify({ success: false, message: '未找到该ID的数据' }));
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
                res.end(JSON.stringify({ success: true, data: data[index] }));
            } catch (err) {
                res.setHeader('Content-Type', 'application/json;charset=utf-8');
                res.end(JSON.stringify({ success: false, message: err.message }));
            }
        });
        return;
    }

    res.writeHead(404);
    res.end('页面不存在 404');
});

server.listen(3001, () => {
    console.log('服务启动成功，访问地址：http://localhost:3001');
});
