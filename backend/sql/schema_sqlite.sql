-- UrbanAlert - Schema SQLite (uso local, sem instalar banco). Idempotente.

CREATE TABLE IF NOT EXISTS usuarios (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nome        TEXT    NOT NULL,
  email       TEXT    NOT NULL UNIQUE,
  senha_hash  TEXT    NOT NULL,
  role        TEXT    NOT NULL DEFAULT 'cidadao' CHECK (role IN ('admin','fiscal','cidadao')),
  bio         TEXT,
  ativo       INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categorias (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  nome        TEXT    NOT NULL,
  icone       TEXT,
  cor         TEXT    DEFAULT '#74b9ff',
  descricao   TEXT,
  ativo       INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ocorrencias (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo        TEXT    NOT NULL,
  descricao     TEXT    NOT NULL,
  endereco      TEXT    NOT NULL,
  status        TEXT    NOT NULL DEFAULT 'Aberta'
                CHECK (status IN ('Aberta','Em Análise','Em Execução','Resolvida','Encerrada')),
  prioridade    TEXT    NOT NULL DEFAULT 'Média' CHECK (prioridade IN ('Baixa','Média','Alta')),
  lat           REAL,
  lng           REAL,
  fotos         TEXT    NOT NULL DEFAULT '[]',
  categoria_id  INTEGER NOT NULL REFERENCES categorias(id) ON DELETE RESTRICT,
  usuario_id    INTEGER NOT NULL REFERENCES usuarios(id)   ON DELETE CASCADE,
  created_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS comentarios (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  texto         TEXT    NOT NULL,
  ocorrencia_id INTEGER NOT NULL REFERENCES ocorrencias(id) ON DELETE CASCADE,
  usuario_id    INTEGER NOT NULL REFERENCES usuarios(id)    ON DELETE CASCADE,
  created_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS historico_ocorrencias (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ocorrencia_id INTEGER NOT NULL REFERENCES ocorrencias(id) ON DELETE CASCADE,
  usuario_id    INTEGER NOT NULL REFERENCES usuarios(id)    ON DELETE CASCADE,
  acao          TEXT    NOT NULL,
  created_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notificacoes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id    INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  titulo        TEXT    NOT NULL,
  mensagem      TEXT    NOT NULL,
  tipo          TEXT    NOT NULL DEFAULT 'info' CHECK (tipo IN ('status','comentario','info')),
  lida          INTEGER NOT NULL DEFAULT 0,
  ocorrencia_id INTEGER REFERENCES ocorrencias(id) ON DELETE SET NULL,
  created_at    TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ocorrencias_usuario    ON ocorrencias(usuario_id);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_categoria  ON ocorrencias(categoria_id);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_status     ON ocorrencias(status);
CREATE INDEX IF NOT EXISTS idx_comentarios_ocorrencia ON comentarios(ocorrencia_id);
CREATE INDEX IF NOT EXISTS idx_notificacoes_usuario   ON notificacoes(usuario_id);
CREATE INDEX IF NOT EXISTS idx_historico_ocorrencia   ON historico_ocorrencias(ocorrencia_id);

CREATE TRIGGER IF NOT EXISTS trg_usuarios_updated AFTER UPDATE ON usuarios FOR EACH ROW
BEGIN UPDATE usuarios SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_ocorrencias_updated AFTER UPDATE ON ocorrencias FOR EACH ROW
BEGIN UPDATE ocorrencias SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id; END;
-- (categorias padrão e admin são criados pelo setup_db.py)
