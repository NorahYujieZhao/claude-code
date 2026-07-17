CLAUDE_CODE_USE_VERTEX=1

ANTHROPIC_VERTEX_PROJECT_ID=你的-gcp-project-id
GOOGLE_CLOUD_PROJECT=你的-gcp-project-id

CLOUD_ML_REGION=us-east5

ANTHROPIC_MODEL=claude-sonnet-4-6
ANTHROPIC_SMALL_FAST_MODEL=claude-haiku-4-5@20251001

之后每次进入项目运行：
cd /Users/yujiezhao/claude-code
bun run dev
或者：
bun dist/cli.mjs
Bun 都会自动加载 .env.local。
验证：
cd /Users/yujiezhao/claude-code

bun --print 'process.env.CLAUDE_CODE_USE_VERTEX'
bun --print 'process.env.ANTHROPIC_VERTEX_PROJECT_ID'
bun --print 'process.env.ANTHROPIC_MODEL'
应该分别输出 1、项目 ID 和模型名。


或者：
bun dist/cli.mjs
Bun 都会自动加载 .env.local。
验证：
cd /Users/yujiezhao/claude-code

bun --print 'process.env.CLAUDE_CODE_USE_VERTEX'
bun --print 'process.env.ANTHROPIC_VERTEX_PROJECT_ID'
bun --print 'process.env.ANTHROPIC_MODEL'
应该分别输出 1、项目 ID 和模型名。
注意：当前仓库根目录没有 .gitignore。请在 .git/info/exclude 中加入：
.env
.env.local
.envrc
这样配置只保留在本机，不会被提交。
方案二：进入目录后整个终端自动生效
如果你希望 cd 到项目目录时变量自动出现在当前终端，离开目录后自动清除，推荐 direnv。
macOS 安装：
brew install direnv
在 ~/.zshrc 最后加入：
eval "$(direnv hook zsh)"
重新打开终端，或者执行：
source ~/.zshrc
然后在项目根目录创建 .envrc：
cd /Users/yujiezhao/claude-code
.envrc 内容：
dotenv .env.local
首次允许加载：
direnv allow
以后进入目录时：
cd /Users/yujiezhao/claude-code
变量会自动加载。验证：
echo "$CLAUDE_CODE_USE_VERTEX"
echo "$ANTHROPIC_VERTEX_PROJECT_ID"
echo "$ANTHROPIC_MODEL"
direnv 的 Zsh 配置方式见官方文档。
另外，Google ADC 登录信息不应该写进 .env.local。执行一次：
gcloud auth application-default login
凭据会由 gcloud 单独持久保存。这个仓库也不是 Python 项目，因此不建议直接修改 .venv/bin/activate；使用 .env.local + direnv 更稳妥。