import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// ЗАМЕНИ <REPO_NAME> на имя твоего репозитория
export default defineConfig({
  plugins: [vue()],
  base: '/<REPO_NAME>/',   // например '/drum-visualizer-vue/'
})
