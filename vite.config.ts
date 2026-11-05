import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// GitHub Pages 项目站点地址为 https://<user>.github.io/leleat/
// 本地开发与 preview 也统一使用该 base，避免部署后才暴露路径问题。
export default defineConfig({
  plugins: [vue()],
  base: '/leleat/',
})
