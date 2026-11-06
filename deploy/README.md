# 生产部署

推荐使用一台 Linux 云服务器，通过 Nginx 反向代理 Node 服务。当前项目不依赖 npm 包，不需要上传 `node_modules`。

## 1. 只上传运行文件

需要的文件：

- `server.mjs`
- `outputs/`
- `package.json`
- `README.md`
- `.env.example`
- `deploy/`

不要上传 `.env`、`work/`、`node_modules/`、`edge-*`、`dist/` 或浏览器 profile。`.env` 必须在服务器上单独创建。

Windows PowerShell 打包：

```powershell
tar -czf off-course-deploy.tgz server.mjs outputs package.json README.md .env.example deploy
scp .\off-course-deploy.tgz root@你的服务器IP:/tmp/
```

## 2. 安装运行环境（Ubuntu/Debian）

```bash
sudo apt update
sudo apt install -y nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version
```

创建非 root 运行用户和目录：

```bash
sudo useradd --system --create-home --home-dir /opt/off-course --shell /usr/sbin/nologin offcourse || true
sudo tar -xzf /tmp/off-course-deploy.tgz -C /opt/off-course
sudo chown -R offcourse:offcourse /opt/off-course
```

## 3. 在服务器创建 `.env`

```bash
sudo cp /opt/off-course/.env.example /opt/off-course/.env
sudo nano /opt/off-course/.env
sudo chown offcourse:offcourse /opt/off-course/.env
sudo chmod 600 /opt/off-course/.env
```

生产配置至少确认：

```dotenv
ARK_API_KEY=你的真实Key
OPENAI_BASE_URL=https://ark.cn-beijing.volces.com/api/plan/v3
OPENAI_MODEL=ark-code-latest
HOST=127.0.0.1
PORT=8787
TRUST_PROXY=1
```

Node 服务需要能访问 `ark.cn-beijing.volces.com`、`open.feedcoopapi.com` 和 `*.byteimg.com`。如果云防火墙限制出站，请放行这些域名。

## 4. 安装 systemd 服务

```bash
sudo cp /opt/off-course/deploy/off-course.service /etc/systemd/system/off-course.service
sudo systemctl daemon-reload
sudo systemctl enable --now off-course
sudo systemctl status off-course --no-pager
curl http://127.0.0.1:8787/api/health
```

查看日志：

```bash
sudo journalctl -u off-course -f
```

## 5. 配置 Nginx 和 HTTPS

先把 `deploy/nginx-off-course.conf` 中的 `travel.example.com` 改成你的域名，再执行：

```bash
sudo cp /opt/off-course/deploy/nginx-off-course.conf /etc/nginx/sites-available/off-course
sudo ln -sf /etc/nginx/sites-available/off-course /etc/nginx/sites-enabled/off-course
sudo nginx -t
sudo systemctl reload nginx
```

域名 A 记录指向服务器后，申请 HTTPS：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d travel.example.com
```

如果服务器位于中国大陆，绑定域名前通常需要完成 ICP 备案；香港或海外服务器不适用这一要求。

云服务器安全组只开放 `22`、`80`、`443`，不要开放 `8787`。Nginx 的 `proxy_read_timeout` 必须保持约 `200s`，否则严肃版长行程会被 504 截断。

## 6. 后续更新

本地重新打包后上传，解压覆盖运行文件，再重启：

```bash
sudo tar -xzf /tmp/off-course-deploy.tgz -C /opt/off-course
sudo chown -R offcourse:offcourse /opt/off-course
sudo systemctl restart off-course
```

`.env` 不在压缩包内，不会被覆盖。
