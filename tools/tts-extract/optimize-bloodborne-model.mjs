// Post-process one reconstructed Bloodborne GLB for browser delivery. The
// resulting geometry remains full fidelity but is quantized and Meshopt-
// compressed; embedded textures are resized and converted to WebP.

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  throw new Error('usage: node optimize-bloodborne-model.mjs <input.glb> <output.glb>');
}

// Load Sharp before glTF-Transform's fallback image codecs. On Windows both
// dependency trees include native GLib symbols, so the reverse order can bind
// Sharp against the wrong DLL before its own runtime directory is registered.
const { default: sharp } = await import('sharp');
const { NodeIO } = await import('@gltf-transform/core');
const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
const { dedup, meshopt, prune, textureCompress, weld } = await import('@gltf-transform/functions');
const { MeshoptEncoder } = await import('meshoptimizer');
await MeshoptEncoder.ready;
sharp.concurrency(1);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const document = await io.read(input);

await document.transform(
  dedup(),
  prune(),
  weld({ tolerance: 1e-6 }),
  // Normal maps are vector data, not color. Lossy WebP's YUV conversion can
  // shift channels enough to bend normals or introduce a negative Z lobe, so
  // retain these maps with near-lossless RGB WebP after resizing.
  textureCompress({
    encoder: sharp,
    targetFormat: 'webp',
    resize: [512, 512],
    slots: /^normalTexture$/,
    nearLossless: true,
    quality: 70,
    effort: 60,
  }),
  textureCompress({
    encoder: sharp,
    targetFormat: 'webp',
    resize: [1024, 1024],
    slots: /^(?!normalTexture$).*$/,
    quality: 82,
    effort: 60,
  }),
  meshopt({
    encoder: MeshoptEncoder,
    level: 'high',
    quantizePosition: 14,
    quantizeNormal: 8,
    quantizeTexcoord: 12,
  }),
);

await io.write(output, document);
