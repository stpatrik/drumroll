import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// замените drumroll на имя вашего репозитория
export default defineConfig({
  plugins: [vue()],
  base: '/drumroll/',  // обязательно c косой чертой в начале и конце
})