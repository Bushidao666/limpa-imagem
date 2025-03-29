const express = require('express');
const sharp = require('sharp');

const app = express();
// Ajuste o limite conforme necessário para suas imagens base64
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// --- Função de Processamento "Tudo Incluído" ---
async function processImageForEvasionDefaults(base64, options = {}) {
    // Define valores padrão fortes/recomendados se não forem fornecidos
    const defaultOptions = {
        forceResize: true,         // LIGADO por padrão
        noiseSigma: 10.0,          // Ruído/Granulação forte por padrão
        blurSigma: 0.6,            // Desfoque sutil por padrão
        varyQuality: true,         // LIGADO por padrão
        baseJpegQuality: 85,       // Qualidade base padrão
        modulateColor: true,       // LIGADO por padrão (variação sutil)
        posterizeLevels: 24,       // Posterização leve/média por padrão (bom p/ cartoon)
        medianFilterSize: 0,       // DESLIGADO por padrão (use 3 para ativar sutilmente)
        targetFormat: 'jpeg'       // Formato padrão
    };

    // Mescla as opções fornecidas com os padrões (opções fornecidas têm prioridade)
    const config = { ...defaultOptions, ...options };

    if (!base64) {
        throw new Error('Imagem (base64) não fornecida.');
    }

    const inputBuffer = Buffer.from(base64, 'base64');
    let imageProcessor = sharp(inputBuffer);
    const originalMetadata = await imageProcessor.metadata(); // Necessário para o resize

    console.log(`Iniciando processamento com config:`, config);

    // 1. Forçar Reamostragem via Redimensionamento Mínimo
    if (config.forceResize && originalMetadata.width && originalMetadata.height) {
        console.log('Aplicando resize...');
        const tempWidth = Math.max(10, Math.floor(originalMetadata.width * 0.995));
        const tempHeight = Math.max(10, Math.floor(originalMetadata.height * 0.995));
        imageProcessor = imageProcessor.resize(tempWidth, tempHeight, { fit: 'inside' });
        imageProcessor = imageProcessor.resize(originalMetadata.width, originalMetadata.height);
    }

    // 2. Adicionar Desfoque Gaussiano Sutil
    if (config.blurSigma > 0) {
        console.log(`Aplicando blur (sigma: ${config.blurSigma})...`);
        imageProcessor = imageProcessor.blur(config.blurSigma);
    }

    // 3. Adicionar Ruído/Granulação Gaussiana
    if (config.noiseSigma > 0) {
        console.log(`Aplicando noise (sigma: ${config.noiseSigma})...`);
        imageProcessor = imageProcessor.noise(config.noiseSigma);
    }

    // 4. Leve Modulação Aleatória de Cor (Brilho/Saturação)
    if (config.modulateColor) {
        console.log('Aplicando modulate...');
        const brightnessFactor = 1 + (Math.random() * 0.02 - 0.01); // +/- 1%
        const saturationFactor = 1 + (Math.random() * 0.02 - 0.01); // +/- 1%
        imageProcessor = imageProcessor.modulate({
            brightness: brightnessFactor,
            saturation: saturationFactor,
        });
    }

    // 5. Posterização (Reduz gradientes suaves)
    if (config.posterizeLevels > 1) {
        console.log(`Aplicando posterize (levels: ${config.posterizeLevels})...`);
        imageProcessor = imageProcessor.posterise(config.posterizeLevels);
    }

     // 6. Filtro Mediana (Suaviza ruído/detalhes finos de forma diferente do blur)
    if (config.medianFilterSize > 0 && config.medianFilterSize % 2 !== 0) { // Precisa ser ímpar >= 3
        console.log(`Aplicando median filter (size: ${config.medianFilterSize})...`);
        imageProcessor = imageProcessor.median(config.medianFilterSize);
    } else if (config.medianFilterSize > 0) {
         console.warn(`Median filter size (${config.medianFilterSize}) inválido. Usando 0 (desligado). Deve ser ímpar >= 3.`);
    }


    // 7. Preparar Opções de Formato de Saída e Remover Metadados
    let outputOptions = {};
    let finalMimeType = 'image/jpeg';
    let finalExtension = 'jpg';

    if (config.targetFormat === 'jpeg') {
        let finalQuality = config.baseJpegQuality;
        if (config.varyQuality) {
            finalQuality = Math.floor(config.baseJpegQuality - 5 + Math.random() * 11);
            finalQuality = Math.max(70, Math.min(95, finalQuality)); // Limita qualidade
        }
        console.log(`Convertendo para JPEG (quality: ${finalQuality})...`);
        outputOptions = {
            quality: finalQuality,
            mozjpeg: true, // Tenta usar compressão diferente
        };
        imageProcessor = imageProcessor.jpeg(outputOptions);
        finalMimeType = 'image/jpeg';
        finalExtension = 'jpg';
    } else if (config.targetFormat === 'png') {
        console.log('Convertendo para PNG...');
         outputOptions = {
            compressionLevel: 9, // Compressão máxima (mais lento)
            // progressive: true // Pode testar
         };
          imageProcessor = imageProcessor.png(outputOptions);
          finalMimeType = 'image/png';
          finalExtension = 'png';
    } else {
         // Fallback para JPEG se formato desconhecido
         console.warn(`Formato de saída '${config.targetFormat}' não suportado, usando JPEG.`);
         imageProcessor = imageProcessor.jpeg({ quality: config.baseJpegQuality, mozjpeg: true });
    }

    // Remove TODOS os metadados e define um DPI comum
    console.log('Removendo metadados...');
    const finalBuffer = await imageProcessor
        .withMetadata({ density: 72 })
        .toBuffer();

    console.log('Processamento concluído.');
    return { buffer: finalBuffer, mimeType: finalMimeType, extension: finalExtension };
}

// --- Endpoints ---

// 🔹 Endpoint que retorna BASE64
app.post('/process-base64', async (req, res) => {
    try {
        // Pega base64 e *opcionalmente* as opções do corpo da requisição
        const { base64, options } = req.body;
        if (!base64) return res.status(400).json({ error: 'Imagem (base64) não fornecida.' });

        // Chama a função de processamento (usará padrões se options não for enviado)
        const { buffer } = await processImageForEvasionDefaults(base64, options);
        const processedBase64 = buffer.toString('base64');
        res.json({ processedBase64 });

    } catch (err) {
        console.error('Erro ao processar imagem (base64):', err.message);
        res.status(500).json({ error: err.message || 'Erro interno ao processar imagem' });
    }
});

// 🔹 Endpoint que retorna BINÁRIO
app.post('/process-binary', async (req, res) => {
    try {
        // Pega base64 e *opcionalmente* as opções do corpo da requisição
        const { base64, options } = req.body;
        if (!base64) return res.status(400).send('Imagem (base64) não fornecida.');

        // Chama a função de processamento (usará padrões se options não for enviado)
        const { buffer, mimeType, extension } = await processImageForEvasionDefaults(base64, options);

        const filename = `imagem-processada-${Date.now()}.${extension}`; // Nome de arquivo único

        res.set('Content-Type', mimeType);
        res.set('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(buffer);

    } catch (err) {
        console.error('Erro ao processar imagem (binário):', err.message);
        res.status(500).send(err.message || 'Erro interno ao processar imagem');
    }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`🚀 Processador de Imagens Anti-Zuck v5 (Defaults) rodando na porta ${port}`));
