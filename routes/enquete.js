const express = require('express');
const router = express.Router();
const db = require('../db');


function calcularStatus(dataInicio, dataFim) {
  const agora = new Date();
  const inicio = new Date(dataInicio);
  const fim = new Date(dataFim);

  if (agora < inicio) return 'Não iniciada';
  if (agora > fim) return 'Finalizada';
  return 'Em andamento';
}


router.get('/criar-teste', (req, res) => {
  const titulo = 'Qual sua comida favorita?';
  const data_inicio = '2026-03-19 00:00:00';
  const data_fim = '2026-03-25 23:59:59';
  const opcoes = ['Pizza', 'Hamburguer', 'Sushi'];

  db.query(
    'INSERT INTO enquetes (titulo, data_inicio, data_fim) VALUES (?, ?, ?)',
    [titulo, data_inicio, data_fim],
    (err, result) => {
      if (err) return res.status(500).json(err);

      const enqueteId = result.insertId;

      opcoes.forEach(op => {
        db.query(
          'INSERT INTO opcoes (enquete_id, texto) VALUES (?, ?)',
          [enqueteId, op]
        );
      });

      res.send('Enquete criada!');
    }
  );
});


router.post('/', (req, res) => {
  const { titulo, data_inicio, data_fim, opcoes } = req.body;

  if (!titulo || !data_inicio || !data_fim || !opcoes) {
    return res.status(400).json({ erro: 'Preencha todos os campos' });
  }

  if (!Array.isArray(opcoes) || opcoes.length < 3) {
    return res.status(400).json({ erro: 'A enquete deve ter no mínimo 3 opções' });
  }

  db.query(
    'INSERT INTO enquetes (titulo, data_inicio, data_fim) VALUES (?, ?, ?)',
    [titulo, data_inicio, data_fim],
    (err, result) => {
      if (err) return res.status(500).json(err);

      const enqueteId = result.insertId;

      let pendentes = opcoes.length;
      let erroOpcao = false;

      opcoes.forEach(op => {
        db.query(
          'INSERT INTO opcoes (enquete_id, texto) VALUES (?, ?)',
          [enqueteId, op],
          (errOpcaoInsert) => {
            if (erroOpcao) return;

            if (errOpcaoInsert) {
              erroOpcao = true;
              return res.status(500).json(errOpcaoInsert);
            }

            pendentes--;

            if (pendentes === 0) {
              res.json({ msg: 'Enquete criada com sucesso', id: enqueteId });
            }
          }
        );
      });
    }
  );
});


router.get('/', (req, res) => {
  db.query('SELECT * FROM enquetes ORDER BY id DESC', (err, enquetes) => {
    if (err) return res.status(500).json(err);

    const resultado = enquetes.map(e => ({
      ...e,
      status: calcularStatus(e.data_inicio, e.data_fim)
    }));

    res.json(resultado);
  });
});


router.post('/votar/:opcaoId', (req, res) => {
  const opcaoId = req.params.opcaoId;

  const sql = `
    SELECT 
      opcoes.id AS opcao_id,
      enquetes.data_inicio,
      enquetes.data_fim
    FROM opcoes
    INNER JOIN enquetes ON opcoes.enquete_id = enquetes.id
    WHERE opcoes.id = ?
  `;

  db.query(sql, [opcaoId], (err, resultado) => {
    if (err) return res.status(500).json(err);

    if (resultado.length === 0) {
      return res.status(404).json({ erro: 'Opção não encontrada' });
    }

    const opcao = resultado[0];
    const status = calcularStatus(opcao.data_inicio, opcao.data_fim);

    if (status !== 'Em andamento') {
      return res.status(400).json({ erro: 'A enquete não está ativa para votação' });
    }

    db.query(
      'UPDATE opcoes SET votos = votos + 1 WHERE id = ?',
      [opcaoId],
      (errUpdate) => {
        if (errUpdate) return res.status(500).json(errUpdate);
        res.json({ msg: 'Voto computado com sucesso' });
      }
    );
  });
});


router.get('/:id', (req, res) => {
  const id = req.params.id;

  db.query('SELECT * FROM enquetes WHERE id = ?', [id], (err, enquete) => {
    if (err) return res.status(500).json(err);

    if (enquete.length === 0) {
      return res.json({ enquete: [], opcoes: [] });
    }

    db.query(
      'SELECT * FROM opcoes WHERE enquete_id = ? ORDER BY id ASC',
      [id],
      (errOpcoes, opcoes) => {
        if (errOpcoes) return res.status(500).json(errOpcoes);

        const enqueteComStatus = {
          ...enquete[0],
          status: calcularStatus(enquete[0].data_inicio, enquete[0].data_fim)
        };

        res.json({ enquete: [enqueteComStatus], opcoes });
      }
    );
  });
});


router.put('/:id', (req, res) => {
  const { titulo, data_inicio, data_fim } = req.body;
  const id = req.params.id;

  if (!titulo || !data_inicio || !data_fim) {
    return res.status(400).json({ erro: 'Preencha título, data de início e data de fim' });
  }

  db.query(
    'UPDATE enquetes SET titulo = ?, data_inicio = ?, data_fim = ? WHERE id = ?',
    [titulo, data_inicio, data_fim, id],
    (err, result) => {
      if (err) return res.status(500).json(err);

      if (result.affectedRows === 0) {
        return res.status(404).json({ erro: 'Enquete não encontrada' });
      }

      res.json({ msg: 'Enquete atualizada com sucesso' });
    }
  );
});


router.delete('/:id', (req, res) => {
  const id = req.params.id;

  db.query('DELETE FROM opcoes WHERE enquete_id = ?', [id], (err) => {
    if (err) return res.status(500).json(err);

    db.query('DELETE FROM enquetes WHERE id = ?', [id], (err2, result) => {
      if (err2) return res.status(500).json(err2);

      if (result.affectedRows === 0) {
        return res.status(404).json({ erro: 'Enquete não encontrada' });
      }

      res.json({ msg: 'Enquete deletada com sucesso' });
    });
  });
});

module.exports = router;