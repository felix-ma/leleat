import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

/** 构建时取当前 Git 提交，打在页面页脚上，用来分辨浏览器/CDN 是否还在用旧包。 */
function currentCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return 'unknown'
  }
}

// GitHub Pages 项目站点地址为 https://<user>.github.io/leleat/
// 本地开发与 preview 也统一使用该 base，避免部署后才暴露路径问题。
export default defineConfig({
  plugins: [vue()],
  base: '/leleat/',
  define: {
    __BUILD_COMMIT__: JSON.stringify(currentCommit()),
  },
})
