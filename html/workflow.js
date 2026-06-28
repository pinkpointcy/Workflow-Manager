const http = require('http');
const fs = require('fs/promises');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', 'data', 'workflows.json');
const HTML_PATH = path.join(__dirname, 'workflow.html');

const server = http.createServer(async (req, res) => {
    if (req.url === '/') {
        const html = await fs.readFile(HTML_PATH, 'utf8');
        res.setHeader('Content-Type', 'text/html;charset=utf-8');
        res.end(html);
        return;
    }

    if (req.url === '/getJson') {
        const jsonText = await fs.readFile(DATA_PATH, 'utf8');
        res.setHeader('Content-Type', 'application/json;charset=utf-8');
        res.end(jsonText);
        return;
    }

    res.writeHead(404);
    res.end('页面不存在 404');
});

server.listen(3000, () => {
    console.log('服务启动成功，访问地址：http://localhost:3000');
});
