/* ============================================================
   UrbanAlert - API Client
   Toda comunicação com o backend Python (FastAPI) passa por aqui
   ============================================================ */

const BASE_URL = '/api';

function getToken() {
  return localStorage.getItem('ua_token');
}

function setToken(token) {
  localStorage.setItem('ua_token', token);
}

function removeToken() {
  localStorage.removeItem('ua_token');
  localStorage.removeItem('ua_user');
}

function getUser() {
  const u = localStorage.getItem('ua_user');
  return u ? JSON.parse(u) : null;
}

function setUser(user) {
  localStorage.setItem('ua_user', JSON.stringify(user));
}

async function apiFetch(endpoint, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Erro na requisição');
  }

  return data;
}

// ---- AUTH ----
const Auth = {
  async login(email, senha) {
    const data = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, senha }),
    });
    setToken(data.token);
    setUser(data.user);
    return data;
  },

  async register(nome, email, senha, role) {
    const data = await apiFetch('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ nome, email, senha, role }),
    });
    setToken(data.token);
    setUser(data.user);
    return data;
  },

  async me() {
    return apiFetch('/auth/me');
  },

  async updateMe(dados) {
    return apiFetch('/auth/me', { method: 'PUT', body: JSON.stringify(dados) });
  },

  async updateSenha(senhaAtual, novaSenha) {
    return apiFetch('/auth/me/senha', {
      method: 'PUT',
      body: JSON.stringify({ senhaAtual, novaSenha }),
    });
  },

  logout() {
    removeToken();
  },

  isLoggedIn() {
    return !!getToken();
  },
};

// ---- OCORRÊNCIAS ----
const Ocorrencias = {
  async listar(params = {}) {
    const query = new URLSearchParams(params).toString();
    return apiFetch(`/ocorrencias?${query}`);
  },

  async buscar(id) {
    return apiFetch(`/ocorrencias/${id}`);
  },

  async criar(dados) {
    return apiFetch('/ocorrencias', { method: 'POST', body: JSON.stringify(dados) });
  },

  async atualizar(id, dados) {
    return apiFetch(`/ocorrencias/${id}`, { method: 'PUT', body: JSON.stringify(dados) });
  },

  async remover(id) {
    return apiFetch(`/ocorrencias/${id}`, { method: 'DELETE' });
  },

  async comentar(id, texto) {
    return apiFetch(`/ocorrencias/${id}/comentarios`, {
      method: 'POST',
      body: JSON.stringify({ texto }),
    });
  },

  async dashboard() {
    return apiFetch('/ocorrencias/dashboard');
  },
};

// ---- CATEGORIAS ----
const Categorias = {
  async listar() {
    return apiFetch('/categorias');
  },

  async criar(dados) {
    return apiFetch('/categorias', { method: 'POST', body: JSON.stringify(dados) });
  },

  async atualizar(id, dados) {
    return apiFetch(`/categorias/${id}`, { method: 'PUT', body: JSON.stringify(dados) });
  },

  async remover(id) {
    return apiFetch(`/categorias/${id}`, { method: 'DELETE' });
  },
};

// ---- NOTIFICAÇÕES ----
const Notificacoes = {
  async listar() {
    return apiFetch('/notificacoes');
  },

  async lerTodas() {
    return apiFetch('/notificacoes/ler-todas', { method: 'PUT' });
  },

  async lerUma(id) {
    return apiFetch(`/notificacoes/${id}/ler`, { method: 'PUT' });
  },
};

// ---- USUÁRIOS (admin) ----
const Usuarios = {
  async listar() {
    return apiFetch('/usuarios');
  },

  async remover(id) {
    return apiFetch(`/usuarios/${id}`, { method: 'DELETE' });
  },
};
