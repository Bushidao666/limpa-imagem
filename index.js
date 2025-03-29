const express = require('express');
const sharp = require('sharp');

const app = express();
// Aumentar o limite se estiver processando imagens muito grandes em base64
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));


// Função Centralizada de Processamento de Imagem
async function processImageForEvasion(base64, options = {}) {
    const {
        forceResize = true,      // Forçar redimensionamento para reamostragem?
        noiseSigma = 8.0,        // Intensidade do ruído Gaussiano (experimente 5.0 a 15.0+)
        blurSigma = 0.5,         // Intensidade do desfoque Gaussiano (experimente 0.4 a 0.8)
        varyQuality = true,      // Variar a qualidade JPEG final?
        baseJpegQuality = 85,    // Qualidade base (se varyQuality=true, varia em torno disso)
        modulateColor = true,    // Aplicar leve variação aleatória de cor/brilho?
        targetFormat = 'jpeg'    // Formato de saída ('jpeg' ou 'png', etc.) - PNG não terá qualidade variável
    } = options;

    if (!base64) {
        throw new Error('Imagem (base64) não fornecida.');
    }

    const inputBuffer = Buffer.from(base64, 'base64');
    let imageProcessor = sharp(inputBuffer);
    const originalMetadata = await imageProcessor.metadata(); // Pega metadados originais para o resize

    // 1. Forçar Reamostragem via Redimensionamento Mínimo
    if (forceResize && originalMetadata.width && originalMetadata.height) {
        const tempWidth = Math.max(10, Math.floor(originalMetadata.width * 0.995));
        const tempHeight = Math.max(10, Math.floor(originalMetadata.height * 0.995));
        // Reduz ligeiramente e depois volta ao original para forçar interpolação
        imageProcessor = imageProcessor.resize(tempWidth, tempHeight, { fit: 'inside' });
        imageProcessor = imageProcessor.resize(originalMetadata.width, originalMetadata.height);
    }

    // 2. Adicionar Desfoque Gaussiano Sutil
    if (blurSigma > 0) {
        imageProcessor = imageProcessor.blur(blurSigma);
    }

    // 3. Adicionar Ruído/Granulação Gaussiana
    if (noiseSigma > 0) {
        imageProcessor = imageProcessor.noise(noiseSigma);
    }

    // 4. Leve Modulação Aleatória de Cor (Brilho/Saturação)
    if (modulateColor) {
        // Variação muito pequena (ex: 0.99 a 1.01)
        const brightnessFactor = 1 + (Math.random() * 0.02 - 0.01);
        const saturationFactor = 1 + (Math.random() * 0.02 - 0.01);
        // Hue shift é mais perceptível, usar com cuidado ou omitir
        // const hueShift = Math.random() * 2 - 1; // Rotação de -1 a +1 grau
        imageProcessor = imageProcessor.modulate({
            brightness: brightnessFactor,
            saturation: saturationFactor,
            // hue: hueShift
        });
    }

    // 5. Preparar Opções de Formato de Saída e Remover Metadados
    let outputOptions = {};
    if (targetFormat === 'jpeg') {
        let finalQuality = baseJpegQuality;
        if (varyQuality) {
            // Varia a qualidade em +/- 5 (ex: 80 a 90 se base for 85)
            finalQuality = Math.floor(baseJpegQuality - 5 + Math.random() * 11);
            finalQuality = Math.max(70, Math.min(95, finalQuality)); // Limita entre 70 e 95
        }
        outputOptions = {
            quality: finalQuality,
            mozjpeg: true, // Tenta usar mozjpeg para compressão diferente
            // progressive: true // Outra opção a testar
        };
        imageProcessor = imageProcessor.jpeg(outputOptions);
    } else if (targetFormat === 'png') {
        // PNG tem compressão lossless, qualidade não se aplica da mesma forma
        outputOptions = {
            compressionLevel: 9, // Máxima compressão (menor tamanho, mais lento)
            // progressive: true
        };
         imageProcessor = imageProcessor.png(outputOptions);
    } else {
         // Fallback para JPEG se formato desconhecido
         imageProcessor = imageProcessor.jpeg({ quality: baseJpegQuality, mozjpeg: true });
    }

    // Sempre remove todos os metadados na conversão final e define um DPI padrão
    const finalBuffer = await imageProcessor
        .withMetadata({ density: 72 }) // Remove tudo e define DPI comum
        .toBuffer();

    return finalBuffer;
}

// --- Endpoints ---

// 🔹 Endpoint que retorna BASE64
app.post('/process-image-base64', async (req, res) => {
    try {
        const { base64, options } = req.body;
        if (!base64) return res.status(400).json({ error: 'Imagem (base64) não fornecida.' });

        const finalBuffer = await processImageForEvasion(base64, options);
        const processedBase64 = finalBuffer.toString('base64');
        res.json({ processedBase64 });

    } catch (err) {
        console.error('Erro ao processar imagem (base64):', err.message);
        res.status(500).json({ error: err.message || 'Erro interno ao processar imagem' });
    }
});

// 🔹 Endpoint que retorna BINÁRIO
app.post('/process-image-binary', async (req, res) => {
    try {
        const { base64, options } = req.body;
        if (!base64) return res.status(400).send('Imagem (base64) não fornecida.');

        const finalBuffer = await processImageForEvasion(base64, options);

        const format = options?.targetFormat || 'jpeg'; // Pega o formato das opções ou usa jpeg
        const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
        const filename = `imagem-processada.${format}`;

        res.set('Content-Type', mimeType);
        res.set('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(finalBuffer);

    } catch (err) {
        console.error('Erro ao processar imagem (binário):', err.message);
        res.status(500).send(err.message || 'Erro interno ao processar imagem');
    }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`🚀 Processador de Imagens Anti-Zuck v3 rodando na porta ${port}`));
