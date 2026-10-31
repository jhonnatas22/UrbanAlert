-- ============================================================
-- UrbanAlert - Schema do Banco de Dados (PostgreSQL)
-- Pode ser executado várias vezes (idempotente).
-- ============================================================

CREATE TABLE IF NOT EXISTS usuarios (
  id          SERIAL          PRIMARY KEY,
  nome        VARCHAR(100)    NOT NULL,
  email       VARCHAR(150)    NOT NULL UNIQUE,
  senha_hash  VARCHAR(255)    NOT NULL,
  role        VARCHAR(10)     NOT NULL DEFAULT 'cidadao' CHECK (role IN ('admin','fiscal','cidadao')),
  bio         TEXT,
  ativo       BOOLEAN         NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categorias (
  id          SERIAL          PRIMARY KEY,
  nome        VARCHAR(100)    NOT NULL,
  icone       VARCHAR(10),
  cor         VARCHAR(7)      DEFAULT '#74b9ff',
  descricao   TEXT,
  ativo       BOOLEAN         NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ocorrencias (
  id            SERIAL          PRIMARY KEY,
  titulo        VARCHAR(200)    NOT NULL,
  descricao     TEXT            NOT NULL,
  endereco      VARCHAR(255)    NOT NULL,
  status        VARCHAR(20)     NOT NULL DEFAULT 'Aberta'
                CHECK (status IN ('Aberta','Em Análise','Em Execução','Resolvida','Encerrada')),
  prioridade    VARCHAR(10)     NOT NULL DEFAULT 'Média' CHECK (prioridade IN ('Baixa','Média','Alta')),
  lat           NUMERIC(10,6),
  lng           NUMERIC(10,6),
  fotos         JSONB           NOT NULL DEFAULT '[]'::jsonb,
  categoria_id  INTEGER         NOT NULL REFERENCES categorias(id) ON DELETE RESTRICT,
  usuario_id    INTEGER         NOT NULL REFERENCES usuarios(id)   ON DELETE CASCADE,
  created_at    TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS comentarios (
  id            SERIAL          PRIMARY KEY,
  texto         TEXT            NOT NULL,
  ocorrencia_id INTEGER         NOT NULL REFERENCES ocorrencias(id) ON DELETE CASCADE,
  usuario_id    INTEGER         NOT NULL REFERENCES usuarios(id)    ON DELETE CASCADE,
  created_at    TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS historico_ocorrencias (
  id            SERIAL          PRIMARY KEY,
  ocorrencia_id INTEGER         NOT NULL REFERENCES ocorrencias(id) ON DELETE CASCADE,
  usuario_id    INTEGER         NOT NULL REFERENCES usuarios(id)    ON DELETE CASCADE,
  acao          VARCHAR(255)    NOT NULL,
  created_at    TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notificacoes (
  id            SERIAL          PRIMARY KEY,
  usuario_id    INTEGER         NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  titulo        VARCHAR(150)    NOT NULL,
  mensagem      TEXT            NOT NULL,
  tipo          VARCHAR(10)     NOT NULL DEFAULT 'info' CHECK (tipo IN ('status','comentario','info')),
  lida          BOOLEAN         NOT NULL DEFAULT FALSE,
  ocorrencia_id INTEGER         REFERENCES ocorrencias(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_ocorrencias_usuario    ON ocorrencias(usuario_id);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_categoria  ON ocorrencias(categoria_id);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_status     ON ocorrencias(status);
CREATE INDEX IF NOT EXISTS idx_comentarios_ocorrencia ON comentarios(ocorrencia_id);
CREATE INDEX IF NOT EXISTS idx_notificacoes_usuario   ON notificacoes(usuario_id);
CREATE INDEX IF NOT EXISTS idx_historico_ocorrencia   ON historico_ocorrencias(ocorrencia_id);

-- updated_at automático (equivale ao ON UPDATE CURRENT_TIMESTAMP do MySQL)
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_usuarios_updated    ON usuarios;
CREATE TRIGGER trg_usuarios_updated    BEFORE UPDATE ON usuarios    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_ocorrencias_updated ON ocorrencias;
CREATE TRIGGER trg_ocorrencias_updated BEFORE UPDATE ON ocorrencias FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Categorias padrão (só insere se a tabela estiver vazia)
INSERT INTO categorias (nome, icone, cor, descricao)
SELECT * FROM (VALUES
  ('Buraco na Via',      '🕳️', '#e17055', 'Buracos e irregularidades no pavimento'),
  ('Iluminação Pública', '💡', '#fdcb6e', 'Postes apagados ou com defeito'),
  ('Descarte Irregular', '🗑️', '#00b894', 'Lixo ou entulho depositado irregularmente'),
  ('Vandalismo',         '🎨', '#e94560', 'Pichação, depredação de bens públicos'),
  ('Alagamento',         '🌊', '#74b9ff', 'Pontos de alagamento e inundação'),
  ('Árvore/Vegetação',   '🌳', '#55efc4', 'Árvores caídas, poda necessária')
) AS v(nome, icone, cor, descricao)
WHERE NOT EXISTS (SELECT 1 FROM categorias);
-- (o usuário admin é criado pelo setup_db.py, com hash bcrypt gerado na hora)
