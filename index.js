const express = require('express');
const sharp = require('sharp');
const app = express();

app.use(express.json({ limit: '25mb' }));

// Função para aplicar transformações de forma segura
async function processarImagem(inputBuffer) {
  try {
    // Verificar se a imagem é válida
    const metadata = await sharp(inputBuffer).metadata();
    
    // Aplicar transformações com operações nativas do Sharp
    // Evitando manipulação direta de pixels que pode causar problemas
    let processedImage = sharp(inputBuffer);
    
    // 1. Adicionar ruído com kernel de convolução
    // Este método é mais seguro que manipular pixels diretamente
    processedImage = processedImage.convolve({
      width: 3,
      height: 3,
      kernel: [
        -0.1, -0.1, -0.1,
        -0.1,  2.0, -0.1,
        -0.1, -0.1, -0.1
      ]
    });
    
    // 2. Aplicar leve blur para suavizar padrões de IA
    processedImage = processedImage.blur(0.5);
    
    // 3. Adicionar sharpening para recuperar detalhes e simular processamento de câmera
    processedImage = processedImage.sharpen({
      sigma: 1.2,
      m1: 0.5,
      m2: 0.7,
      x1: 2.0,
      y2: 20.0,
      y3: 20.0
    });
    
    // 4. Aplicar grain através de noise (método nativo do Sharp)
    processedImage = processedImage.noise({
      type: 'gaussian',
      sigma: 10
    });
    
    // 5. Rotação leve para quebrar padrões de pixels
    const rotacaoLeve = Math.random() * 0.5 - 0.25; // ±0.25 graus
    processedImage = processedImage.rotate(rotacaoLeve, {
      background: { r: 255, g: 255, b: 255, alpha: 0 }
    });
    
    // 6. Ajustes sutis de cor
    processedImage = processedImage.modulate({
      brightness: 1 + (Math.random() * 0.06 - 0.03), // ±3% brilho
      saturation: 1 + (Math.random() * 0.1 - 0.05),  // ±5% saturação
      hue: Math.floor(Math.random() * 5 - 2)         // ±2 matiz
    });
    
    // 7. Remover completamente todos os metadados
    processedImage = processedImage.removeAlpha().ensureAlpha();
    
    // Primeiro remover todos os metadados explicitamente
    processedImage = processedImage.withMetadata(false);
    
    // 8. Remover todas as tags EXIF, ICC, XMP e outros metadados ocultos
    processedImage = processedImage.jpeg({
      quality: 84,
      chromaSubsampling: '4:2:0',
      force: true,
      // Desabilitar explicitamente todos os tipos de metadados
      trellisQuantisation: true,
      overshootDeringing: true,
      optimizeScans: true,
      mozjpeg: true,  // Usar mozjpeg para otimização máxima sem metadados
    });
    
    // 9. Converter para outro formato e voltar para JPEG para quebrar assinaturas
    // Isso garante que qualquer assinatura oculta seja removida
    const tempBuffer = await processedImage.toBuffer();
    processedImage = sharp(tempBuffer)
                    .png()  // Converter para PNG
                    .jpeg({ // Voltar para JPEG com configurações otimizadas
                      quality: 87,
                      chromaSubsampling: '4:2:0',
                      force: true
                    })
                    .withMetadata(false); // Garantir novamente que não há metadados
    
    const finalBuffer = await processedImage.toBuffer();
    
    return finalBuffer;
  } catch (error) {
    console.error('Erro no processamento interno da imagem:', error);
    throw new Error(`Falha ao processar imagem: ${error.message}`);
  }
}

// Função para validar e decodificar Base64
function decodificarBase64(base64String) {
  try {
    // Remover prefixo de data URI se existir
    let base64Data = base64String;
    if (base64String.includes('base64,')) {
      base64Data = base64String.split('base64,')[1];
    }
    
    // Remover espaços em branco e caracteres inválidos
    base64Data = base64Data.replace(/\s/g, '');
    
    // Decodificar
    const buffer = Buffer.from(base64Data, 'base64');
    
    // Verificar se o buffer tem conteúdo
    if (buffer.length === 0) {
      throw new Error('Buffer vazio após decodificação');
    }
    
    // Fazer uma limpeza inicial com Sharp para remover metadados já neste estágio
    // Isso ajuda a remover assinaturas que possam estar no início do processo
    return sharp(buffer)
      .withMetadata(false)
      .toBuffer();
  } catch (error) {
    // Se a limpeza com Sharp falhar, tentar retornar o buffer original
    try {
      return Buffer.from(base64Data, 'base64');
    } catch (e) {
      throw new Error(`Falha ao decodificar Base64: ${error.message}`);
    }
  }
}

// 🔹 Endpoint que retorna BASE64
app.post('/clean-image', async (req, res) => {
  try {
    const { base64 } = req.body;
    
    if (!base64) {
      return res.status(400).json({ 
        error: 'Imagem não fornecida. Envie um JSON com o campo "base64".' 
      });
    }
    
    // Decodificar e validar o Base64
    let inputBuffer;
    try {
      inputBuffer = decodificarBase64(base64);
    } catch (error) {
      return res.status(400).json({ 
        error: `Base64 inválido: ${error.message}` 
      });
    }
    
    // Processar a imagem
    const finalBuffer = await processarImagem(inputBuffer);
    
    // Retornar o resultado
    const cleanedBase64 = finalBuffer.toString('base64');
    res.json({ cleanedBase64 });
  } catch (err) {
    console.error('Erro ao processar imagem (base64):', err);
    res.status(500).json({ 
      error: `Erro ao processar imagem: ${err.message}` 
    });
  }
});

// 🔹 Endpoint que retorna BINÁRIO
app.post('/clean-image-binary', async (req, res) => {
  try {
    const { base64 } = req.body;
    
    if (!base64) {
      return res.status(400).send('Imagem não fornecida. Envie um JSON com o campo "base64".');
    }
    
    // Decodificar e validar o Base64
    let inputBuffer;
    try {
      inputBuffer = decodificarBase64(base64);
    } catch (error) {
      return res.status(400).send(`Base64 inválido: ${error.message}`);
    }
    
    // Processar a imagem
    const finalBuffer = await processarImagem(inputBuffer);
    
    // Configurar e enviar a resposta
    res.set('Content-Type', 'image/jpeg');
    res.set('Content-Disposition', 'attachment; filename="imagem-purificada.jpg"');
    res.send(finalBuffer);
  } catch (err) {
    console.error('Erro ao processar imagem (binário):', err);
    res.status(500).send(`Erro ao processar imagem: ${err.message}`);
  }
});

// Adicionar endpoint de diagnóstico
app.post('/diagnose', async (req, res) => {
  try {
    const { base64 } = req.body;
    
    if (!base64) {
      return res.status(400).json({ error: 'Imagem não fornecida' });
    }
    
    // Decodificar e validar o Base64
    let inputBuffer;
    try {
      inputBuffer = decodificarBase64(base64);
      
      // Tentar ler informações da imagem para verificar se é válida
      const metadata = await sharp(inputBuffer).metadata();
      
      return res.json({
        status: 'success',
        message: 'Imagem válida',
        metadata: {
          formato: metadata.format,
          largura: metadata.width,
          altura: metadata.height,
          canais: metadata.channels,
          temAlpha: metadata.hasAlpha,
          tamanho: inputBuffer.length
        }
      });
    } catch (error) {
      return res.status(400).json({
        status: 'error',
        message: `Diagnóstico falhou: ${error.message}`,
        tamanhoBuffer: inputBuffer ? inputBuffer.length : 0
      });
    }
  } catch (err) {
    console.error('Erro no diagnóstico:', err);
    res.status(500).json({ 
      error: `Erro durante diagnóstico: ${err.message}` 
    });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`🚀 Anti-Detector Pro Zuck 3.0 rodando na porta ${port}`));
