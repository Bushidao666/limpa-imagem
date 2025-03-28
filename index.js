const express = require('express');
const sharp = require('sharp');

const app = express();
app.use(express.json({ limit: '25mb' }));

// 🔹 Endpoint que retorna BASE64
app.post('/clean-image', async (req, res) => {
  try {
    const { base64, noise } = req.body;
    if (!base64) return res.status(400).json({ error: 'Imagem não fornecida.' });

    const inputBuffer = Buffer.from(base64, 'base64');
    let finalBuffer;

    if (noise) {
      const { data, info } = await sharp(inputBuffer)
        .removeAlpha()
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      for (let i = 0; i < data.length; i++) {
        data[i] = Math.min(255, Math.max(0, data[i] + (Math.random() * 2 - 1)));
      }

      finalBuffer = await sharp(data, {
        raw: {
          width: info.width,
          height: info.height,
          channels: info.channels
        }
      })
        .jpeg({ quality: 85 })
        .toBuffer();
    } else {
      finalBuffer = await sharp(inputBuffer)
        .jpeg({ quality: 85 })
        .withMetadata({ exif: false, icc: false })
        .toBuffer();
    }

    const cleanedBase64 = finalBuffer.toString('base64');
    res.json({ cleanedBase64 });

  } catch (err) {
    console.error('Erro ao processar imagem (base64):', err);
    res.status(500).json({ error: 'Erro ao processar imagem' });
  }
});

// 🔹 Endpoint que retorna BINÁRIO
app.post('/clean-image-binary', async (req, res) => {
  try {
    const { base64, noise } = req.body;
    if (!base64) return res.status(400).send('Imagem não fornecida.');

    const inputBuffer = Buffer.from(base64, 'base64');
    let finalBuffer;

    if (noise) {
      const { data, info } = await sharp(inputBuffer)
        .removeAlpha()
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      for (let i = 0; i < data.length; i++) {
        data[i] = Math.min(255, Math.max(0, data[i] + (Math.random() * 2 - 1)));
      }

      finalBuffer = await sharp(data, {
        raw: {
          width: info.width,
          height: info.height,
          channels: info.channels
        }
      })
        .jpeg({ quality: 85 })
        .toBuffer();
    } else {
      finalBuffer = await sharp(inputBuffer)
        .jpeg({ quality: 85 })
        .withMetadata({ exif: false, icc: false })
        .toBuffer();
    }

    res.set('Content-Type', 'image/jpeg');
    res.set('Content-Disposition', 'attachment; filename="imagem-purificada.jpg"');
    res.send(finalBuffer);

  } catch (err) {
    console.error('Erro ao processar imagem (binário):', err);
    res.status(500).send('Erro ao processar imagem');
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`🚀 Limpador Pro Zuck rodando na porta ${port}`));
