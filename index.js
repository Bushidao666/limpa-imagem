const express = require('express');
const sharp = require('sharp');

const app = express();
app.use(express.json({ limit: '20mb' }));

app.post('/clean-image', async (req, res) => {
  try {
    const { base64 } = req.body;
    const buffer = Buffer.from(base64, 'base64');

    const cleanedBuffer = await sharp(buffer)
      .png({ compressionLevel: 9 })
      .withMetadata({})
      .toBuffer();

    const cleanedBase64 = cleanedBuffer.toString('base64');
    res.json({ cleanedBase64 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao processar imagem' });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log('Servidor rodando na porta 3000');
});
