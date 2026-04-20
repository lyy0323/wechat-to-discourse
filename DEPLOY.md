# 内容搬运工具 — 服务器部署指南

本文档指导你在 `yuan.sjtuguoxue.space` 同一台服务器上部署内容搬运工具，使用子域名 `mover.sjtuguoxue.space`。

---

## 前置条件

- 服务器已运行 Discourse 论坛（`yuan.sjtuguoxue.space`）
- 宿主机有 nginx 做反向代理
- 已安装 Node.js 18+（`node -v` 检查）
- 已安装 certbot（用于 HTTPS）
- 有服务器 sudo 权限

> **如果没有 Node.js**，先安装：
> ```bash
> curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
> sudo apt install -y nodejs
> ```

---

## 第一步：确认 nginx 状态

```bash
sudo ss -tlnp | grep ':80'
```

- 如果输出包含 `nginx` → 正常，继续
- 如果输出包含 `docker-proxy` → Discourse 容器直接占用了 80 端口，需要先迁移到宿主机 nginx 代理模式，参考 [Discourse 官方文档](https://meta.discourse.org/t/running-other-websites-on-the-same-machine-as-discourse/17247)

---

## 第二步：DNS

在域名管理面板添加一条 A 记录：

| 类型 | 主机记录 | 记录值 |
|------|---------|--------|
| A | mover | 和 yuan 论坛相同的服务器 IP |

---

## 第三步：拉取代码并构建

```bash
cd /opt
sudo git clone https://github.com/lyy0323/wechat-to-discourse.git
sudo chown -R $USER:$USER wechat-to-discourse
cd wechat-to-discourse
npm install
```

### 配置环境变量

```bash
cp .env.example .env.local
nano .env.local
```

填入以下内容：

```
DISCOURSE_URL=https://yuan.sjtuguoxue.space
DISCOURSE_API_KEY=（见下方「获取 API Key」）
DISCOURSE_CONNECT_SECRET=（自定义一个随机字符串，至少 10 位）
SESSION_SECRET=（另一个随机字符串，至少 32 位）
NEXT_PUBLIC_APP_URL=https://mover.sjtuguoxue.space
```

> **生成随机字符串：** `openssl rand -hex 32`

### 构建

```bash
npm run build
```

确认输出包含 `✓ Generating static pages` 且无报错。

---

## 第四步：创建系统服务

```bash
sudo tee /etc/systemd/system/wechat-mover.service <<'EOF'
[Unit]
Description=Content Mover for Discourse
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/wechat-to-discourse
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=5
Environment=PORT=3010
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
```

```bash
# 让 www-data 用户能读取项目文件
sudo chown -R www-data:www-data /opt/wechat-to-discourse

# 启动服务
sudo systemctl daemon-reload
sudo systemctl enable --now wechat-mover

# 检查是否正常运行
sudo systemctl status wechat-mover
curl -s http://127.0.0.1:3010 | head -5
```

---

## 第五步：配置 nginx

```bash
sudo tee /etc/nginx/sites-available/mover.sjtuguoxue.space <<'EOF'
server {
    listen 80;
    server_name mover.sjtuguoxue.space;

    location / {
        proxy_pass http://127.0.0.1:3010;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
        client_max_body_size 20m;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/mover.sjtuguoxue.space /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

---

## 第六步：启用 HTTPS

```bash
sudo certbot --nginx -d mover.sjtuguoxue.space
```

certbot 会自动修改 nginx 配置，添加 443 监听和证书。

验证：浏览器访问 `https://mover.sjtuguoxue.space`，应看到登录页面。

---

## 第七步：配置 Discourse 论坛

需要论坛管理员在 Discourse 后台做以下配置：

### 7.1 启用 DiscourseConnect Provider

管理后台 → 设置 → 搜索 `discourse connect`：

1. **开启** `enable discourse connect provider`
2. 在 `discourse connect provider secrets` 中添加一行：

| 域名（URL） | 密钥 |
|-------------|------|
| `mover.sjtuguoxue.space` | （与 .env.local 中的 `DISCOURSE_CONNECT_SECRET` 相同） |

### 7.2 获取 API Key

管理后台 → API → 新建 Key：

| 配置项 | 值 |
|-------|-----|
| 描述 | `content-mover` |
| 用户级别 | **全部用户** |
| 范围 | 「全部」或勾选 `posts:create` + `uploads:create` |

生成后将 key 复制到服务器上 `/opt/wechat-to-discourse/.env.local` 的 `DISCOURSE_API_KEY` 字段。

修改 env 后重启服务：

```bash
sudo systemctl restart wechat-mover
```

---

## 验证清单

- [ ] DNS 已生效：`dig mover.sjtuguoxue.space` 返回正确 IP
- [ ] 服务运行中：`sudo systemctl status wechat-mover` 显示 active
- [ ] nginx 正常：`curl -I https://mover.sjtuguoxue.space` 返回 200
- [ ] 登录可用：点击「通过论坛账号登录」能跳转到论坛并返回
- [ ] 发布可用：粘贴一篇文章链接，选分类，勾选声明，点发布

---

## 故障排查

```bash
# 查看应用日志
sudo journalctl -u wechat-mover -f

# 查看 nginx 错误日志
sudo tail -f /var/log/nginx/error.log

# 检查端口占用
sudo ss -tlnp | grep 3010

# 重启服务
sudo systemctl restart wechat-mover
```

---

## 请求链路

```
浏览器 → mover.sjtuguoxue.space
       → nginx (:443, TLS 终止)
       → 127.0.0.1:3010 (Next.js)
       → yuan.sjtuguoxue.space (Discourse API)
```

两个站点共享同一个 nginx 的 80/443 端口，按域名分流，互不干扰。
