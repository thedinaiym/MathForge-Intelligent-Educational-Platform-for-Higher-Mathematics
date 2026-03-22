/**
 * Axios instance with:
 * - baseURL direct to FastAPI backend (bypassing Vite proxy)
 * - Accept-Language interceptor (CLAUDE.md requirement)
 * - Authorization Bearer token injected from Supabase session
 */
import axios from 'axios'
import i18n from '../i18n'
import { supabase } from './supabase'

const api = axios.create({
  // 🔥 ИЗМЕНЕНИЕ ЗДЕСЬ: Указываем полный адрес бэкенда
  baseURL: 'http://127.0.0.1:8000/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 8000, // 8s — fail fast when backend is down
})

// Attach Accept-Language and Bearer token on every request
api.interceptors.request.use(async (config) => {
  config.headers['Accept-Language'] = i18n.language || 'ru'

  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (session?.access_token) {
    config.headers['Authorization'] = `Bearer ${session.access_token}`
  }

  return config
})

export default api