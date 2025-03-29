const express = require('express');
const sharp = require('sharp');
const app = express();

app.use(express.json({ limit: '25mb' }));

// Função para aplicar transformações avançadas contra detecção de IA
async function processarImagem(inputBuffer) {
  // Primeiro extrair dimensões da imagem
  const metadata = await sharp(inputBuffer).metadata();
  
  // Converter para raw para manipulação de pixels
  const { data, info } = await sharp(inputBuffer)
    .removeAlpha()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  
  // 1. Aplicar ruído não uniforme intenso
  for (let i = 0; i < data.length; i += 4) {
    // Aplicar diferentes níveis de ruído para R, G, B
    for (let j = 0; j < 3; j++) {
      // Ruído base significativo
      const ruido = (Math.random() * 8 - 4);
      
      // Adicionar padrão não-uniforme
      const position = i / 4;
      const x = position % info.width;
      const y = Math.floor(position / info.width);
      
      // Mais ruído nas bordas (como em fotos reais)
      const distanceFromEdge = Math.min(
        x, y, info.width - x, info.height - y
      ) / Math.min(info.width, info.height);
      
      // Ruído adicional nas bordas
      const ruidoBorda = 5 * (1 - distanceFromEdge) * 2;
      
      // Padrão aleatório ao longo da imagem para quebrar padrões de IA
      const ruidoPadrao = Math.sin(x/10) * Math.cos(y/8) * 3;
      
      // Aplicar todos os tipos de ruído
      data[i + j] = Math.min(255, Math.max(0, data[i + j] + ruido + ruidoBorda + ruidoPadrao));
    }
  }
  
  // Reconverter para imagem
  let processedImage = sharp(data, { 
    raw: { 
      width: info.width, 
      height: info.height, 
      channels: info.channels 
    } 
  });
  
  // 2. Criar e aplicar grain forte de filme
  const grainWidth = Math.ceil(info.width / 2) * 2;
  const grainHeight = Math.ceil(info.height / 2) * 2;
  const grainBuffer = Buffer.alloc(grainWidth * grainHeight * 4);
  
  // Preencher buffer com ruído granular não uniforme
  for (let i = 0; i < grainBuffer.length; i += 4) {
    // Grain mais intenso
    const grainValue = Math.floor(Math.random() * 255 * 1.2);
    grainBuffer[i] = grainBuffer[i + 1] = grainBuffer[i + 2] = grainValue;
    grainBuffer[i + 3] = 45; // Alpha um pouco mais alto para grain mais visível
  }
  
  const grainImage = sharp(grainBuffer, {
    raw: {
      width: grainWidth,
      height: grainHeight,
      channels: 4
    }
  }).resize(info.width, info.height);
  
  // Compositar o grain sobre a imagem
  processedImage = await processedImage
    .composite([{ input: await grainImage.toBuffer(), blend: 'overlay' }]);
  
  // 3. Adicionar leve blur não uniforme seguido de sharpening
  // Primeiro blur leve para quebrar padrões de pixels
  processedImage = processedImage.blur(0.7);
  
  // 4. Re-sharpening seletivo para simular pós-processamento de câmera
  processedImage = processedImage.sharpen({
    sigma: 1.2,
    m1: 0.5,
    m2: 0.7,
    x1: 2.0,
    y2: 20.0,
    y3: 20.0
  });
  
  // 5. Simular artefatos de compressão JPEG - removido daqui para evitar duplicação
  
  // 6. Adicionar leve rotação/transformação
  // Rotação muito leve (menos de 1 grau) para evitar padrões de pixels perfeitamente alinhados
  const rotacaoLeve = (Math.random() * 0.8 - 0.4);
  processedImage = processedImage.rotate(rotacaoLeve, {
    background: { r: 255, g: 255, b: 255, alpha: 0 }
  });
  
  // 7. Ajuste leve de cor para quebrar padrões de cor da IA
  processedImage = processedImage
    .modulate({
      brightness: 1 + (Math.random() * 0.1 - 0.05), // ±5% variação de brilho
      saturation: 1 + (Math.random() * 0.15 - 0.05), // ±5-10% variação de saturação
      hue: Math.floor(Math.random() * 7 - 3) // Leve alteração de matiz
    });
  
  // 8. Remover todos os metadados - usando a abordagem correta
  // Primeiro convertemos para JPEG que já remove a maioria dos metadados
  processedImage = processedImage.jpeg({ 
    quality: 83,
    chromaSubsampling: '4:2:0',
    force: true
  });
  
  // Depois usamos apenas o toBuffer sem withMetadata
  return processedImage.toBuffer();
}

// 🔹 Endpoint que retorna BASE64
app.post('/clean-image', async (req, res) => {
  try {
    const { base64 } = req.body;
    if (!base64) return res.status(400).json({ error: 'Imagem não fornecida.' });

    const inputBuffer = Buffer.from(base64, 'base64');
    
    // Aplicar todas as transformações anti-detecção
    const finalBuffer = await processarImagem(inputBuffer);
    
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
    const { base64 } = req.body;
    if (!base64) return res.status(400).send('Imagem não fornecida.');

    const inputBuffer = Buffer.from(base64, 'base64');
    
    // Aplicar todas as transformações anti-detecção
    const finalBuffer = await processarImagem(inputBuffer);
    
    res.set('Content-Type', 'image/jpeg');
    res.set('Content-Disposition', 'attachment; filename="imagem-purificada.jpg"');
    res.send(finalBuffer);
  } catch (err) {
    console.error('Erro ao processar imagem (binário):', err);
    res.status(500).send('Erro ao processar imagem');
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`🚀 Anti-Detector Pro Zuck 2.0 rodando na porta ${port}`));
